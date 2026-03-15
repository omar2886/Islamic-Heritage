import pytest
BASE = "http://127.0.0.1:8080"

@pytest.mark.asyncio
async def test_derive_smoke(page):
    resp = await page.goto(f"{BASE}/public/app/v2/test/derive_smoke.html", wait_until="domcontentloaded")
    assert resp and resp.status == 200
    data = await page.evaluate("window.__deriveSmoke")
    assert data["A"]["type"] == "full_brother"
    assert data["B"]["type"] == "consanguine_brother"
    assert data["C"]["type"] == "uterine_brother"
    # Abuelo nunca como hermano
    assert data["D"]["type"] in ("none", None)
