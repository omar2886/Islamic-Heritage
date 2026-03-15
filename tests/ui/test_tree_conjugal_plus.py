import pytest
BASE = "http://127.0.0.1:8080"

@pytest.mark.asyncio
async def test_conjugal_plus(page):
    resp = await page.goto(f"{BASE}/public/app/v2/test/tree_dump.html", wait_until="domcontentloaded")
    assert resp and resp.status == 200
    btn = page.locator("button.edge-add-btn")
    await btn.wait_for(timeout=3000)
    await btn.click()
    has_full = await page.evaluate("""
      (()=>{
        const s=window.__state;
        const children=[...s.nodes.values()].filter(n=>n.role==='child' && n.parentId && n.jointParent);
        return children.length>=1;
      })()
    """)
    assert has_full is True
