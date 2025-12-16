import os, subprocess, time, socket, contextlib, sys, pytest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import requests  # noqa: E402  (after sys.path tweak)

BASE_URL = "http://127.0.0.1:8080"

def _wait_port(host, port, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.settimeout(0.5)
            if sock.connect_ex((host, port)) == 0:
                return True
        time.sleep(0.2)
    return False

@pytest.fixture(scope="session", autouse=True)
def php_server():
    docroot = str(REPO_ROOT)
    proc = subprocess.Popen(["php", "-S", "127.0.0.1:8080", "-t", docroot],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    assert _wait_port("127.0.0.1", 8080, 20), "PHP server did not start"
    r = requests.get(f"{BASE_URL}/public/app/v2/index.php", timeout=10)
    assert r.status_code in (200, 302), f"v2 index not reachable: {r.status_code}"
    yield
    proc.terminate()
    try: proc.wait(timeout=5)
    except subprocess.TimeoutExpired: proc.kill()
