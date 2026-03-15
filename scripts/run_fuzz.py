#!/usr/bin/env python3
"""Execute fuzz tests against the PHP inheritance calculator CLI."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Sequence, Tuple


REPO_ROOT = Path(__file__).resolve().parents[1]
GENERATOR = REPO_ROOT / "scripts" / "gen_random_cases.py"
CLI = REPO_ROOT / "scripts" / "calc_cli.php"

FUZZ_CASE_COUNT = 750
FUZZ_SEED = "20240315"


class InvariantViolation(Exception):
    """Represents a failed invariant during fuzzing."""

    def __init__(self, case_id: str, message: str) -> None:
        self.case_id = case_id
        super().__init__(message)


def load_cases() -> Sequence[Dict[str, object]]:
    try:
        output = subprocess.check_output(
            [
                sys.executable,
                str(GENERATOR),
                "--cases",
                str(FUZZ_CASE_COUNT),
                "--seed",
                FUZZ_SEED,
            ],
            cwd=REPO_ROOT,
        )
    except subprocess.CalledProcessError as exc:  # pragma: no cover - defensive
        raise RuntimeError("Failed to generate fuzz cases") from exc
    return json.loads(output.decode("utf-8"))


def run_cli(payload: Dict[str, object]) -> Dict[str, object]:
    proc = subprocess.run(
        ["php", str(CLI)],
        input=json.dumps(payload).encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=REPO_ROOT,
        check=False,
    )

    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="ignore")
        raise RuntimeError(f"CLI exited with status {proc.returncode}: {stderr}")

    stdout = proc.stdout.decode("utf-8").strip()
    if not stdout:
        raise RuntimeError("CLI produced no output")

    return json.loads(stdout)


def assert_sum_to_one(case_id: str, output: Dict[str, object]) -> None:
    sum_final = output.get("sum_final")
    if sum_final != "1/1":
        raise InvariantViolation(case_id, f"expected sum_final=1/1, got {sum_final!r}")

    final_sum = (
        output.get("shares", {})
        .get("final", {})
        .get("sumFinal")
    )
    if final_sum != "1/1":
        raise InvariantViolation(case_id, f"expected shares.final.sumFinal=1/1, got {final_sum!r}")


def parse_fraction(case_id: str, label: str, value: object) -> Tuple[int, int]:
    if not isinstance(value, str):
        raise InvariantViolation(case_id, f"{label} is not a string: {value!r}")

    if "/" not in value:
        raise InvariantViolation(case_id, f"{label} is not a fraction string: {value!r}")

    numerator_str, denominator_str = value.split("/", 1)
    try:
        numerator = int(numerator_str)
        denominator = int(denominator_str)
    except ValueError as exc:
        raise InvariantViolation(case_id, f"{label} has invalid fraction components: {value!r}") from exc

    if denominator == 0:
        raise InvariantViolation(case_id, f"{label} has zero denominator: {value!r}")

    return numerator, denominator


def assert_non_negative_shares(case_id: str, output: Dict[str, object]) -> None:
    def check_map(entries: Dict[str, object], label: str) -> None:
        for role, share in entries.items():
            numerator, denominator = parse_fraction(case_id, f"{label}[{role}]", share)
            if numerator < 0:
                raise InvariantViolation(case_id, f"{label}[{role}] has negative share: {share}")
            if denominator < 0:
                raise InvariantViolation(case_id, f"{label}[{role}] has negative denominator: {share}")

    group_shares = output.get("group_shares", {})
    if isinstance(group_shares, dict):
        check_map(group_shares, "group_shares")

    individual_shares = output.get("individual_shares", {})
    if isinstance(individual_shares, dict):
        for role, shares in individual_shares.items():
            if not isinstance(shares, list):
                raise InvariantViolation(case_id, f"individual_shares[{role}] is not a list: {shares!r}")
            for share in shares:
                numerator, denominator = parse_fraction(case_id, f"individual_shares[{role}]", share)
                if numerator < 0:
                    raise InvariantViolation(case_id, f"individual_shares[{role}] has negative share: {share}")
                if denominator < 0:
                    raise InvariantViolation(case_id, f"individual_shares[{role}] has negative denominator: {share}")


def assert_no_spousal_radd(case_id: str, output: Dict[str, object]) -> None:
    meta = output.get("meta", {})
    if not isinstance(meta, dict):
        return

    ledger = meta.get("phase_ledger", [])
    if not isinstance(ledger, list):
        return

    for entry in ledger:
        if not isinstance(entry, dict):
            continue
        if entry.get("phase") != "RADD" or entry.get("action") != "after":
            continue
        delta = entry.get("delta", {})
        if not isinstance(delta, dict):
            continue
        for spouse_role in ("husband", "wives", "wife"):
            if spouse_role in delta:
                raise InvariantViolation(
                    case_id,
                    f"spousal role {spouse_role} adjusted during RADD: {delta[spouse_role]}",
                )


def assert_father_blocks_pgf(case_id: str, case_input: Dict[str, object], output: Dict[str, object]) -> None:
    heirs = case_input.get("heirs", [])
    if not isinstance(heirs, list):
        return

    father_present = any(
        isinstance(heir, dict)
        and heir.get("role") == "father"
        and int(heir.get("count", 0)) > 0
        for heir in heirs
    )

    if not father_present:
        return

    mappings = []
    group_shares = output.get("group_shares", {})
    if isinstance(group_shares, dict):
        mappings.append((group_shares, "group_shares"))

    final_groups = (
        output.get("shares", {})
        .get("final", {})
        .get("groups")
    )
    if isinstance(final_groups, dict):
        mappings.append((final_groups, "shares.final.groups"))

    for mapping, label in mappings:
        if "paternal_grandfather" in mapping:
            raise InvariantViolation(
                case_id,
                f"{label} exposes paternal_grandfather despite father present",
            )


def assert_no_zero_holes(case_id: str, output: Dict[str, object]) -> None:
    def ensure_no_zero(entries: Dict[str, object], label: str) -> None:
        for role, share in entries.items():
            numerator, _ = parse_fraction(case_id, f"{label}[{role}]", share)
            if numerator == 0:
                raise InvariantViolation(
                    case_id,
                    f"{label}[{role}] has zero share, creating an unexpected hole",
                )

    group_shares = output.get("group_shares", {})
    if isinstance(group_shares, dict):
        ensure_no_zero(group_shares, "group_shares")

    final_groups = (
        output.get("shares", {})
        .get("final", {})
        .get("groups")
    )
    if isinstance(final_groups, dict):
        ensure_no_zero(final_groups, "shares.final.groups")


def run_invariants(case: Dict[str, object]) -> None:
    case_id = str(case.get("case_id", "unknown"))
    case_input = case.get("input")
    if not isinstance(case_input, dict):
        raise InvariantViolation(case_id, "case input must be an object")

    output = run_cli(case_input)

    assert_sum_to_one(case_id, output)
    assert_non_negative_shares(case_id, output)
    assert_no_spousal_radd(case_id, output)
    assert_father_blocks_pgf(case_id, case_input, output)
    assert_no_zero_holes(case_id, output)


def main() -> None:
    cases = load_cases()
    failures: List[str] = []

    for case in cases:
        try:
            run_invariants(case)
        except InvariantViolation as exc:
            failures.append(f"{exc.case_id}: {exc}")
        except Exception as exc:  # pragma: no cover - defensive
            failures.append(f"{case.get('case_id', 'unknown')}: unexpected error: {exc}")

    if failures:
        for failure in failures:
            print(f"[FAIL] {failure}")
        raise SystemExit(1)

    print(f"Fuzz OK ({len(cases)} cases)")


if __name__ == "__main__":
    main()
