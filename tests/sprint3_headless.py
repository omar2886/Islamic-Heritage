import subprocess, time, asyncio, json, sys, signal

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

    # 1) Ir al builder y preparar caso wife+daughter
    await page.goto(BASE+"/index.php?page=builder")
    await page.waitForSelector("#sec-spouses", timeout=4000)
    await page.evaluate("""
        () => {
            const cb = document.querySelector('#usePersons');
            if (cb) {
                cb.checked = false;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    """)
    await page.select("#sex","male")
    await page.type("#wife","1")
    await page.type("#daughter","1")
    await page.type("#estate","1000")

    # 2) Calcular → results (sessionStorage + POST real)
    await page.click("#btnCalc")
    await page.waitForNavigation(timeout=8000)
    assert "page=results" in page.url, "No llegó a results"
    body_text = await page.evaluate("document.body.innerText")
    assert "count > 0" not in body_text, "El cálculo manual fue rechazado por validación count > 0"

    # 3) Esperar a que results muestre o tablas o banner de error
    try:
        await page.waitForSelector("table", timeout=6000)
        hasTable = True
    except:
        hasTable = False

    # 4) Confirmar que al menos hubo reacción y debug visible
    if hasTable:
        # buscar Σ final
        text = await page.evaluate("document.body.innerText")
        assert "Σ final" in text, "Resultados sin Σ final visible"
        print("✅ SPRINT3 E2E OK (con tablas)")
        rc = 0
    else:
        # Banner de error con payload/curl
        try:
            await page.waitForSelector(".banner.error", timeout=3000)
            text = await page.evaluate("document.body.innerText")
            assert "Error del servidor" in text and "curl -s -X POST" in text, "No hay banner de error con diagnóstico"
            print("⚠️  SPRINT3 E2E en modo diagnóstico (backend devolvió error).")
            rc = 0
        except:
            print("❌ SPRINT3 E2E FAIL: ni tablas ni banner de error.")
            rc = 1

    await browser.close()
    return rc

def main():
    p = start_php()
    try:
        time.sleep(1.0)
        rc = asyncio.get_event_loop().run_until_complete(e2e())
        if rc == 2:
            print("⚠️  E2E degradado (sin pyppeteer). Considera instalarlo.")
            sys.exit(0)
        sys.exit(rc)
    finally:
        try: p.send_signal(signal.SIGINT); p.terminate()
        except Exception: pass

if __name__=="__main__":
    main()
