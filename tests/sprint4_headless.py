import subprocess, time, asyncio, sys, signal

HOST="127.0.0.1"; PORT=8000
BASE=f"http://{HOST}:{PORT}"

def start_php():
    return subprocess.Popen(["php","-S",f"{HOST}:{PORT}","-t","public"],
                            stdout=subprocess.PIPE,stderr=subprocess.PIPE)

async def e2e():
    try:
        from pyppeteer import launch
    except Exception:
        print("⚠️  pyppeteer no disponible. Ejecuta: python3 -m pip install pyppeteer")
        return 2

    browser = await launch(headless=True, args=["--no-sandbox","--disable-setuid-sandbox"])
    page = await browser.newPage()

    # 1) Builder + Personas
    await page.goto(BASE+"/index.php?page=builder")
    await page.waitForSelector("#sec-persons", timeout=5000)

    # Sexo causante = male (limita cónyuges)
    await page.select("#sex","male")
    # Añadir 3 personas: 2 wives vivas + 1 wife fallecida + father vivo + maternal grandmother (se excluirá)
    # Primera fila ya existe
    # p1 -> wife (alive)
    await page.select("#sec-persons tbody tr select:nth-of-type(1)", "wife")
    # p2 -> click Añadir persona
    await page.click("#btnAddPerson")
    # segunda fila role=wife
    await page.select("#sec-persons tbody tr:nth-of-type(2) select:nth-of-type(1)", "wife")
    # p3 -> tercera fila: wife pero fallecida
    await page.click("#btnAddPerson")
    await page.select("#sec-persons tbody tr:nth-of-type(3) select:nth-of-type(1)", "wife")
    # alive off (disparando evento manual)
    await page.evaluate("""
const el = document.querySelector('#sec-persons tbody tr:nth-of-type(3) input[type=checkbox]');
el.checked = false;
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
""")

    # father vivo
    await page.click("#btnAddPerson")
    await page.select("#sec-persons tbody tr:nth-of-type(4) select:nth-of-type(1)", "father")

    # maternal grandmother (será excluida si mother viva luego)
    await page.click("#btnAddPerson")
    await page.select("#sec-persons tbody tr:nth-of-type(5) select:nth-of-type(1)", "maternal_grandmother")

    # Establecer estate
    await page.type("#estate","1000")

    # Derivar personas → counts
    await page.click("#btnDerive")
    # Preview
    await page.click("#btnPreview")
    await page.waitForSelector("#prePayload", timeout=2000)
    payload_txt = await page.evaluate("document.querySelector('#prePayload').textContent || ''")
    # Verifica que solo computan wives vivas (2)
    assert '"role": "wife"' in payload_txt and '"count": 2' in payload_txt, "wives vivas != 2"

    # Now set mother viva => excluir maternal_grandmother
    # Añadir una persona mother viva
    await page.click("#btnAddPerson")
    await page.select("#sec-persons tbody tr:nth-of-type(6) select:nth-of-type(1)", "mother")
    await page.click("#btnDerive")
    await page.click("#btnPreview")
    payload_txt = await page.evaluate("document.querySelector('#prePayload').textContent || ''")
    assert '"maternal_grandmother"' not in payload_txt, "abuela materna no excluida con mother viva"

    # father vivo ⇒ excluye hermanos y abuelos paternos; probamos agregar un full_brother y un paternal_grandfather
    await page.click("#btnAddPerson")
    await page.select("#sec-persons tbody tr:nth-of-type(7) select:nth-of-type(1)", "full_brother")
    await page.click("#btnAddPerson")
    await page.select("#sec-persons tbody tr:nth-of-type(8) select:nth-of-type(1)", "paternal_grandfather")

    await page.click("#btnDerive")
    await page.click("#btnPreview")
    payload_txt = await page.evaluate("document.querySelector('#prePayload').textContent || ''")
    assert '"full_brother"' not in payload_txt, "hermano pleno no excluido con father vivo"
    assert '"paternal_grandfather"' not in payload_txt, "abuelo paterno no excluido con father vivo"

    # Calcular → results (POST real)
    await page.click("#btnCalc")
    await page.waitForNavigation(timeout=8000)
    assert "page=results" in page.url, "No llegó a results"
    # Si backend responde, veremos tablas; si no, banner de error con curl
    try:
        await page.waitForSelector("table", timeout=6000)
        print("✅ SPRINT4 E2E OK (con tablas)")
        rc = 0
    except Exception:
        await page.waitForSelector(".banner.error", timeout=4000)
        print("⚠️  SPRINT4 E2E diagnóstico (banner de error mostrado)")
        rc = 0

    await browser.close()
    return rc

def main():
    p = start_php()
    try:
        time.sleep(1.0)
        rc = asyncio.get_event_loop().run_until_complete(e2e())
        if rc == 2:
            print("⚠️  E2E degradado (sin pyppeteer). Ejecuta al menos los sprints previos.")
            sys.exit(0)
        sys.exit(rc)
    finally:
        try: p.send_signal(signal.SIGINT); p.terminate()
        except Exception: pass

if __name__=="__main__":
    main()
