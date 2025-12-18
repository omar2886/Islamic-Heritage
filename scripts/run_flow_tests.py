#!/usr/bin/env python3
"""POST fixtures and fuzzed payloads against the calc HTTP API."""
from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from urllib import error, request

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_FILE = REPO_ROOT / "scripts" / "flow_payload_fixtures.json"
DEFAULT_BASE_URL = "http://127.0.0.1:8000"
PRIMARY_PATH = "/public/api/calc.php"
FALLBACK_PATH = "/api/calc.php"


@dataclass
class HttpResponse:
    status: int
    reason: str
    body: str
    headers: Dict[str, str]


class FlowTestFailure(Exception):
    """Raised when a flow test invariant fails."""


def load_fixtures() -> List[Dict[str, object]]:
    with FIXTURE_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build_request(base_url: str, path: str, payload: Dict[str, object]) -> request.Request:
    url = base_url.rstrip("/") + path
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )


def perform_request(req: request.Request) -> HttpResponse:
    try:
        with request.urlopen(req, timeout=8) as response:
            body = response.read().decode("utf-8", errors="ignore")
            return HttpResponse(
                status=response.status,
                reason=response.reason,
                body=body,
                headers={k.lower(): v for k, v in response.headers.items()},
            )
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        return HttpResponse(
            status=exc.code,
            reason=str(exc.reason),
            body=body,
            headers={k.lower(): v for k, v in exc.headers.items()},
        )


def post_payload(base_url: str, payload: Dict[str, object]) -> HttpResponse:
    primary = build_request(base_url, PRIMARY_PATH, payload)
    response = perform_request(primary)

    needs_fallback = response.status == 404 or (
        response.status == 200
        and "application/json" not in response.headers.get("content-type", "")
    )

    if needs_fallback:
        fallback = build_request(base_url, FALLBACK_PATH, payload)
        response = perform_request(fallback)
    return response


def validate_response(label: str, response: HttpResponse) -> None:
    if response.status != 200:
        raise FlowTestFailure(f"[{label}] HTTP {response.status}: {response.reason}")

    content_type = response.headers.get("content-type", "")
    if "application/json" not in content_type:
        raise FlowTestFailure(
            f"[{label}] Content-Type inesperado: {content_type or '(vacío)'}"
        )

    try:
        parsed = json.loads(response.body)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise FlowTestFailure(f"[{label}] JSON inválido: {exc}") from exc

    if not isinstance(parsed, dict):
        raise FlowTestFailure(f"[{label}] respuesta no es objeto JSON")

    if not parsed.get("ok"):
        raise FlowTestFailure(f"[{label}] respuesta indica error: {parsed}")

    output = parsed.get("output")
    if not isinstance(output, dict):
        raise FlowTestFailure(f"[{label}] campo output ausente o inválido")

    for key in ("sum_final", "group_shares", "individual_shares"):
        if key not in output:
            raise FlowTestFailure(f"[{label}] falta campo requerido: {key}")

    if not isinstance(output.get("individual_shares"), dict):
        raise FlowTestFailure(f"[{label}] individual_shares no es mapa")

    sum_final = output.get("sum_final")
    if not isinstance(sum_final, str) or "/" not in sum_final:
        raise FlowTestFailure(f"[{label}] sum_final no es fracción: {sum_final!r}")


def generate_fuzz_cases(fixtures: List[Dict[str, object]]) -> Iterable[Tuple[str, Dict[str, object]]]:
    random.seed(202404)
    for entry in fixtures:
        label = entry.get("label", "fixture")
        payload = entry.get("payload", {})
        if not isinstance(payload, dict):
            continue

        heirs = payload.get("heirs", [])
        if not isinstance(heirs, list):
            continue

        bumped_counts = []
        for heir in heirs:
            if not isinstance(heir, dict):
                continue
            heir_copy = dict(heir)
            heir_copy["count"] = min(int(heir_copy.get("count", 1)) + 1, 5)
            bumped_counts.append(heir_copy)
        fuzzed = dict(payload)
        fuzzed["heirs"] = bumped_counts or heirs
        yield f"{label}_bumped", fuzzed

        stretched_meta = dict(payload)
        ui_meta = dict(payload.get("ui_meta", {})) if isinstance(payload.get("ui_meta"), dict) else {}
        ui_meta["source"] = (ui_meta.get("source", "fuzz") + "_" + "x" * 20)[:40]
        ui_meta["decedentId"] = "P" + "9" * 8
        stretched_meta["ui_meta"] = ui_meta
        stretched_meta["currency"] = payload.get("currency", "USD")
        yield f"{label}_meta", stretched_meta

        varied_estate = dict(payload)
        varied_estate["estate_value"] = str(50000 + random.randint(0, 5000)) + ".25"
        yield f"{label}_estate", varied_estate


def run_suite(base_url: str, fixtures: List[Dict[str, object]], fuzz: bool) -> None:
    for index, entry in enumerate(fixtures, start=1):
        label = entry.get("label", f"case_{index}")
        payload = entry.get("payload")
        if not isinstance(payload, dict):
            raise FlowTestFailure(f"[{label}] payload inválido en fixture")

        response = post_payload(base_url, payload)
        validate_response(label, response)
        print(f"[OK] Fixture {index}: {label}")

    if not fuzz:
        return

    for label, payload in generate_fuzz_cases(fixtures):
        response = post_payload(base_url, payload)
        validate_response(label, response)
        print(f"[OK] Fuzz: {label}")


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL del servidor PHP")
    parser.add_argument("--fuzz", action="store_true", help="Ejecutar variaciones fuzz controladas")
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    fixtures = load_fixtures()

    try:
        run_suite(args.base_url, fixtures, args.fuzz)
    except FlowTestFailure as exc:
        sys.stderr.write(str(exc) + "\n")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
