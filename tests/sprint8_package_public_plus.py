import subprocess, zipfile, os, sys

ZIP="public.zip"

def main():
    subprocess.check_call([sys.executable, "scripts/make_public_zip.py", "--out", ZIP])
    assert os.path.exists(ZIP), "no se generó public.zip"

    with zipfile.ZipFile(ZIP,"r") as z:
        names = z.namelist()
        must = ["public/index.php","public/css/styles.css","public/js/ui/builder.js",
                "public/README.txt","public/CHANGELOG.md","public/QA_CHECKLIST.md"]
        for m in must:
            assert any(n.endswith(m) for n in names), f"zip sin {m}"
        assert not any(n.startswith("public/tools/") for n in names), "zip incluye public/tools/"
        assert not any(n.startswith("public/_legacy/") for n in names), "zip incluye public/_legacy/"
    print("✅ SPRINT8 package+docs OK")

if __name__=="__main__":
    main()
