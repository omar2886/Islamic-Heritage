#!/usr/bin/env python3
"""Utility runner for repository smoke checks."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from decimal import Decimal, InvalidOperation
from fractions import Fraction as PyFraction
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

ROOT = Path(__file__).resolve().parent.parent
FRACTION_FIXTURE = ROOT / "tests" / "fixtures" / "fraction_cases.json"
SMOKE_SCRIPT = ROOT / "scripts" / "smoke_rulebook.php"
FRACTION_SMOKE_SCRIPT = ROOT / "scripts" / "fraction_smoke.php"
CLI_SCRIPT = ROOT / "scripts" / "calc_cli.php"
VERIFY_LINEAR_SYSTEM_SCRIPT = ROOT / "scripts" / "verify_linear_system.py"
FUZZ_SCRIPT = ROOT / "scripts" / "fuzz_api_calc.py"
CLI_FIXTURE_DIR = ROOT / "tests" / "fixtures"
ELIGIBILITY_CASES_FILE = ROOT / "tests" / "fixtures" / "eligibility_cases.json"
ELIGIBILITY_CLI_SCRIPT = ROOT / "scripts" / "eligibility_cli.php"
CANONICAL_CASE_NUMBERS = list(range(1, 19)) + [21, 22, 23, 24]
CANONICAL_CASE_PREFIXES = tuple(f"C{index:02d}" for index in CANONICAL_CASE_NUMBERS)
ADDITIONAL_CASE_PREFIXES = ("C04b", "Z02")
JS_ROOT = ROOT / "public" / "js"

ASABA_MIXED_PAIRS: Tuple[Tuple[str, str], ...] = (
    ("son", "daughter"),
    ("sons_son", "sons_daughter"),
    ("full_brother", "full_sister"),
    ("consanguine_brother", "consanguine_sister"),
)

FULL_SIBLING_PRIORITY_BLOCKS: Tuple[Tuple[str, ...], ...] = (
    ("full_brother", "consanguine_brother"),
    ("full_sister", "consanguine_sister"),
)


def discover_js_syntax_targets() -> List[Path]:
    targets: List[Path] = []
    if not JS_ROOT.exists():
        return targets

    for path in JS_ROOT.rglob("*.js"):
        relative = path.relative_to(JS_ROOT)
        if relative.parts and relative.parts[0] == "vendor":
            continue
        targets.append(path)

    targets.sort()
    return targets


def run_process(
    command: List[str],
    *,
    input_data: str | None = None,
    stream_output: bool = True,
    env: Dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a subprocess and stream output to the current stdout/stderr."""
    result = subprocess.run(
        command,
        cwd=ROOT,
        input=input_data,
        text=True,
        capture_output=True,
        check=False,
        env=env,
    )

    if stream_output:
        if result.stdout:
            sys.stdout.write(result.stdout)
        if result.stderr:
            sys.stderr.write(result.stderr)

    return result


def run_rulebook_smoke() -> None:
    command = ["php", str(SMOKE_SCRIPT)]
    result = run_process(command)
    if result.returncode != 0:
        raise RuntimeError("Rulebook smoke test failed.")


def run_fuzz_api() -> None:
    command = [sys.executable, str(FUZZ_SCRIPT), "--cases", "200"]
    result = run_process(command)
    if result.returncode != 0:
        raise RuntimeError("HTTP API fuzz test failed.")


def run_e2e_tests() -> None:
    from dev_subpath_server import start_subpath_server

    install = run_process(["npx", "playwright", "install", "chromium"])
    if install.returncode != 0:
        raise RuntimeError("Failed to install Playwright browsers.")

    with start_subpath_server() as server:
        env = os.environ.copy()
        env["HERITAGE_BASE_URL"] = server.base_url
        result = run_process(["npx", "playwright", "test"], env=env)
        if result.returncode != 0:
            raise RuntimeError("E2E UI audit failed.")


def run_js_syntax_check() -> None:
    version_check = run_process(["node", "--version"])
    if version_check.returncode != 0:
        raise RuntimeError("JS syntax check requires Node.js (node --version failed).")

    targets = discover_js_syntax_targets()
    if not targets:
        raise RuntimeError(f"No JS files discovered under {JS_ROOT} for syntax check.")

    for target in targets:
        rel_path = target.relative_to(ROOT)
        result = run_process(["node", "--check", str(target)])
        if result.returncode != 0:
            raise RuntimeError(f"JS syntax check failed for {rel_path}.")


def load_fraction_cases() -> List[Dict[str, Any]]:
    try:
        raw = FRACTION_FIXTURE.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise RuntimeError(f"Missing fraction fixture: {FRACTION_FIXTURE}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed to decode {FRACTION_FIXTURE}: {exc}") from exc

    if not isinstance(data, list):
        raise RuntimeError(f"Fraction fixture must be a list: {FRACTION_FIXTURE}")

    return data


def run_fraction_validation(cases: List[Dict[str, Any]]) -> None:
    payload = json.dumps(cases)

    command = ["php", str(FRACTION_SMOKE_SCRIPT)]
    result = run_process(command, input_data=payload)
    if result.returncode != 0:
        raise RuntimeError("Fraction validation failed.")


