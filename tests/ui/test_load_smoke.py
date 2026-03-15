import pytest
BASE = "http://127.0.0.1:8080"

async def _trap(page):
    errors=[]
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e))))
    page.on("console", lambda m: errors.append(("console", m.text())) if m.type()=="error" else None)
    return errors

@pytest.mark.asyncio
async def test_load_smoke(page):
    traps = await _trap(page)
    resp = await page.goto(f"{BASE}/public/app/v2/test/load_smoke.html", wait_until="domcontentloaded")
    assert resp and resp.status == 200
    # zoom produce transform (se verifica indirectamente por cambio de tamaño de nodo)
    before = await page.evaluate("document.querySelector('.nodes-layer').innerHTML.length")
    await page.click('#zoom-in')
    await page.click('#zoom-out')
    assert await page.evaluate("window.__ok===true")
    assert not traps, f"Console/page errors: {traps}"
