import requests, json
BASE = "http://127.0.0.1:8080"

def test_explain_endpoint():
    url = f"{BASE}/public/tools/explain_smoke.php"
    payload = {"heirs":[{"role":"daughter","count":1,"id":"N1"}],"cli_flags":["--explain","--audit"]}
    r = requests.post(url, json=payload, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert "output" in data
    for k in ("group_shares","individual_shares","sum_final","explain"):
        assert k in data["output"]
