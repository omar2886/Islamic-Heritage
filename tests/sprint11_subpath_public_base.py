import re
import subprocess
import time
import urllib.request
import signal


HOST = "127.0.0.1"
PORT = 8011
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

        status, body = get("/app/v2/index.php?page=builder")
        assert status == 200
        assert_has(body, "window.__PUBLIC_BASE__")

        app_base_match = re.search(r"window\.__APP_BASE__\s*=\s*\"([^\"]*)\"", body)
        assert app_base_match, "no se definió window.__APP_BASE__"
        assert app_base_match.group(1) == "/app/v2", "APP_BASE debe ser /app/v2"

        public_base_match = re.search(r"window\.__PUBLIC_BASE__\s*=\s*\"([^\"]*)\"", body)
        assert public_base_match, "no se definió window.__PUBLIC_BASE__"
        assert public_base_match.group(1) == "/app/v2", "PUBLIC_BASE debe ser /app/v2"

        script_tags = re.findall(r"<script type=\"module\" src=\"([^\"]+)\"", body)
        assert script_tags, "no se encontraron scripts principales"
        for src in script_tags:
            assert src.startswith("/app/v2/"), f"script sin prefijo /app/v2: {src}"
        assert "/app/v2/js/app.js" in script_tags, "debe cargarse /app/v2/js/app.js"

        css_match = re.search(r"<link rel=\"stylesheet\" href=\"([^\"]+)\"", body)
        assert css_match, "no se encontró hoja de estilos"
        assert css_match.group(1) == "/app/v2/css/styles.css"

        urls_match = re.search(r"window\.__URLS__\s*=\s*\{([^}]*)\}", body)
        assert urls_match, "no se definió window.__URLS__"
        assert "/app/v2/api/roles.php" in urls_match.group(1)
        assert "/app/v2/tools/explain_smoke.php" in urls_match.group(1)

        data_page = re.search(r"<body[^>]*data-page=\"([^\"]*)\"", body)
        assert data_page, "no se encontró data-page"

        print("✅ SPRINT11 public base OK")
    finally:
        try:
            p.send_signal(signal.SIGINT)
            p.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    main()