def load_cli_fixture(path: Path) -> Dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise RuntimeError(f"Missing CLI fixture: {path}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed to decode CLI fixture {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise RuntimeError(f"CLI fixture must be a JSON object: {path}")

    return data


def _resolve_case_fixture(prefix: str) -> Path:
    matches = sorted(CLI_FIXTURE_DIR.glob(f"{prefix}_*.json"))
    if not matches:
        fallback = CLI_FIXTURE_DIR / f"{prefix}.json"
        if fallback.exists():
            matches.append(fallback)

    if not matches:
        raise RuntimeError(f"Unable to locate fixture for case prefix {prefix}")

    return matches[0]


def discover_cli_fixtures() -> List[Path]:
    fixtures: List[Path] = []

    for prefix in CANONICAL_CASE_PREFIXES:
        fixtures.append(_resolve_case_fixture(prefix))

    for prefix in ADDITIONAL_CASE_PREFIXES:
        fixtures.append(_resolve_case_fixture(prefix))

    seen: Dict[Path, None] = {}
    unique_fixtures: List[Path] = []
    for fixture in fixtures:
        if fixture in seen:
            continue
        seen[fixture] = None
        unique_fixtures.append(fixture)

    return unique_fixtures


def ensure_string(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise RuntimeError(f"{label} must be a string, got {type(value)!r}")
    return value


def ensure_string_list(value: Any, label: str) -> List[str]:
    if not isinstance(value, list):
        raise RuntimeError(f"{label} must be a list, got {type(value)!r}")
    result: List[str] = []
    for index, item in enumerate(value):
        result.append(ensure_string(item, f"{label}[{index}]"))
    return result


def ensure_bool(value: Any, label: str) -> bool:
    if not isinstance(value, bool):
        raise RuntimeError(f"{label} must be a boolean, got {type(value)!r}")
    return value


def parse_fraction(value: str, label: str) -> PyFraction:
    try:
        numerator, denominator = value.split("/", 1)
        return PyFraction(int(numerator), int(denominator))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"{label}: invalid fraction '{value}'") from exc


def _all_zero(values: List[str], label: str) -> bool:
    for index, entry in enumerate(values):
        fraction = parse_fraction(entry, f"{label}[{index}]")
        if fraction != PyFraction(0, 1):
            return False

    return True


def ensure_fraction_map(case_id: str, mapping: Dict[str, Any], label: str) -> Dict[str, str]:
    normalized: Dict[str, str] = {}
    for role, raw in mapping.items():
        normalized[role] = ensure_string(raw, f"{case_id}.{label}.{role}")
    return normalized


def ensure_fraction_lists(case_id: str, mapping: Dict[str, Any], label: str) -> Dict[str, List[str]]:
    normalized: Dict[str, List[str]] = {}
    for role, raw in mapping.items():
        normalized[role] = ensure_string_list(raw, f"{case_id}.{label}.{role}")
    return normalized


def extract_expected_shares(
    case_id: str, data: Dict[str, Any]
) -> Tuple[Dict[str, str], Dict[str, List[str]], Dict[str, Any]]:
    expected_raw = data.get("expected", {})
    if expected_raw is None:
        expected_raw = {}
    if not isinstance(expected_raw, dict):
        raise RuntimeError(f"Fixture {case_id} expected must be an object when provided")

    shares = expected_raw.get("shares", {})
    if shares and not isinstance(shares, dict):
        raise RuntimeError(f"Fixture {case_id} expected.shares must be an object")

    groups: Dict[str, str] = {}
    individuals: Dict[str, List[str]] = {}

    for role, spec in shares.items():
        entry_label = f"{case_id}.expected.shares.{role}"
        if isinstance(spec, str):
            groups[role] = ensure_string(spec, entry_label)
            continue

        if isinstance(spec, list):
            individuals[role] = ensure_string_list(spec, entry_label)
            continue

        if isinstance(spec, dict):
            if "group" in spec:
                groups[role] = ensure_string(spec["group"], f"{entry_label}.group")
            if "individuals" in spec:
                if not isinstance(spec["individuals"], list):
                    raise RuntimeError(f"{entry_label}.individuals must be a list")
                individuals[role] = ensure_string_list(spec["individuals"], f"{entry_label}.individuals")
            continue

        raise RuntimeError(f"Unsupported expected share format for {entry_label}")

    group_shares = expected_raw.get("group_shares")
    if group_shares is not None:
        if not isinstance(group_shares, dict):
            raise RuntimeError(f"Fixture {case_id} expected.group_shares must be an object")
        merge_expected_maps(
            case_id,
            groups,
            individuals,
            ensure_fraction_map(case_id, group_shares, "expected.group_shares"),
            {},
        )

    individual_shares = expected_raw.get("individual_shares")
    if individual_shares is not None:
        if not isinstance(individual_shares, dict):
            raise RuntimeError(f"Fixture {case_id} expected.individual_shares must be an object")
        merge_expected_maps(
            case_id,
            groups,
            individuals,
            {},
            ensure_fraction_lists(case_id, individual_shares, "expected.individual_shares"),
        )

    return groups, individuals, expected_raw


def merge_expected_maps(
    case_id: str,
    target_groups: Dict[str, str],
    target_individuals: Dict[str, List[str]],
    extra_groups: Dict[str, str],
    extra_individuals: Dict[str, List[str]],
) -> None:
    for role, value in extra_groups.items():
        if role in target_groups and target_groups[role] != value:
            raise RuntimeError(
                f"{case_id}: conflicting expected group share for {role} between sources"
                f" ({target_groups[role]} vs {value})"
            )
        target_groups[role] = value

    for role, values in extra_individuals.items():
        if role in target_individuals and target_individuals[role] != values:
            raise RuntimeError(
                f"{case_id}: conflicting expected individual shares for {role} between sources"
            )
        target_individuals[role] = values


def compare_share_maps(case_id: str, expected: Dict[str, str], actual: Dict[str, Any]) -> None:
    canonical_expected = canonicalize_group_shares(case_id, expected, "expected.group_shares")
    canonical_actual = canonicalize_group_shares(case_id, actual, "group_shares")

    for role, expected_share in canonical_expected.items():
        label = f"{case_id}.group_shares.{role}"
        actual_share = canonical_actual.get(role, "0/1")
        if actual_share != expected_share:
            raise RuntimeError(f"{label}: expected {expected_share}, got {actual_share}")


def canonicalize_alias_lists(case_id: str, actual: Dict[str, Any]) -> Dict[str, List[str]]:
    canonical: Dict[str, List[str]] = {}

    for role, values in actual.items():
        label = f"{case_id}.individual_shares.{role}"
        value_list = ensure_string_list(values, label)
        canonical_key = ALIAS_CANONICAL_GROUPS.get(role, role)

        existing = canonical.get(canonical_key)
        if existing is None:
            canonical[canonical_key] = value_list
            continue

        if existing == value_list:
            continue

        if _all_zero(existing, label) and not _all_zero(value_list, label):
            canonical[canonical_key] = value_list
            continue

        if _all_zero(value_list, label) and not _all_zero(existing, label):
            continue

        raise RuntimeError(
            f"{case_id}: alias individuals for {canonical_key} disagree ({existing} vs {value_list})"
        )

    return canonical


def canonicalize_group_shares(case_id: str, shares: Dict[str, Any], label_prefix: str) -> Dict[str, str]:
    canonical: Dict[str, str] = {}

    for role, share_raw in shares.items():
        label = f"{case_id}.{label_prefix}.{role}"
        share_value = ensure_string(share_raw, label)
        canonical_key = ALIAS_CANONICAL_GROUPS.get(role, role)

        existing = canonical.get(canonical_key)
        if existing is not None and existing != share_value:
            raise RuntimeError(
                f"{case_id}: alias group shares for {canonical_key} disagree ({existing} vs {share_value})"
            )

        canonical[canonical_key] = share_value

    return canonical


def compare_individual_maps(case_id: str, expected: Dict[str, List[str]], actual: Dict[str, Any]) -> None:
    canonical_actual = canonicalize_alias_lists(case_id, actual)

    for role, expected_list in expected.items():
        canonical = ALIAS_CANONICAL_GROUPS.get(role, role)
        label = f"{case_id}.individual_shares.{role}"
        actual_list = canonical_actual.get(canonical, [])
        if actual_list != expected_list:
            raise RuntimeError(f"{label}: expected {expected_list}, got {actual_list}")


def ensure_trace_event_list(case_id: str, events: Any, label: str) -> List[Dict[str, Any]]:
    if not isinstance(events, list):
        raise RuntimeError(f"{case_id}.{label} must be a list")

    normalized: List[Dict[str, Any]] = []
    for index, event in enumerate(events):
        entry_label = f"{case_id}.{label}[{index}]"
        if not isinstance(event, dict):
            raise RuntimeError(f"{entry_label} must be an object")

        ensure_string(event.get("rule_id"), f"{entry_label}.rule_id")

        targets = event.get("targets")
        if not isinstance(targets, list):
            raise RuntimeError(f"{entry_label}.targets must be a list")
        for target_index, target in enumerate(targets):
            ensure_string(target, f"{entry_label}.targets[{target_index}]")

        ensure_string(event.get("reason"), f"{entry_label}.reason")

        phase = event.get("phase")
        if phase is not None:
            ensure_string(phase, f"{entry_label}.phase")

        data = event.get("data")
        if data is not None and not isinstance(data, dict):
            raise RuntimeError(f"{entry_label}.data must be an object when present")

        normalized.append(event)

    return normalized


def data_subset(expected: Any, actual: Any) -> bool:
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return False
        for key, value in expected.items():
            if key not in actual:
                return False
            if not data_subset(value, actual[key]):
                return False
        return True

    if isinstance(expected, list):
        if not isinstance(actual, list):
            return False
        if len(expected) != len(actual):
            return False
        return all(data_subset(ev, av) for ev, av in zip(expected, actual))

    return actual == expected


def step_matches(spec: Dict[str, Any], step: Dict[str, Any]) -> bool:
    for key, expected in spec.items():
        if key == "stage":
            actual_stage = step.get("stage")
            if not isinstance(actual_stage, str) or actual_stage.lower() != str(expected).lower():
                return False
            continue

        if key == "changes":
            actual_changes = step.get("changes")
            if not data_subset(expected, actual_changes):
                return False
            continue

        if step.get(key) != expected:
            return False

    return True


def validate_explain_output(case_id: str, payload: str, expected: Any) -> None:
    command = ["php", str(CLI_SCRIPT), "--explain", "--stdin"]
    result = run_process(command, input_data=payload, stream_output=False)
    if result.returncode != 0:
        raise RuntimeError(f"CLI --explain execution failed for {case_id} with code {result.returncode}")

    stdout = result.stdout.strip()
    if stdout == "":
        raise RuntimeError(f"CLI --explain execution returned empty output for {case_id}")

    try:
        cli_output = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"CLI --explain output for {case_id} is not valid JSON: {exc}") from exc

    if not isinstance(cli_output, dict):
        raise RuntimeError(f"CLI --explain output for {case_id} must be a JSON object")

    explain = cli_output.get("explain")
    if explain is None:
        raise RuntimeError(f"{case_id}: explain section missing from CLI output")

    if explain is not None and not isinstance(explain, dict):
        raise RuntimeError(f"{case_id}: explain section must be an object")

    steps = explain.get("steps") if explain else None
    if steps is None:
        steps = []
    if not isinstance(steps, list):
        raise RuntimeError(f"{case_id}: explain.steps must be a list")

    normalized_steps: List[Dict[str, Any]] = []
    for step_index, raw_step in enumerate(steps):
        if not isinstance(raw_step, dict):
            raise RuntimeError(f"{case_id}: explain.steps[{step_index}] must be an object")

        stage = raw_step.get("stage")
        rule = raw_step.get("rule")
        note = raw_step.get("note")
        changes = raw_step.get("changes")

        ensure_string(stage, f"{case_id}: explain.steps[{step_index}].stage")
        ensure_string(rule, f"{case_id}: explain.steps[{step_index}].rule")
        ensure_string(note, f"{case_id}: explain.steps[{step_index}].note")

        if isinstance(changes, list):
            if changes:
                raise RuntimeError(
                    f"{case_id}: explain.steps[{step_index}].changes must be an object when provided"
                )
            changes = {}

        if not isinstance(changes, dict):
            raise RuntimeError(f"{case_id}: explain.steps[{step_index}].changes must be an object")

        normalized_changes: Dict[str, Dict[str, str]] = {}
        for role, entry in changes.items():
            ensure_string(role, f"{case_id}: explain.steps[{step_index}].changes role")
            if not isinstance(entry, dict):
                raise RuntimeError(
                    f"{case_id}: explain.steps[{step_index}].changes['{role}'] must be an object"
                )
            before = entry.get("before")
            after = entry.get("after")
            ensure_string(before, f"{case_id}: explain.steps[{step_index}].changes['{role}'].before")
            ensure_string(after, f"{case_id}: explain.steps[{step_index}].changes['{role}'].after")
            normalized_changes[role] = {"before": before, "after": after}

        normalized_steps.append(
            {
                "stage": stage,
                "rule": rule,
                "note": note,
                "changes": normalized_changes,
            }
        )

    if expected is None:
        return

    if not isinstance(expected, dict):
        raise RuntimeError(f"{case_id}: expected_explain must be an object when provided")

    includes = expected.get("includes", [])
    if includes:
        if not isinstance(includes, list):
            raise RuntimeError(f"{case_id}: expected_explain.includes must be a list when provided")
        for spec_index, spec in enumerate(includes):
            if not isinstance(spec, dict):
                raise RuntimeError(f"{case_id}: expected_explain.includes[{spec_index}] must be an object")
            if not any(step_matches(spec, step) for step in normalized_steps):
                raise RuntimeError(
                    f"{case_id}: explain steps missing expected pattern at expected_explain.includes[{spec_index}]"
                )

    forbid = expected.get("forbid_stages", [])
    if forbid:
        if not isinstance(forbid, list):
            raise RuntimeError(f"{case_id}: expected_explain.forbid_stages must be a list when provided")
        for stage_index, stage in enumerate(forbid):
            stage_label = f"{case_id}: expected_explain.forbid_stages[{stage_index}]"
            ensure_string(stage, stage_label)
            if any(step.get("stage") == stage for step in normalized_steps):
                raise RuntimeError(f"{case_id}: explain steps unexpectedly include stage {stage}")

