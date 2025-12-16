import json
import os
import socket
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen

import pytest
from playwright.sync_api import sync_playwright

from tests.ui._errors import PageErrorTracker

REPO_ROOT = Path(__file__).resolve().parents[2]
HOST = "127.0.0.1"
PORT = 8037
BASE_URL = f"http://{HOST}:{PORT}"


def _wait_for_port(host: str, port: int, timeout: float = 10.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.2)
            try:
                sock.connect((host, port))
            except OSError:
                time.sleep(0.1)
            else:
                return True
    return False


@pytest.fixture(scope="session")
def base_url() -> str:
    env = os.environ.copy()
    cmd = [
        "php",
        "-S",
        f"{HOST}:{PORT}",
        "-t",
        "public",
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        if not _wait_for_port(HOST, PORT):
            proc.terminate()
            proc.wait(timeout=5)
            raise RuntimeError("PHP server did not start in time")
        yield BASE_URL
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.fixture(scope="session")
def playwright_instance():
    with sync_playwright() as playwright:
        yield playwright


@pytest.fixture(scope="session")
def browser(playwright_instance):
    browser = playwright_instance.chromium.launch()
    try:
        yield browser
    finally:
        browser.close()


@pytest.fixture()
def page(browser, base_url):
    context = browser.new_context()
    page = context.new_page()
    try:
        with PageErrorTracker(page):
            yield page
    finally:
        context.close()


def test_builder_panzoom_edges_and_inspector(page, base_url):
    page.goto(f"{base_url}/app/classic/deepseek.php", wait_until="networkidle")
    stage = page.wait_for_selector("#builder-stage")
    initial_transform = stage.evaluate("el => getComputedStyle(el).transform")
    page.click("#zoom-in")
    page.wait_for_function(
        "prev => getComputedStyle(document.getElementById('builder-stage')).transform !== prev",
        initial_transform,
    )

    tree = {
        "decedentId": "deceased",
        "nodes": [
            {"id": "deceased", "sex": "male", "alive": False, "labels": ["decedent"]},
            {"id": "spouseA", "sex": "female", "alive": True, "labels": ["spouse"]},
            {"id": "spouseB", "sex": "female", "alive": True, "labels": ["spouse"]},
            {"id": "child1", "sex": "male", "alive": True, "labels": ["child"]},
            {"id": "child2", "sex": "female", "alive": True, "labels": ["child"]},
        ],
        "edges": [
            {"type": "spouse", "from": "deceased", "to": "spouseA"},
            {"type": "spouse", "from": "deceased", "to": "spouseB"},
            {"type": "parent", "from": "deceased", "to": "child1"},
            {"type": "parent", "from": "spouseA", "to": "child1"},
            {"type": "parent", "from": "deceased", "to": "child2"},
            {"type": "parent", "from": "spouseB", "to": "child2"},
        ],
        "conjugalEdges": [
            {"a": "deceased", "b": "spouseA", "children": ["child1"]},
            {"a": "deceased", "b": "spouseB", "children": ["child2"]},
        ],
    }
    ok = page.evaluate("tree => window.deepseekImportTree(tree)", tree)
    assert ok is True
    page.wait_for_timeout(250)
    page.wait_for_selector("#edges-layer line")
    assert page.locator("#edges-layer line").count() >= 2

    page.wait_for_selector("#node-inspector button")
    assert page.locator("#node-inspector button").count() >= 5

    handles = page.locator(".edge-handle")
    page.wait_for_function("() => document.querySelectorAll('.edge-handle').length > 0")
    initial_nodes = page.locator(".heir-node").count()
    handles.first().click()
    page.wait_for_selector(".edge-handle-menu button[data-sex='male']")
    page.click(".edge-handle-menu button[data-sex='male']")
    page.wait_for_function(
        f"expected => document.querySelectorAll('.heir-node').length > expected",
        initial_nodes,
    )


def test_tabs_switch(page, base_url):
    page.goto(f"{base_url}/app/classic/deepseek.php", wait_until="networkidle")
    page.wait_for_selector("[data-tab-btn='tree']")
    tree_panel_hidden = page.get_attribute("#tab-tree", "hidden")
    assert tree_panel_hidden is None

    page.click("[data-tab-btn='heirs']")
    page.wait_for_function("() => !document.querySelector('#tab-heirs')?.hasAttribute('hidden')")
    assert page.get_attribute("#tab-heirs", "hidden") is None
    assert page.get_attribute("#tab-tree", "hidden") in {"", "true"}

    page.click("[data-tab-btn='calc']")
    page.wait_for_function("() => !document.querySelector('#tab-calc')?.hasAttribute('hidden')")
    assert page.get_attribute("#tab-calc", "hidden") is None


def test_derive_smoke_page(page, base_url):
    page.goto(f"{base_url}/app/classic/test/derive_smoke.html", wait_until="networkidle")
    page.wait_for_function("() => document.querySelectorAll('#results .case').length > 0")
    page.wait_for_timeout(200)
    assert page.locator("#results .case.fail").count() == 0


def test_layout_smoke_page(page, base_url):
    page.goto(f"{base_url}/app/classic/test/layout_smoke.html", wait_until="networkidle")
    result = page.wait_for_selector("#results .result")
    text = result.inner_text()
    assert "PASS" in text


def test_add_person_button_triggers_autosave(page, base_url):
    page.goto(f"{base_url}/index.php?page=builder", wait_until="networkidle")
    page.wait_for_selector("#btnAddPerson")
    page.wait_for_selector("#sec-persons tbody tr")

    page.evaluate(
        """
window.__autosaveCalls = 0;
window.__onModelChanged = () => { window.__autosaveCalls++; };
"""
    )

    initial_rows = page.locator("#sec-persons tbody tr").count()
    page.click("#btnAddPerson")
    page.wait_for_function(
        "initial => document.querySelectorAll('#sec-persons tbody tr').length === initial + 1",
        initial_rows,
    )
    autosave_calls = page.evaluate("window.__autosaveCalls")
    assert autosave_calls >= 1


def test_explain_smoke_endpoint(base_url):
    with urlopen(f"{base_url}/tools/explain_smoke.php") as response:
        assert response.status == 200
        data = json.loads(response.read().decode("utf-8"))
    assert data.get("ok") is True
    assert data.get("output")
