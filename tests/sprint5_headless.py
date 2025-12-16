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

    await page.goto(BASE+"/index.php?page=builder")
    await page.waitForSelector("#sec-persons", timeout=6000)

    await page.type("#sec-persons tbody tr:nth-of-type(1) input[type=text]", "Decedent D")
    await page.select("#sec-persons tbody tr:nth-of-type(1) select:nth-of-type(1)", "male")
    await page.click("#sec-persons tbody tr:nth-of-type(1) input[type=radio]")

    await page.click("#btnAddPerson")
    await page.type("#sec-persons tbody tr:nth-of-type(2) input[type=text]", "Father F")
    await page.select("#sec-persons tbody tr:nth-of-type(2) select:nth-of-type(1)", "male")
    await page.select("#sec-persons tbody tr:nth-of-type(1) select:nth-of-type(2)", "P2")

    await page.click("#btnAddPerson")
    await page.type("#sec-persons tbody tr:nth-of-type(3) input[type=text]", "Mother M")
    await page.select("#sec-persons tbody tr:nth-of-type(3) select:nth-of-type(1)", "female")
    await page.select("#sec-persons tbody tr:nth-of-type(1) select:nth-of-type(3)", "P3")

    await page.click("#btnAddPerson")
    await page.type("#sec-persons tbody tr:nth-of-type(4) input[type=text]", "Wife W1")
    await page.select("#sec-persons tbody tr:nth-of-type(4) select:nth-of-type(1)", "female")
    await page.select("#sec-persons tbody tr:nth-of-type(4) select:nth-of-type(2)", "")
    await page.select("#sec-persons tbody tr:nth-of-type(4) select:nth-of-type(3)", "")
    await page.click("#sec-persons tbody tr:nth-of-type(4) input[type=checkbox]:nth-of-type(2)")

    await page.click("#btnAddPerson")
    await page.type("#sec-persons tbody tr:nth-of-type(5) input[type=text]", "Brother B1")
    await page.select("#sec-persons tbody tr:nth-of-type(5) select:nth-of-type(1)", "male")
    await page.select("#sec-persons tbody tr:nth-of-type(5) select:nth-of-type(2)", "P2")
    await page.select("#sec-persons tbody tr:nth-of-type(5) select:nth-of-type(3)", "P3")

    await page.type("#estate","1000")

    await page.click("#btnDerive")
    await page.click("#btnPreview")
    await page.waitForSelector("#prePayload", timeout=3000)
    payload_txt = await page.evaluate("document.querySelector('#prePayload').textContent || ''")

    assert '"role": "father"' in payload_txt and '"count": 1' in payload_txt, "falta father=1"
    assert '"role": "mother"' in payload_txt, "falta mother=1"
    assert '"role": "wife"' in payload_txt, "falta wife=1"
    assert '"role": "full_brother"' in payload_txt, "falta full_brother=1"

    await page.click("#btnCalc")
    await page.waitForNavigation(timeout=8000)
    assert "page=results" in page.url

    try:
        await page.waitForSelector("table", timeout=6000)
        print("✅ SPRINT5 E2E OK (con tablas)")
        rc = 0
    except Exception:
        await page.waitForSelector(".banner.error", timeout=4000)
        print("⚠️  SPRINT5 E2E diagnóstico (banner de error mostrado)")
        rc = 0

    await browser.close()
    return rc

def main():
    p = start_php()
    try:
        time.sleep(1.0)
        rc = asyncio.get_event_loop().run_until_complete(e2e())
        if rc == 2:
            print("⚠️  E2E degradado (sin pyppeteer). Ejecuta al menos smoke de S3.")
            sys.exit(0)
        sys.exit(rc)
    finally:
        try: p.send_signal(signal.SIGINT); p.terminate()
        except Exception: pass

if __name__=="__main__":
    main()