ALIAS_CANONICAL_GROUPS: Dict[str, str] = {
    "daughter": "daughters",
    "daughters": "daughters",
    "wife": "wives",
    "wives": "wives",
    "full_sister": "full_sisters",
    "full_sisters": "full_sisters",
    "consanguine_sister": "consanguine_sisters",
    "consanguine_sisters": "consanguine_sisters",
    "uterine_brother": "uterine_siblings",
    "uterine_sister": "uterine_siblings",
    "uterine_siblings": "uterine_siblings",
}


def assert_sum_final_one(case_id: str, cli_output: Dict[str, Any], groups: Dict[str, str]) -> None:
    sum_final_raw = cli_output.get("sum_final")
    sum_final_str = ensure_string(sum_final_raw, f"{case_id}.sum_final")
    sum_final = parse_fraction(sum_final_str, f"{case_id}.sum_final")
    if sum_final != PyFraction(1, 1):
        raise RuntimeError(f"{case_id}.sum_final: expected 1/1, got {sum_final_str}")

    total = PyFraction(0, 1)
    seen_aliases: Dict[str, PyFraction] = {}
    for role, share in groups.items():
        label = f"{case_id}.group_shares.{role}"
        fraction = parse_fraction(share, label)
        canonical = ALIAS_CANONICAL_GROUPS.get(role, role)

        existing = seen_aliases.get(canonical)
        if existing is not None:
            if existing != fraction:
                raise RuntimeError(
                    f"{case_id}: alias group {role}={fraction} conflicts with {canonical}={existing}"
                )
            continue

        seen_aliases[canonical] = fraction
        total += fraction

    if total != PyFraction(1, 1):
        raise RuntimeError(f"{case_id}: group shares sum to {total} instead of 1/1")


