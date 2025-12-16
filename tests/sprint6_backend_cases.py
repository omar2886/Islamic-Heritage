import subprocess, time, urllib.request, json, sys, os, signal

HOST="127.0.0.1"; PORT=8000
BASE=f"http://{HOST}:{PORT}"
ROOT = os.path.dirname(os.path.dirname(__file__))
SAMPLES = os.path.join(ROOT, "samples")

def start_php():
    return subprocess.Popen(["php","-S",f"{HOST}:{PORT}","-t","public"],
                            stdout=subprocess.PIPE,stderr=subprocess.PIPE)

def post_json(path, obj):
    req = urllib.request.Request(BASE+path, data=json.dumps(obj).encode("utf-8"),
                                 headers={"Content-Type":"application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=8) as r:
        body = r.read().decode("utf-8", "replace")
        return r.status, body

def load(fname):
    with open(os.path.join(SAMPLES, fname), "r", encoding="utf-8") as f:
        return json.load(f)

def main():
    p = start_php()
    try:
        time.sleep(1.0)
        # ping roles api
        with urllib.request.urlopen(BASE+"/api/roles.php", timeout=5) as r:
            assert r.status==200

        # dos payloads representativos (wife+daughter) y (padre+madre)
        for fname in ("payload_wife_daughter.json","payload_min_parents.json"):
            payload = load(fname)
            status, body = post_json("/tools/explain_smoke.php", payload)
            assert status==200, f"{fname}: HTTP {status}"
            try:
                j = json.loads(body)
            except Exception:
                raise AssertionError(f"{fname}: respuesta no-JSON: {body[:240]}")
            out = j.get("output", j)
            # esperamos al menos sum_final o group_shares
            assert any(k in out for k in ("group_shares","individual_shares","sum_final")), f"{fname}: claves de salida ausentes"

        print("✅ SPRINT6 backend cases OK")
    except Exception as e:
        print("❌ SPRINT6 backend cases FAIL:", e)
        sys.exit(1)
    finally:
        try: p.send_signal(signal.SIGINT); p.terminate()
        except Exception: pass

if __name__ == "__main__":
    main()
