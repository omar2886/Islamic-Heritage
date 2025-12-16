import subprocess, time, urllib.request, os, sys, zipfile, signal

HOST="127.0.0.1"; PORT=8000
BASE=f"http://{HOST}:{PORT}"

def start_php():
    return subprocess.Popen(["php","-S",f"{HOST}:{PORT}","-t","public"],
                            stdout=subprocess.PIPE,stderr=subprocess.PIPE)

def get(path):
    with urllib.request.urlopen(BASE+path, timeout=5) as r:
        return r.status, r.read().decode("utf-8","replace")

def main():
    # 1) docs existen
    assert os.path.exists("public/README.txt"), "falta public/README.txt"
    assert os.path.exists("public/CHANGELOG.md"), "falta public/CHANGELOG.md"
    assert os.path.exists("public/QA_CHECKLIST.md"), "falta public/QA_CHECKLIST.md"

    # 2) server & skip link
    p = start_php()
    try:
        time.sleep(1.0)
        s,b = get("/index.php?page=builder")
        assert s==200 and "skip-link" in b and "#builder-root" in b, "skip link no presente o mal apuntado"
        # componentes accesibles en JS (chequeo estático)
        with open("public/js/ui/components.js","r",encoding="utf-8") as f:
            txt = f.read()
        assert "role: 'alert'" in txt or "'alert'" in txt, "banners sin ARIA"
        assert "aria-live" in txt, "banners sin aria-live"
        print("✅ SPRINT8 a11y/docs OK")
    finally:
        try: p.send_signal(signal.SIGINT); p.terminate()
        except Exception: pass

if __name__=="__main__":
    main()