def assert_asaba_mixed_ratios(case_id: str, individuals: Dict[str, List[str]]) -> None:
    for male_role, female_role in ASABA_MIXED_PAIRS:
        male_values = individuals.get(male_role, [])
        female_values = individuals.get(female_role, [])
        if not male_values or not female_values:
            continue

        male_shares: List[PyFraction] = []
        for index, value in enumerate(male_values):
            share = parse_fraction(value, f"{case_id}.individual_shares.{male_role}[{index}]")
            if share != PyFraction(0, 1):
                male_shares.append(share)

        female_shares: List[PyFraction] = []
        for index, value in enumerate(female_values):
            share = parse_fraction(value, f"{case_id}.individual_shares.{female_role}[{index}]")
            if share != PyFraction(0, 1):
                female_shares.append(share)

        if not male_shares or not female_shares:
            continue

        for male_share in male_shares:
            for female_share in female_shares:
                if male_share != female_share * 2:
                    raise RuntimeError(
                        f"{case_id}: expected 2:1 ratio between {male_role} and {female_role}, "
                        f"got {male_share} vs {female_share}"
                    )


def assert_full_sibling_priority(case_id: str, groups: Dict[str, str], individuals: Dict[str, List[str]]) -> None:
    for full_role, consanguine_role in FULL_SIBLING_PRIORITY_BLOCKS:
        if full_role not in groups:
            continue

        full_share = parse_fraction(groups[full_role], f"{case_id}.group_shares.{full_role}")
        if full_share == PyFraction(0, 1):
            continue

        consanguine_group = parse_fraction(
            groups.get(consanguine_role, "0/1"),
            f"{case_id}.group_shares.{consanguine_role}",
        )
        if consanguine_group != PyFraction(0, 1):
            raise RuntimeError(
                f"{case_id}: consanguine sibling {consanguine_role} received {consanguine_group} despite full sibling"
            )

        for index, value in enumerate(individuals.get(consanguine_role, [])):
            share = parse_fraction(value, f"{case_id}.individual_shares.{consanguine_role}[{index}]")
            if share != PyFraction(0, 1):
                raise RuntimeError(
                    f"{case_id}: consanguine sibling {consanguine_role}[{index}] received {share} despite full sibling"
                )


