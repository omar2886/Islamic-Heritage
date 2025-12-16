import subprocess, time, asyncio, json, sys, os, signal

HOST = "127.0.0.1"; PORT = 8000
BASE = f"http://{HOST}:{PORT}"

def start_php():
    return subprocess.Popen(["php","-S",f"{HOST}:{PORT}", "-t","public"],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)

async def run_e2e():
    try:
        import pyppeteer
    except Exception:
        print("⚠️  pyppeteer no disponible. Instala con: python3 -m pip install pyppeteer")
        return 2

    from pyppeteer import launch

    browser = await launch(headless=True, args=["--no-sandbox","--disable-setuid-sandbox"])
    page = await browser.newPage()

    # Captura errores de consola
    console_errors = []
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)

    # 1) Builder render
    await page.goto(BASE + "/index.php?page=builder")
    await page.waitForSelector("#sec-spouses", timeout=4000)

    # 2) Set sexo=male y forzar invalidos: husband=1, wife=5 → validar
    await page.select("#sex","male")
    await page.type("#husband","1")
    await page.type("#wife","5")
    # estate
    await page.type("#estate","1000")
    # Preview
    await page.click("#btnPreview")
    await page.waitForSelector("#prePayload", timeout=2000)
    payload_txt = await page.evaluate("document.querySelector('#prePayload').textContent || ''")
    assert '"wife": 4' in payload_txt or '"wife","count": 4' in payload_txt, "wife no normalizada a 4"
    assert '"husband": 0' in payload_txt or '"husband","count": 0' in payload_txt, "husband no normalizado a 0"

    # 3) Padre vivo bloquea abuelos paternos y hermanos
    await page.type("#father","1")
    await page.type("#paternal_grandfather","1")
    await page.type("#full_brother","1")
    await page.click("#btnPreview")
    payload_txt = await page.evaluate("document.querySelector('#prePayload').textContent || ''")
    assert '"paternal_grandfather"' not in payload_txt, "abuelo paterno no excluido"
    assert '"full_brother"' not in payload_txt, "hermano pleno no excluido"

    # 4) Madre viva bloquea abuela materna
    await page.type("#mother","1")
    await page.type("#maternal_grandmother","1")
    await page.click("#btnPreview")
    payload_txt = await page.evaluate("document.querySelector('#prePayload').textContent || ''")
    assert '"maternal_grandmother"' not in payload_txt, "abuela materna no excluida"

    # 5) Error si no hay herederos
    # reset counts: set all inputs to 0 (where present)
    for sel in ["#husband","#wife","#son","#daughter","#father","#mother",
                "#paternal_grandfather","#paternal_grandmother","#maternal_grandmother",
                "#full_brother","#full_sister","#consanguine_brother","#consanguine_sister",
                "#uterine_brother","#uterine_sister"]:
        try:
            await page.evaluate(f"var el=document.querySelector('{sel}'); if(el) el.value='0';")
        except: pass
    await page.click("#btnPreview")
    err_visible = await page.evaluate("!document.querySelector('#preErrors').hidden")
    assert err_visible, "no aparece error cuando no hay herederos"

    # 5b) Bloquea cálculo si el monto es inválido
    await page.evaluate("sessionStorage.removeItem('heritage_payload')")
    await page.evaluate("""
(() => {
  const wife = document.querySelector('#wife');
  if (wife) {
    wife.value = '1';
    wife.dispatchEvent(new Event('input', { bubbles: true }));
  }
})();
""")
    await page.evaluate("""
(() => {
  const estate = document.querySelector('#estate');
  estate.value = '   ';
  estate.dispatchEvent(new Event('input', { bubbles: true }));
})();
""")
    await page.click("#btnCalc")
    await page.waitForTimeout(200)
    assert "/index.php?page=builder" in page.url, "se navegó pese a monto inválido"
    stored_invalid = await page.evaluate("sessionStorage.getItem('heritage_payload')")
    assert stored_invalid is None, "se guardó payload con monto inválido"
    err_text = await page.evaluate("document.querySelector('#preErrors').textContent || ''")
    assert 'monto' in err_text.lower(), "no se mostró error de monto"
    await page.evaluate("""
(() => {
  const estate = document.querySelector('#estate');
  estate.value = '1000';
  estate.dispatchEvent(new Event('input', { bubbles: true }));
})();
""")

    # 6) Handoff a results: sessionStorage
    await page.evaluate("document.querySelector('#wife').value='1'; document.querySelector('#daughter').value='1';")
    await page.click("#btnCalc")
    await page.waitForNavigation()
    assert "/index.php?page=results" in page.url, "no navegó a results"
    stored = await page.evaluate("sessionStorage.getItem('heritage_payload')")
    assert stored, "heritage_payload no está en sessionStorage"
    data = json.loads(stored)
    assert any(h.get('role')=='wife' for h in data.get('heirs',[])), "payload sin wife"
    assert any(h.get('role')=='daughter' for h in data.get('heirs',[])), "payload sin daughter"

    # 7) Consola sin errores
    bad = [m for m in console_errors if "Error" in m or "Uncaught" in m]
    assert not bad, f"errores de consola: {bad}"

    await browser.close()
    print("✅ E2E OK")
    return 0

def main():
    p = start_php()
    try:
        time.sleep(1.0)
        rc = asyncio.get_event_loop().run_until_complete(run_e2e())
        if rc == 2:
            print("⚠️  E2E degradado: ejecuta solo SMOKE si no puedes instalar pyppeteer.")
            sys.exit(0)
        sys.exit(rc)
    finally:
        try:
            p.send_signal(signal.SIGINT)
            p.terminate()
        except Exception:
            pass

if __name__ == "__main__":
    main()
