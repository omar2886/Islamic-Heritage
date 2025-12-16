import subprocess, time, urllib.request, json, sys, os, signal

HOST="127.0.0.1"; PORT=8000
BASE=f"http://{HOST}:{PORT}"

def start_php():
    return subprocess.Popen(["php","-S",f"{HOST}:{PORT}","-t","public"],
                            stdout=subprocess.PIPE,stderr=subprocess.PIPE)

def post_json(path, obj):
    req = urllib.request.Request(BASE+path, data=json.dumps(obj).encode("utf-8"),
                                 headers={"Content-Type":"application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=8) as r:
        body = r.read().decode("utf-8", "replace")
        return r.status, body

def main():
    p = start_php()
    try:
        time.sleep(1.0)
        # Comprobar que roles API responde
        with urllib.request.urlopen(BASE+"/api/roles.php", timeout=5) as r:
            assert r.status==200
            j = json.loads(r.read().decode())
            assert "roles" in j

        # POST directo al endpoint del backend (debe existir en repo)
        payload = {
            "heirs":[{"role":"wife","count":1},{"role":"daughter","count":1}],
            "estate_value":"1000","amount":"1000",
            "cli_flags":["--explain","--audit"]
        }
        status, body = post_json("/tools/explain_smoke.php", payload)
        assert status==200, f"HTTP {status}: {body[:240]}"
        try:
            j = json.loads(body)
        except Exception as e:
            raise AssertionError(f"Respuesta no-JSON: {body[:240]}")
        # Admitimos dos formas: top-level o output
        out = j.get("output", j)
        assert any(k in out for k in ("group_shares","individual_shares","sum_final")), "Faltan claves de resultado"
        print("✅ SPRINT3 SMOKE OK")
    except Exception as e:
        print("❌ SPRINT3 SMOKE FAIL:", e)
        sys.exit(1)
    finally:
        try: p.send_signal(signal.SIGINT); p.terminate()
        except Exception: pass

if __name__=="__main__":
    main()