def run_cli_validation(paths: Iterable[Path]) -> None:
    for path in paths:
        data = load_cli_fixture(path)
        case_id = ensure_string(data.get("case_id", path.stem), f"fixture {path} case_id")

        input_payload = data.get("input")
        if not isinstance(input_payload, dict):
            raise RuntimeError(f"Fixture {case_id} must include an object under 'input'")

        expected_groups: Dict[str, str] = {}
        expected_individuals: Dict[str, List[str]] = {}

        base_groups, base_individuals, expected_section = extract_expected_shares(case_id, data)
        merge_expected_maps(case_id, expected_groups, expected_individuals, base_groups, base_individuals)

        audit_awl_expected: str | None = None
        audit_radd_expected: str | None = None
        audit_asaba_expected: Dict[str, str] | None = None
        audit_asaba_method_expected: str | None = None
        expected_amounts: Dict[str, str] | None = None
        expected_currency: str | None = None
        if isinstance(expected_section, dict):
            if "audit_awl_factor" in expected_section:
                audit_awl_expected = ensure_string(
                    expected_section["audit_awl_factor"],
                    f"{case_id}.expected.audit_awl_factor",
                )
            if "audit_radd_residual" in expected_section:
                audit_radd_expected = ensure_string(
                    expected_section["audit_radd_residual"],
                    f"{case_id}.expected.audit_radd_residual",
                )
            if "audit_asaba_alloc_contains" in expected_section:
                alloc_expected = expected_section["audit_asaba_alloc_contains"]
                if not isinstance(alloc_expected, dict):
                    raise RuntimeError(
                        f"Fixture {case_id} expected.audit_asaba_alloc_contains must be an object"
                    )
                audit_asaba_expected = ensure_fraction_map(
                    case_id, alloc_expected, "expected.audit_asaba_alloc_contains"
                )
            if "audit_asaba_method" in expected_section:
                audit_asaba_method_expected = ensure_string(
                    expected_section["audit_asaba_method"],
                    f"{case_id}.expected.audit_asaba_method",
                )
            if "amounts_by_role" in expected_section:
                amounts_expected = expected_section["amounts_by_role"]
                if not isinstance(amounts_expected, dict):
                    raise RuntimeError(
                        f"Fixture {case_id} expected.amounts_by_role must be an object"
                    )
                expected_amounts = {
                    role: ensure_string(value, f"{case_id}.expected.amounts_by_role.{role}")
                    for role, value in amounts_expected.items()
                }
            if "currency" in expected_section:
                expected_currency = ensure_string(
                    expected_section["currency"], f"{case_id}.expected.currency"
                )

        # Support optional per-fixture CLI flags without altering existing payload semantics.
        cli_flags_raw = input_payload.get("cli_flags")
        cli_flags: List[str] = []
        if cli_flags_raw is not None:
            cli_flags = ensure_string_list(cli_flags_raw, f"{case_id}.input.cli_flags")

        effective_flags = list(cli_flags)
        needs_audit = any(
            expectation is not None
            for expectation in (
                audit_awl_expected,
                audit_radd_expected,
                audit_asaba_expected,
                audit_asaba_method_expected,
            )
        )
        if needs_audit and "--audit" not in effective_flags:
            effective_flags.append("--audit")

        if expected_amounts is not None and "estate_value" not in input_payload:
            raise RuntimeError(
                f"{case_id}: expected.amounts_by_role requires input.estate_value"
            )

        if expected_currency is not None and expected_amounts is None:
            raise RuntimeError(
                f"{case_id}: expected.currency requires expected.amounts_by_role"
            )

        payload_input = dict(input_payload)
        payload_input.pop("cli_flags", None)

        payload = json.dumps(payload_input)
        command = ["php", str(CLI_SCRIPT), "--stdin", *effective_flags]
        result = run_process(command, input_data=payload, stream_output=False)
        if result.returncode != 0:
            raise RuntimeError(f"CLI execution failed for {case_id} with code {result.returncode}")

        stdout = result.stdout.strip()
        if stdout == "":
            raise RuntimeError(f"CLI execution returned empty output for {case_id}")

        if "--audit" in effective_flags:
            verifier_result = run_process(
                [sys.executable, str(VERIFY_LINEAR_SYSTEM_SCRIPT)],
                input_data=stdout,
                stream_output=False,
            )
            if verifier_result.returncode != 0:
                message = verifier_result.stderr or verifier_result.stdout or "unknown error"
                raise RuntimeError(
                    f"Linear system verification failed for {case_id}: {message.strip()}"
                )
            if verifier_result.stdout.strip() != "OK":
                raise RuntimeError(
                    f"Linear system verification produced unexpected output for {case_id}: "
                    f"{verifier_result.stdout.strip()}"
                )

        try:
            cli_output = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"CLI output for {case_id} is not valid JSON: {exc}") from exc

        if not isinstance(cli_output, dict):
            raise RuntimeError(f"CLI output for {case_id} must be a JSON object")

        expected_cli = data.get("expected_cli")
        extra_fields: Dict[str, str] = {}
        if expected_cli is not None:
            if not isinstance(expected_cli, dict):
                raise RuntimeError(f"Fixture {case_id} expected_cli must be an object when provided")

            cli_groups = expected_cli.get("group_shares", {})
            cli_individuals = expected_cli.get("individual_shares", {})
            if not isinstance(cli_groups, dict):
                raise RuntimeError(f"expected_cli.group_shares must be an object for {case_id}")
            if not isinstance(cli_individuals, dict):
                raise RuntimeError(f"expected_cli.individual_shares must be an object for {case_id}")

            merge_expected_maps(
                case_id,
                expected_groups,
                expected_individuals,
                ensure_fraction_map(case_id, cli_groups, "expected_cli.group_shares"),
                ensure_fraction_lists(case_id, cli_individuals, "expected_cli.individual_shares"),
            )

            for field in [
                "sum_fixed",
                "sum_fixed_normalized",
                "sum_final",
                "residual_before_asaba",
                "residual_consumed",
            ]:
                if field in expected_cli:
                    extra_fields[field] = ensure_string(expected_cli[field], f"{case_id}.expected_cli.{field}")

        groups_raw = cli_output.get("group_shares")
        individuals_raw = cli_output.get("individual_shares")
        if not isinstance(groups_raw, dict):
            raise RuntimeError(f"CLI output for {case_id} missing 'group_shares' map")
        if not isinstance(individuals_raw, dict):
            raise RuntimeError(f"CLI output for {case_id} missing 'individual_shares' map")

        groups = ensure_fraction_map(case_id, groups_raw, "group_shares")
        individuals = ensure_fraction_lists(case_id, individuals_raw, "individual_shares")

        compare_share_maps(case_id, expected_groups, groups)
        compare_individual_maps(case_id, expected_individuals, individuals)

        if expected_amounts is not None:
            amounts_raw = cli_output.get("amounts_by_role")
            if not isinstance(amounts_raw, dict):
                raise RuntimeError(
                    f"CLI output for {case_id} missing 'amounts_by_role' map"
                )
            actual_amounts: Dict[str, str] = {}
            for role, raw in amounts_raw.items():
                actual_amounts[role] = ensure_string(
                    raw, f"{case_id}.amounts_by_role.{role}"
                )

            for role, expected_amount in expected_amounts.items():
                label = f"{case_id}.amounts_by_role.{role}"
                actual_value = actual_amounts.get(role)
                if actual_value is None:
                    raise RuntimeError(f"{label}: missing from CLI output")
                if actual_value != expected_amount:
                    raise RuntimeError(
                        f"{label}: expected {expected_amount}, got {actual_value}"
                    )

            estate_value_raw = input_payload.get("estate_value")
            assert estate_value_raw is not None
            try:
                estate_value = Decimal(str(estate_value_raw))
            except InvalidOperation as exc:
                raise RuntimeError(
                    f"{case_id}: invalid estate_value {estate_value_raw!r}"
                ) from exc

            decimal_amounts: Dict[str, Decimal] = {}
            for role, amount_str in actual_amounts.items():
                try:
                    decimal_amounts[role] = Decimal(amount_str)
                except InvalidOperation as exc:
                    raise RuntimeError(
                        f"{case_id}: invalid decimal in amounts_by_role.{role}={amount_str!r}"
                    ) from exc

            total = sum(decimal_amounts.values(), Decimal("0"))

            if total != estate_value:
                raise RuntimeError(
                    f"{case_id}: amounts_by_role total {total} does not match estate_value {estate_value}"
                )

            if expected_currency is not None:
                currency_raw = cli_output.get("currency")
                currency = ensure_string(currency_raw, f"{case_id}.currency")
                if currency != expected_currency:
                    raise RuntimeError(
                        f"{case_id}.currency: expected {expected_currency}, got {currency}"
                    )
        elif expected_currency is not None:
            raise RuntimeError(
                f"{case_id}: expected.currency provided without amounts_by_role output"
            )

        audit_section: Dict[str, Any] | None = None
        if needs_audit:
            audit_raw = cli_output.get("audit")
            if not isinstance(audit_raw, dict):
                raise RuntimeError(f"{case_id}: audit data missing from CLI output")
            audit_section = audit_raw

        if audit_awl_expected is not None:
            assert audit_section is not None
            awl_section = audit_section.get("awl")
            if not isinstance(awl_section, dict):
                raise RuntimeError(f"{case_id}: audit.awl section missing from CLI output")
            factor_raw = awl_section.get("factor")
            factor = ensure_string(factor_raw, f"{case_id}.audit.awl.factor")
            if factor != audit_awl_expected:
                raise RuntimeError(
                    f"{case_id}.audit.awl.factor: expected {audit_awl_expected}, got {factor}"
                )

        if audit_radd_expected is not None:
            assert audit_section is not None
            radd_section = audit_section.get("radd")
            if not isinstance(radd_section, dict):
                raise RuntimeError(f"{case_id}: audit.radd section missing from CLI output")
            residual_raw = radd_section.get("residual")
            residual = ensure_string(residual_raw, f"{case_id}.audit.radd.residual")
            if residual != audit_radd_expected:
                raise RuntimeError(
                    f"{case_id}.audit.radd.residual: expected {audit_radd_expected}, got {residual}"
                )

        asaba_section: Dict[str, Any] | None = None
        if audit_asaba_expected is not None or audit_asaba_method_expected is not None:
            assert audit_section is not None
            asaba_raw = audit_section.get("asaba")
            if not isinstance(asaba_raw, dict):
                raise RuntimeError(f"{case_id}: audit.asaba section missing from CLI output")
            asaba_section = asaba_raw

        if audit_asaba_method_expected is not None:
            assert asaba_section is not None
            method_raw = asaba_section.get("method")
            method_value = ensure_string(method_raw, f"{case_id}.audit.asaba.method")
            if method_value != audit_asaba_method_expected:
                raise RuntimeError(
                    f"{case_id}.audit.asaba.method: expected {audit_asaba_method_expected}, got {method_value}"
                )

        if audit_asaba_expected is not None:
            assert asaba_section is not None
            alloc_section = asaba_section.get("alloc")
            if not isinstance(alloc_section, dict):
                raise RuntimeError(f"{case_id}: audit.asaba.alloc missing from CLI output")
            for role, expected_share in audit_asaba_expected.items():
                actual_raw = alloc_section.get(role)
                actual_share = ensure_string(
                    actual_raw, f"{case_id}.audit.asaba.alloc.{role}"
                )
                if actual_share != expected_share:
                    raise RuntimeError(
                        f"{case_id}.audit.asaba.alloc.{role}: expected {expected_share}, got {actual_share}"
                    )

        context_expected = expected_section.get("context_flags") if isinstance(expected_section, dict) else None
        if context_expected is not None:
            if not isinstance(context_expected, dict):
                raise RuntimeError(f"Fixture {case_id} expected.context_flags must be an object")

            context_output = cli_output.get("context")
            if isinstance(context_output, dict):
                for flag, expected_value in context_expected.items():
                    expected_bool = ensure_bool(expected_value, f"{case_id}.expected.context_flags.{flag}")
                    actual_raw = context_output.get(flag)
                    label = f"{case_id}.context_flags.{flag}"
                    actual_bool = ensure_bool(actual_raw, label)
                    if actual_bool != expected_bool:
                        raise RuntimeError(
                            f"{case_id}: expected context flag {flag}={expected_bool}, got {actual_bool}"
                        )

        warnings_expected = expected_section.get("warnings_contains") if isinstance(expected_section, dict) else None
        if warnings_expected is not None:
            warnings_list = ensure_string_list(warnings_expected, f"{case_id}.expected.warnings_contains")
            warnings_output = cli_output.get("warnings")
            if isinstance(warnings_output, list):
                actual_warnings = ensure_string_list(warnings_output, f"{case_id}.warnings")
                for substring in warnings_list:
                    if not any(substring in warning for warning in actual_warnings):
                        raise RuntimeError(
                            f"{case_id}: expected warning containing '{substring}' not found in {actual_warnings}"
                        )

        normalized_roles_expected = expected_section.get("normalized_roles") if isinstance(expected_section, dict) else None
        if normalized_roles_expected is not None:
            expected_roles_list = ensure_string_list(
                normalized_roles_expected, f"{case_id}.expected.normalized_roles"
            )
            normalized_roles_output = cli_output.get("normalized_roles")
            if isinstance(normalized_roles_output, list):
                actual_roles_list = ensure_string_list(
                    normalized_roles_output, f"{case_id}.normalized_roles"
                )
                if actual_roles_list != expected_roles_list:
                    raise RuntimeError(
                        f"{case_id}: expected normalized roles {expected_roles_list}, got {actual_roles_list}"
                    )

        for field, expected_value in extra_fields.items():
            actual_raw = cli_output.get(field)
            actual_str = ensure_string(actual_raw, f"{case_id}.{field}")
            if actual_str != expected_value:
                raise RuntimeError(f"{case_id}.{field}: expected {expected_value}, got {actual_str}")

        traces = cli_output.get("traces")
        if not isinstance(traces, list):
            raise RuntimeError(f"CLI output for {case_id} must include a 'traces' list")

        for index, trace in enumerate(traces):
            label = f"{case_id}.traces[{index}]"
            if not isinstance(trace, dict):
                raise RuntimeError(f"{label} must be an object")
            ensure_string(trace.get("rule_id"), f"{label}.rule_id")
            targets = trace.get("targets")
            if not isinstance(targets, list):
                raise RuntimeError(f"{label}.targets must be a list")
            for target_index, target in enumerate(targets):
                ensure_string(target, f"{label}.targets[{target_index}]")
            ensure_string(trace.get("reason"), f"{label}.reason")

        assert_sum_final_one(case_id, cli_output, groups)
        assert_asaba_mixed_ratios(case_id, individuals)
        assert_full_sibling_priority(case_id, groups, individuals)

        validate_explain_output(case_id, payload, data.get("expected_explain"))


