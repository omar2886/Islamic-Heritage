import subprocess, time, urllib.request, zipfile, os, sys, signal, json

HOST="127.0.0.1"; PORT=8000
BASE=f"http://{HOST}:{PORT}"
SCRIPT="scripts/make_public_zip.py"
ZIPNAME="public.zip"

def start_php():
    return subprocess.Popen(["php","-S",f"{HOST}:{PORT}","-t","public"],
                            stdout=subprocess.PIPE,stderr=subprocess.PIPE)

def main():
    # 1) empaquetar
    if not os.path.exists(SCRIPT):
        print("❌ no existe scripts/make_public_zip.py"); sys.exit(1)
    subprocess.check_call([sys.executable, SCRIPT, "--out", ZIPNAME])

    assert os.path.exists(ZIPNAME), "no se generó public.zip"

    # 2) inspeccionar contenido
    with zipfile.ZipFile(ZIPNAME,"r") as z:
        names = z.namelist()
        assert any(n.endswith("public/index.php") for n in names), "zip sin index.php"
        assert any("public/css/styles.css" in n for n in names), "zip sin css/styles.css"
        assert any("public/js/ui/builder.js" in n for n in names), "zip sin js/ui/builder.js"
        assert any("public/README.txt" in n for n in names), "zip sin README.txt"
        assert not any(n.startswith("public/tools/") for n in names), "zip no debe incluir public/tools/"
        assert not any(n.startswith("public/_legacy/") for n in names), "zip no debe incluir public/_legacy/"

    # 3) smoke server
    p = start_php()
    try:
        time.sleep(1.0)
        with urllib.request.urlopen(BASE+"/index.php?page=home", timeout=5) as r:
            assert r.status==200
        print("✅ SPRINT7 package OK")
    finally:
        try: p.send_signal(signal.SIGINT); p.terminate()
        except Exception: pass

if __name__=="__main__":
    main()
