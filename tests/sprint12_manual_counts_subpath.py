import asyncio
import signal
import subprocess
import sys
import time

HOST = "127.0.0.1"
PORT = 8000
BASE = f"http://{HOST}:{PORT}"
SUBPATH = "/app/v2"


def start_php():
    return subprocess.Popen(
        ["php", "-S", f"{HOST}:{PORT}", "-t", "public"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


async def scenario():
    try:
        from pyppeteer import launch
    except Exception:
        print("⚠️  pyppeteer no disponible. Ejecuta: python3 -m pip install pyppeteer")
        return 2

    browser = await launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
    page = await browser.newPage()

    await page.goto(BASE + SUBPATH + "/index.php?page=builder")
    await page.waitForSelector("#sec-persons", timeout=6000)
    await page.waitForSelector("#usePersons", timeout=4000)

    # Asegura que haya un count manual cargado
    await page.evaluate(
        "document.getElementById('son').value = '3';"
        "document.getElementById('son').dispatchEvent(new Event('input', {bubbles:true}))"
    )

    # Fuerza la derivación vía grafo sin datos → debe mostrar aviso y no tocar los counts.
    await page.evaluate("document.getElementById('usePersons').checked = true")
    await page.click("#btnDerive")
    await page.waitForFunction(
        "!document.getElementById('preWarnings').hidden",
        timeout=3000,
    )
    warning_text = await page.evaluate(
        "document.getElementById('preWarnings').textContent || ''"
    )
    assert "No se pudieron derivar counts" in warning_text, "faltó aviso de derivación"
    son_value = await page.evaluate("document.getElementById('son').value")
    assert son_value == "3", "el count manual fue reemplazado"
    use_persons_checked = await page.evaluate(
        "document.getElementById('usePersons').checked"
    )
    assert not use_persons_checked, "la casilla de derivación debería desmarcarse"

    # Completa el resto del formulario
    await page.evaluate(
        "document.getElementById('estate').value = '1500';"
        "document.getElementById('estate').dispatchEvent(new Event('input', {bubbles:true}))"
    )

    await page.click("#btnAddPerson")
    await page.waitForFunction(
        "document.querySelectorAll('#sec-persons tbody tr').length >= 2",
        timeout=3000,
    )

    await page.click("#btnCalc")
    await page.waitForNavigation(timeout=8000)
    expected = BASE + SUBPATH + "/index.php?page=results"
    assert page.url == expected, f"Redirección inesperada: {page.url}"

    # El snippet cURL debe respetar la base configurada
    await page.waitForSelector("#results-root .actions[data-endpoint]", timeout=4000)
    endpoint = await page.evaluate(
        "document.querySelector('#results-root .actions[data-endpoint]').dataset.endpoint"
    )
    curl_cmd = await page.evaluate(
        "document.querySelector('#results-root .actions[data-endpoint]').dataset.curl"
    )
    assert endpoint == SUBPATH + "/tools/explain_smoke.php", endpoint
    assert (SUBPATH + "/tools/explain_smoke.php") in curl_cmd

    await browser.close()
    return 0


def main():
    proc = start_php()
    try:
        time.sleep(1.0)
        rc = asyncio.get_event_loop().run_until_complete(scenario())
        if rc == 2:
            print("⚠️  E2E degradado (sin pyppeteer). Ejecuta al menos smoke de S3.")
            sys.exit(0)
        sys.exit(rc)
    finally:
        try:
            proc.send_signal(signal.SIGINT)
            proc.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    main()