def load_eligibility_cases(path: Path) -> List[Dict[str, Any]]:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise RuntimeError(f"Missing eligibility fixture: {path}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed to decode eligibility fixture {path}: {exc}") from exc

    if not isinstance(data, list):
        raise RuntimeError(f"Eligibility fixture must be a list of cases: {path}")

    return data


def run_eligibility_cases(cases: List[Dict[str, Any]]) -> None:
    total = len(cases)
    passed = 0

    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            raise RuntimeError(f"eligibility case at index {index} must be an object")

        case_id = ensure_string(case.get("id", f"eligibility_{index}"), f"case[{index}].id")

        input_payload = case.get("input")
        if not isinstance(input_payload, dict):
            raise RuntimeError(f"{case_id}: input must be an object")

        payload = json.dumps(input_payload)
        result = run_process(["php", str(ELIGIBILITY_CLI_SCRIPT)], input_data=payload, stream_output=False)
        if result.returncode != 0:
            raise RuntimeError(f"Eligibility CLI failed for {case_id} with code {result.returncode}")

        stdout = result.stdout.strip()
        if stdout == "":
            raise RuntimeError(f"Eligibility CLI returned empty output for {case_id}")

        try:
            cli_output = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Eligibility CLI output for {case_id} is not valid JSON: {exc}") from exc

        if not isinstance(cli_output, dict):
            raise RuntimeError(f"Eligibility CLI output for {case_id} must be an object")

        eligible_raw = cli_output.get("eligibleHeirs")
        if not isinstance(eligible_raw, list):
            raise RuntimeError(f"{case_id}: eligibleHeirs must be a list")

        actual_roles: List[str] = []
        for heir_index, heir in enumerate(eligible_raw):
            label = f"{case_id}.eligibleHeirs[{heir_index}]"
            if not isinstance(heir, dict):
                raise RuntimeError(f"{label} must be an object")
            role = ensure_string(heir.get("role"), f"{label}.role")
            count = heir.get("count")
            if count is not None and not isinstance(count, int):
                raise RuntimeError(f"{label}.count must be an integer when provided")
            alive = heir.get("alive")
            if alive is not None:
                ensure_bool(alive, f"{label}.alive")
            actual_roles.append(role)

        actual_roles_sorted = sorted(actual_roles)

        expected = case.get("expect")
        if not isinstance(expected, dict):
            raise RuntimeError(f"{case_id}: expect must be an object")

        expected_roles = ensure_string_list(expected.get("eligible_roles", []), f"{case_id}.expect.eligible_roles")
        if actual_roles_sorted != sorted(expected_roles):
            raise RuntimeError(
                f"{case_id}: eligible roles mismatch. expected {sorted(expected_roles)}, got {actual_roles_sorted}"
            )

        context = cli_output.get("context")
        if not isinstance(context, dict):
            raise RuntimeError(f"{case_id}: context must be an object")

        blocked_actual = sorted(ensure_string_list(context.get("blockedRoles", []), f"{case_id}.context.blockedRoles"))
        if "blocked_roles" in expected:
            expected_blocked = sorted(
                ensure_string_list(expected["blocked_roles"], f"{case_id}.expect.blocked_roles")
            )
            if blocked_actual != expected_blocked:
                raise RuntimeError(f"{case_id}: blocked roles mismatch. expected {expected_blocked}, got {blocked_actual}")

        for flag_key in ["motherReduced", "uterinesBlocked", "motherThirdOfRemainderCandidate"]:
            label = f"{case_id}.context.{flag_key}"
            if flag_key not in context:
                raise RuntimeError(f"{label} missing from CLI context output")

            actual_value = ensure_bool(context[flag_key], label)

            if flag_key in expected:
                expected_value = ensure_bool(expected[flag_key], f"{case_id}.expect.{flag_key}")
                if actual_value != expected_value:
                    raise RuntimeError(
                        f"{case_id}: expected {flag_key}={expected_value}, got {actual_value}"
                    )

        applied_flags_actual = sorted(
            ensure_string_list(context.get("appliedSpecialFlags", []), f"{case_id}.context.appliedSpecialFlags")
        )
        if "applied_flags" in expected:
            expected_flags = sorted(
                ensure_string_list(expected["applied_flags"], f"{case_id}.expect.applied_flags")
            )
            if applied_flags_actual != expected_flags:
                raise RuntimeError(
                    f"{case_id}: expected applied flags {expected_flags}, got {applied_flags_actual}"
                )

        notes_raw = cli_output.get("notes")
        if not isinstance(notes_raw, list):
            raise RuntimeError(f"{case_id}: notes must be a list")

        actual_notes: Dict[str, List[Dict[str, Any]]] = {}
        for note_index, note in enumerate(notes_raw):
            label = f"{case_id}.notes[{note_index}]"
            if not isinstance(note, dict):
                raise RuntimeError(f"{label} must be an object")
            rule_id = ensure_string(note.get("ruleId"), f"{label}.ruleId")
            reason = ensure_string(note.get("reason"), f"{label}.reason")
            if reason.strip() == "":
                raise RuntimeError(f"{label}.reason must not be empty")
            targets = sorted(ensure_string_list(note.get("targets", []), f"{label}.targets"))
            actual_notes.setdefault(rule_id, []).append({
                "reason": reason,
                "targets": targets,
            })

        if "notes" in expected:
            expected_notes = expected["notes"]
            if not isinstance(expected_notes, list):
                raise RuntimeError(f"{case_id}.expect.notes must be a list")

            for note_index, expected_note in enumerate(expected_notes):
                if not isinstance(expected_note, dict):
                    raise RuntimeError(f"{case_id}.expect.notes[{note_index}] must be an object")

                note_id = ensure_string(expected_note.get("ruleId"), f"{case_id}.expect.notes[{note_index}].ruleId")
                expected_targets = sorted(
                    ensure_string_list(expected_note.get("targets", []), f"{case_id}.expect.notes[{note_index}].targets")
                )
                candidates = actual_notes.get(note_id, [])
                if not candidates:
                    raise RuntimeError(f"{case_id}: expected note {note_id} not found")

                expected_reason = None
                if "reason" in expected_note:
                    expected_reason = ensure_string(
                        expected_note["reason"],
                        f"{case_id}.expect.notes[{note_index}].reason",
                    )

                matched = False
                for candidate in candidates:
                    if candidate["targets"] != expected_targets:
                        continue
                    if expected_reason is not None and candidate["reason"] != expected_reason:
                        continue
                    matched = True
                    break

                if not matched:
                    raise RuntimeError(
                        f"{case_id}: expected note {note_id} with targets {expected_targets} not found"
                    )

        passed += 1

    if total > 0:
        print(f"Eligibility cases: {passed}/{total} passed")


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run repository smoke tests")
    parser.add_argument(
        "--include-fuzz",
        action="store_true",
        help="run HTTP API fuzzing (starts embedded PHP server)",
    )
    parser.add_argument(
        "--include-e2e",
        action="store_true",
        help="run Playwright UI audit against subpath harness",
    )
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    try:
        args = parse_args(argv)
        run_js_syntax_check()
        run_rulebook_smoke()
        cases = load_fraction_cases()
        run_fraction_validation(cases)
        run_cli_validation(discover_cli_fixtures())
        eligibility_cases = load_eligibility_cases(ELIGIBILITY_CASES_FILE)
        run_eligibility_cases(eligibility_cases)
        if args.include_fuzz:
            run_fuzz_api()
        if args.include_e2e:
            run_e2e_tests()
    except RuntimeError as exc:
        sys.stderr.write(f"{exc}\n")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
