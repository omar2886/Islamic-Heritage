import re
import subprocess, time, urllib.request, signal

HOST = "127.0.0.1"
PORT = 8000
BASE = f"http://{HOST}:{PORT}"


def start_php():
    return subprocess.Popen(
        ["php", "-S", f"{HOST}:{PORT}", "-t", "public"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=6) as r:
        return r.status, r.read().decode("utf-8", "replace")


def assert_has(text, needle):
    assert needle in text, f"no se encontró {needle}"


def main():
    p = start_php()
    try:
        time.sleep(1.0)

        # 1) UI en raíz
        s, b = get("/index.php?page=builder")
        assert s == 200
        assert_has(b, "window.__PUBLIC_BASE__")
        # CSS/JS deben ir bajo /public/...
        assert "/css/styles.css" in b and "/js/app.js" in b

        # 2) UI en subcarpeta (bootstrap)
        s2, b2 = get("/app/v2/index.php?page=builder")
        assert s2 == 200
        assert_has(b2, "window.__PUBLIC_BASE__")
        # En subcarpeta, los enlaces de navegación NO deben empezar por href="/index.php"
        assert 'href="/index.php?page=builder"' not in b2

        app_base = re.search(r"window\.__APP_BASE__\s*=\s*\"([^\"]*)\"", b2)
        public_base = re.search(r"window\.__PUBLIC_BASE__\s*=\s*\"([^\"]*)\"", b2)
        tools_url = re.search(r"tools:\s*\"([^\"]+)\"", b2)
        assert app_base, "no se detectó __APP_BASE__ en subcarpeta"
        assert public_base, "no se detectó __PUBLIC_BASE__ en subcarpeta"
        assert tools_url, "no se detectó URL de tools"

        assert app_base.group(1) == "/app/v2"
        assert public_base.group(1) == "/app/v2"
        assert tools_url.group(1) == "/app/v2/tools/explain_smoke.php"

        sb_js, builder_js = get("/js/ui/builder.js")
        assert sb_js == 200
        assert_has(builder_js, "__APP_BASE__")
        assert "window.location.href = '/index.php?page=results'" not in builder_js

        sr_js, results_js = get("/js/ui/results.js")
        assert sr_js == 200
        assert_has(results_js, "builderHref()")
        assert_has(results_js, "toolsUrl()")
        assert_has(results_js, "window.__URLS__?.tools")
        assert "href:'/index.php?page=builder'" not in results_js
        assert_has(results_js, "href:builderHref()")
        assert 'location.origin' not in results_js

        print("✅ SPRINT9 subpath bases OK")
    finally:
        try:
            p.send_signal(signal.SIGINT)
            p.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    main()
