#!/usr/bin/env python3
"""Deterministic fuzzing for the HTTP calc API."""

from __future__ import annotations

import argparse
import json
import random
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence
from urllib import error, request

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT / "public"
DEFAULT_SEED = 1337
DEFAULT_CASES = 300


@dataclass
class ServerHandle:
    process: subprocess.Popen[str]
    base_url: str

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()


class FuzzFailure(RuntimeError):
    def __init__(self, message: str, payload: Dict[str, object] | None = None):
        super().__init__(message)
        self.payload = payload


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def start_server() -> ServerHandle:
    port = find_free_port()
    cmd = ["php", "-S", f"127.0.0.1:{port}", "-t", str(PUBLIC_DIR)]
    process = subprocess.Popen(
        cmd,
        cwd=str(PUBLIC_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    base_url = f"http://127.0.0.1:{port}"
    wait_for_server(base_url)
    return ServerHandle(process=process, base_url=base_url)


def wait_for_server(base_url: str) -> None:
    deadline = time.time() + 5
    last_error: Exception | None = None

    while time.time() < deadline:
        try:
            with request.urlopen(f"{base_url}/api/roles.php", timeout=0.5):
                return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(0.1)

    raise RuntimeError(f"PHP server failed to start: {last_error}")


def http_request(
    method: str,
    url: str,
    *,
    body: bytes | None = None,
    timeout: float = 2.0,
    headers: Dict[str, str] | None = None,
) -> tuple[int, Dict[str, str], bytes]:
    req = request.Request(url=url, method=method, data=body)
    for key, value in (headers or {}).items():
        req.add_header(key, value)

    try:
        with request.urlopen(req, timeout=timeout) as resp:
            status = resp.getcode()
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            data = resp.read()
    except error.HTTPError as exc:
        status = exc.code
        resp_headers = {k.lower(): v for k, v in exc.headers.items()} if exc.headers else {}
        data = exc.read()

    return status, resp_headers, data


def fetch_roles(base_url: str) -> List[str]:
    status, headers, body = http_request("GET", f"{base_url}/api/roles.php")

    if status != 200:
        raise RuntimeError(f"roles.php returned HTTP {status}")

    ensure_json(headers, body, payload=None)
    decoded = json.loads(body.decode("utf-8"))
    roles = decoded.get("roles") if isinstance(decoded, dict) else None
    if not isinstance(roles, list) or not all(isinstance(r, str) for r in roles):
        raise RuntimeError("roles.php returned invalid structure")

    return roles


def ensure_json(headers: Dict[str, str], body: bytes, payload: Dict[str, object] | None) -> Dict[str, object]:
    content_type = headers.get("content-type", "")
    if "application/json" not in content_type:
        raise FuzzFailure(f"non-JSON response: {content_type}", payload)

    try:
        decoded = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise FuzzFailure(f"invalid JSON response: {exc}", payload) from exc

    if not isinstance(decoded, dict):
        raise FuzzFailure("JSON response must be an object", payload)

    return decoded


def choose_estate_value(rng: random.Random) -> str:
    valid_samples = [
        "0",
        "1",
        "10",
        "2500.75",
        "123456789012345678",
        "999999999999999999",
        f"{rng.randint(1, 10_000)}.{rng.randint(0, 999999):06d}".rstrip("0").rstrip("."),
    ]
    invalid_samples = [
        "",
        " ",
        "-5",
        "1e3",
        "1,000",
        "abc",
        "999999999999999999.5",
    ]

    if rng.random() < 0.8:
        return rng.choice(valid_samples)

    return rng.choice(invalid_samples)


def generate_case(rng: random.Random, roles: Sequence[str]) -> Dict[str, object]:
    heir_count = rng.randint(1, min(8, len(roles)))
    selected_roles = rng.sample(list(roles), heir_count)
    heirs: List[Dict[str, object]] = []

    for role in selected_roles:
        if rng.random() < 0.05:
            count = 100
        else:
            count = rng.randint(1, 4)
        heirs.append({"role": role, "count": count})

    currency_pool = ["MAD", "USD", "EUR", "BTC", "123"]
    currency = rng.choice(currency_pool)

    payload: Dict[str, object] = {
        "heirs": heirs,
        "estate_value": choose_estate_value(rng),
        "currency": currency,
    }

    return payload


def validate_response(status: int, decoded: Dict[str, object], payload: Dict[str, object]) -> None:
    if status >= 500:
        raise FuzzFailure(f"server error HTTP {status}", payload)

    if status == 200:
        if decoded.get("ok") is not True:
            raise FuzzFailure("expected ok=true for HTTP 200", payload)
        if "output" not in decoded:
            raise FuzzFailure("missing output field on success", payload)
        return

    if 400 <= status < 500:
        if decoded.get("ok") is not False:
            raise FuzzFailure("expected ok=false for client error", payload)
        error_field = decoded.get("error")
        if not isinstance(error_field, str) or not error_field:
            raise FuzzFailure("error field must be non-empty string on client error", payload)
        return

    raise FuzzFailure(f"unexpected HTTP status {status}", payload)


def run_fuzz(cases: int, seed: int) -> None:
    rng = random.Random(seed)
    server = start_server()
    try:
        roles = fetch_roles(server.base_url)
        for index in range(1, cases + 1):
            payload = generate_case(rng, roles)
            body = json.dumps(payload).encode("utf-8")
            status, headers, raw_body = http_request(
                "POST",
                f"{server.base_url}/api/calc.php",
                body=body,
                headers={"Content-Type": "application/json"},
            )
            decoded = ensure_json(headers, raw_body, payload)
            try:
                validate_response(status, decoded, payload)
            except FuzzFailure as exc:
                raise FuzzFailure(f"case #{index}: {exc}", exc.payload or payload) from exc
        print(f"Fuzzed {cases} cases successfully (seed={seed}).")
    finally:
        server.stop()


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fuzz the calc API")
    parser.add_argument("--cases", type=int, default=DEFAULT_CASES, help="number of fuzz cases")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="random seed")
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = parse_args(sys.argv[1:])
    try:
        run_fuzz(args.cases, args.seed)
    except FuzzFailure as exc:
        sys.stderr.write(f"Fuzz failed: {exc}\n")
        if exc.payload is not None:
            sys.stderr.write(f"Payload: {json.dumps(exc.payload, ensure_ascii=False)}\n")
        sys.exit(1)
    except RuntimeError as exc:
        sys.stderr.write(f"{exc}\n")
        sys.exit(1)
