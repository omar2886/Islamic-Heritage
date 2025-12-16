import subprocess, time, urllib.request, json, sys, re, os, signal

HOST = "127.0.0.1"
PORT = 8000
BASE = f"http://{HOST}:{PORT}"

def start_php():
    return subprocess.Popen(
        ["php", "-S", f"{HOST}:{PORT}", "-t", "public"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=5) as r:
        return r.status, r.read().decode("utf-8", errors="replace")

def main():
    p = start_php()
    try:
        time.sleep(0.8)
        # home
        s, b = get("/index.php?page=home")
        assert s == 200 and "Bienvenido" in b
        # builder placeholder (contenido dinámico lo valida E2E)
        s, b = get("/index.php?page=builder")
        assert s == 200 and "builder-root" in b
        # results placeholder
        s, b = get("/index.php?page=results")
        assert s == 200 and "results-root" in b
        # roles api
        s, b = get("/api/roles.php")
        assert s == 200
        j = json.loads(b)
        assert "roles" in j
        print("✅ SMOKE OK")
    except Exception as e:
        print("❌ SMOKE FAIL:", e)
        sys.exit(1)
    finally:
        try:
            p.send_signal(signal.SIGINT)
            p.terminate()
        except Exception:
            pass

if __name__ == "__main__":
    main()
