import json
import os
import subprocess
import sys
from fractions import Fraction
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "scripts" / "calc_cli.php"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

TARGET_FIXTURES = [
    "C01_widower_daughter.json",
    "C02_four_wives_children_parents.json",
    "C03_spouse_two_daughters_parents_awl.json",
    "C04_spouse_parents_no_descendants.json",
    "C05_uterine_siblings_mother.json",
    "C06_father_two_daughters.json",
    "C07_three_wives_parents.json",
    "C08_son_daughter_asaba.json",
    "C09_uterine_blocked_by_descendant.json",
    "C10_daughters_full_siblings_residual.json",
    "DU100_daughter_plus_paternal_uncle.json",
    "DU101_son_blocks_paternal_uncle.json",
    "DU102_father_blocks_paternal_uncle.json",
    "C19_consanguine_sister_with_daughter.json",
    "C20_full_sister_blocks_consanguine.json",
    "C25_wives_three_equal_split.json",
    "C26_sons_daughter_equal_split.json",
    "C27_two_to_one_distribution.json",

    "C35_sons_sons_son_asaba.json",
    "C36_daughter_plus_gdaughters_complement.json",
    "C37_two_daughters_block_gdaughters.json",
    "C38_daughter_great_gdaughters_deeper_male.json",

    "C32_paternal_grandmother_only.json",
    "C33_both_grandmothers_single_closest.json",
    "C34_both_grandmothers_two_lines_share.json",
    "C41_paternal_grandmother_blocked_by_father.json",

    "Z02_input_normalization.json",
    "Z04_merge_duplicates.json",
    "Z05_negative_count_error.json",

    "Z06_wife_wives_merge.json",

    "Z11_logical_warnings.json",

    "Z30_audit_asaba_descendants_method.json",
    "Z31_audit_asaba_ascendants_method.json",
    "Z32_audit_asaba_full_siblings_method.json",
    "Z33_audit_asaba_consanguine_method.json",
    "Z34_audit_asaba_sisters_with_daughters_method.json",

    "Z15_yaml_schema_ok.json",
    "Z16_yaml_schema_fail.json",

]

MIXED_ASABA_PAIRS: Tuple[Tuple[str, str], ...] = (
    ("son", "daughter"),
    ("sons_son", "sons_daughter"),
    ("sons_sons_son", "sons_sons_daughter"),
    ("full_brother", "full_sister"),
    ("consanguine_brother", "consanguine_sister"),
)

FULL_VS_CONSANGUINE: Tuple[Tuple[str, str], ...] = (
    ("full_brother", "consanguine_brother"),
    ("full_sister", "consanguine_sister"),
)

ROLE_ALIASES = {
    "daughters": "daughter",
    "sons": "son",
    "wives": "wife",
}


def parse_fraction(value: str) -> Fraction:
    if not isinstance(value, str):
        raise TypeError(f"Expected fraction string, got {type(value)!r}")
    num_str, den_str = value.split("/", 1)
    return Fraction(int(num_str), int(den_str))


def run_cli(
    payload: dict,
    args: Optional[List[str]] = None,
    expected_exit: int = 0,
    rulebook_path: Optional[Path] = None,
) -> dict:
    command = ["php", str(CLI), "--stdin"]
    if args:
        command.extend(args)

    env = os.environ.copy()
    if rulebook_path is not None:
        env["HERITAGE_RULEBOOK_PATH"] = str(rulebook_path)

    proc = subprocess.run(
        command,
        input=json.dumps(payload),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        text=True,
        env=env,
    )
    if proc.returncode != expected_exit:
        raise RuntimeError(
            f"CLI exited with {proc.returncode} (expected {expected_exit}): "
            f"{proc.stderr.strip() or proc.stdout.strip()}"
        )

    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:  # pragma: no cover - debug helper
        raise RuntimeError(f"Invalid JSON output: {exc}: {proc.stdout}") from exc


def ensure_fraction_map(case_id: str, mapping: Dict[str, str], label: str) -> Dict[str, Fraction]:
    result: Dict[str, Fraction] = {}
    for role, value in mapping.items():
        if not isinstance(value, str):
            raise RuntimeError(f"{case_id}: {label}.{role} must be a fraction string")
        result[role] = parse_fraction(value)
    return result


def ensure_fraction_lists(case_id: str, mapping: Dict[str, List[str]], label: str) -> Dict[str, List[Fraction]]:
    result: Dict[str, List[Fraction]] = {}
    for role, values in mapping.items():
        if not isinstance(values, list):
            raise RuntimeError(f"{case_id}: {label}.{role} must be a list")
        result[role] = [parse_fraction(value) for value in values]
    return result


def normalise_role(role: str) -> str:
    return ROLE_ALIASES.get(role, role)


def extract_expected_shares(case_id: str, payload: dict) -> Tuple[Dict[str, Fraction], Dict[str, List[Fraction]]]:
    expected_groups: Dict[str, Fraction] = {}
    expected_individuals: Dict[str, List[Fraction]] = {}

    shares = payload.get("shares")
    if isinstance(shares, dict):
        for role, spec in shares.items():
            if isinstance(spec, str):
                expected_groups[role] = parse_fraction(spec)
                continue

            if isinstance(spec, list):
                expected_individuals[role] = [parse_fraction(value) for value in spec]
                continue

            if isinstance(spec, dict):
                if "group" in spec:
                    expected_groups[role] = parse_fraction(str(spec["group"]))
                if "individuals" in spec:
                    individuals = spec["individuals"]
                    if not isinstance(individuals, list):
                        raise RuntimeError(
                            f"{case_id}: expected.shares.{role}.individuals must be a list"
                        )
                    expected_individuals[role] = [parse_fraction(str(value)) for value in individuals]
                continue

            raise RuntimeError(f"{case_id}: unsupported expected share format for role {role}")
    else:
        group_shares_raw = payload.get("group_shares")
        individual_shares_raw = payload.get("individual_shares")
        if isinstance(group_shares_raw, dict):
            expected_groups.update({
                role: parse_fraction(value) for role, value in group_shares_raw.items()
            })
        if isinstance(individual_shares_raw, dict):
            expected_individuals.update({
                role: [parse_fraction(value) for value in values]
                for role, values in individual_shares_raw.items()
            })
        if expected_groups == {} and expected_individuals == {}:
            raise RuntimeError(f"{case_id}: expected.shares must be an object")

    normalised_groups = {normalise_role(role): value for role, value in expected_groups.items()}
    normalised_individuals = {normalise_role(role): value for role, value in expected_individuals.items()}

    return normalised_groups, normalised_individuals


def assert_fraction_equal(expected: Fraction, actual: Fraction, label: str) -> None:
    if expected != actual:
        raise AssertionError(f"{label}: expected {expected}, got {actual}")


def assert_fraction_list_equal(expected: List[Fraction], actual: List[Fraction], label: str) -> None:
    if len(expected) != len(actual):
        raise AssertionError(
            f"{label}: expected {len(expected)} entries, got {len(actual)}"
        )
    for index, (exp_value, act_value) in enumerate(zip(expected, actual)):
        assert_fraction_equal(exp_value, act_value, f"{label}[{index}]")


def extract_final_shares(result: dict) -> Tuple[Dict[str, Fraction], Dict[str, List[Fraction]]]:
    final = result["shares"]["final"]
    raw_groups = ensure_fraction_map("CLI", final.get("groups", {}), "shares.final.groups")
    groups: Dict[str, Fraction] = {}
    for role, value in raw_groups.items():
        normalised = normalise_role(role)
        current = groups.get(normalised)
        if current is None or value > current:
            groups[normalised] = value

    raw_individuals = ensure_fraction_lists("CLI", final.get("individuals", {}), "shares.final.individuals")
    individuals: Dict[str, List[Fraction]] = {}
    for role, shares in raw_individuals.items():
        normalised = normalise_role(role)
        if normalised in individuals:
            current_sum = sum(individuals[normalised], Fraction(0, 1))
            candidate_sum = sum(shares, Fraction(0, 1))
            if candidate_sum > current_sum:
                individuals[normalised] = shares
            continue
        individuals[normalised] = shares

    return groups, individuals


def extract_cli_metadata(case_id: str, fixture: dict, result: dict) -> None:
    expected_cli = fixture.get("expected_cli")
    if expected_cli is None:
        return

    if not isinstance(expected_cli, dict):
        raise RuntimeError(f"{case_id}: expected_cli must be an object when provided")

    if "warnings" in expected_cli:
        expected_warnings = expected_cli["warnings"]
        if not isinstance(expected_warnings, list):
            raise RuntimeError(f"{case_id}: expected_cli.warnings must be a list")
        actual_warnings = result.get("warnings", [])
        if actual_warnings != expected_warnings:
            raise AssertionError(
                f"{case_id}: warnings mismatch: expected {expected_warnings}, got {actual_warnings}"
            )

    if "warnings_contains" in expected_cli:
        expected_contains = expected_cli["warnings_contains"]
        if not isinstance(expected_contains, list):
            raise RuntimeError(f"{case_id}: expected_cli.warnings_contains must be a list")
        actual_warnings = result.get("warnings", [])
        for needle in expected_contains:
            if not isinstance(needle, str):
                raise RuntimeError(
                    f"{case_id}: expected_cli.warnings_contains entries must be strings"
                )
            if not any(needle in warning for warning in actual_warnings):
                raise AssertionError(
                    f"{case_id}: expected warnings to contain '{needle}' within {actual_warnings}"
                )

    if "warnings_not_contains" in expected_cli:
        forbidden = expected_cli["warnings_not_contains"]
        if not isinstance(forbidden, list):
            raise RuntimeError(f"{case_id}: expected_cli.warnings_not_contains must be a list")
        actual_warnings = result.get("warnings", [])
        for needle in forbidden:
            if not isinstance(needle, str):
                raise RuntimeError(
                    f"{case_id}: expected_cli.warnings_not_contains entries must be strings"
                )
            if any(needle in warning for warning in actual_warnings):
                raise AssertionError(
                    f"{case_id}: unexpected warning containing '{needle}' within {actual_warnings}"
                )

    if "errors" in expected_cli:
        expected_errors = expected_cli["errors"]
        if not isinstance(expected_errors, list):
            raise RuntimeError(f"{case_id}: expected_cli.errors must be a list")
        actual_errors = result.get("errors", [])
        if actual_errors != expected_errors:
            raise AssertionError(
                f"{case_id}: errors mismatch: expected {expected_errors}, got {actual_errors}"
            )

    if "errors_contains" in expected_cli:
        expected_error_contains = expected_cli["errors_contains"]
        if not isinstance(expected_error_contains, list):
            raise RuntimeError(f"{case_id}: expected_cli.errors_contains must be a list")
        actual_errors = result.get("errors", [])
        for needle in expected_error_contains:
            if not isinstance(needle, str):
                raise RuntimeError(
                    f"{case_id}: expected_cli.errors_contains entries must be strings"
                )
            if not any(needle in error for error in actual_errors):
                raise AssertionError(
                    f"{case_id}: expected errors to contain '{needle}' within {actual_errors}"
                )

    if "meta" in expected_cli:
        expected_meta = expected_cli["meta"]
        if not isinstance(expected_meta, dict):
            raise RuntimeError(f"{case_id}: expected_cli.meta must be an object")
        actual_meta = result.get("meta")
        if not isinstance(actual_meta, dict):
            raise AssertionError(f"{case_id}: CLI meta missing or invalid")
        for key, value in expected_meta.items():
            if key not in actual_meta:
                raise AssertionError(f"{case_id}: meta missing key '{key}'")
            if actual_meta[key] != value:
                raise AssertionError(
                    f"{case_id}: meta.{key} mismatch: expected {value}, got {actual_meta[key]}"
                )

    if "schema_validation_errors" in expected_cli:
        expected_schema_errors = expected_cli["schema_validation_errors"]
        if not isinstance(expected_schema_errors, list):
            raise RuntimeError(
                f"{case_id}: expected_cli.schema_validation_errors must be a list"
            )
        actual_meta = result.get("meta", {})
        if not isinstance(actual_meta, dict):
            raise AssertionError(f"{case_id}: CLI meta missing for schema validation errors")
        actual_schema_errors = actual_meta.get("schema_validation_errors", [])
        if actual_schema_errors != expected_schema_errors:
            raise AssertionError(
                f"{case_id}: schema validation errors mismatch: "
                f"expected {expected_schema_errors}, got {actual_schema_errors}"
            )

    if "input_roles" in expected_cli:
        expected_roles = expected_cli["input_roles"]
        if not isinstance(expected_roles, list):
            raise RuntimeError(f"{case_id}: expected_cli.input_roles must be a list")
        heirs = result.get("input", {}).get("heirs", [])
        actual_roles = [normalise_role(heir.get("role")) for heir in heirs if isinstance(heir, dict)]
        expected_normalised = [normalise_role(role) for role in expected_roles]
        if actual_roles != expected_normalised:
            raise AssertionError(
                f"{case_id}: input roles mismatch: expected {expected_normalised}, got {actual_roles}"
            )

    if "input_heirs" in expected_cli:
        expected_heirs = expected_cli["input_heirs"]
        if not isinstance(expected_heirs, list):
            raise RuntimeError(f"{case_id}: expected_cli.input_heirs must be a list")
        actual_heirs = result.get("input", {}).get("heirs", [])
        normalised_actual = [
            {**heir, "role": normalise_role(heir.get("role"))}
            for heir in actual_heirs
            if isinstance(heir, dict)
        ]
        normalised_expected = [
            {**heir, "role": normalise_role(heir.get("role"))}
            for heir in expected_heirs
            if isinstance(heir, dict)
        ]
        if normalised_actual != normalised_expected:
            raise AssertionError(
                f"{case_id}: input heirs mismatch: expected {normalised_expected}, got {normalised_actual}"
            )

    raw_cli_groups, raw_cli_individuals = extract_final_shares(result)
    cli_groups: Dict[str, Fraction] = {}
    for role, value in raw_cli_groups.items():
        normalised = normalise_role(role)
        current = cli_groups.get(normalised)
        if current is None or value > current:
            cli_groups[normalised] = value

    cli_individuals: Dict[str, List[Fraction]] = {}
    for role, shares in raw_cli_individuals.items():
        normalised = normalise_role(role)
        if normalised in cli_individuals:
            current_sum = sum(cli_individuals[normalised], Fraction(0, 1))
            candidate_sum = sum(shares, Fraction(0, 1))
            if candidate_sum > current_sum:
                cli_individuals[normalised] = shares
            continue
        cli_individuals[normalised] = shares
    if "group_shares" in expected_cli:
        expected_groups_raw = ensure_fraction_map(case_id, expected_cli["group_shares"], "expected_cli.group_shares")
        expected_groups = {normalise_role(role): value for role, value in expected_groups_raw.items()}
        for role in expected_groups:
            cli_groups.setdefault(role, Fraction(0, 1))
        if set(expected_groups) != set(cli_groups):
            raise AssertionError(
                f"{case_id}: CLI group roles mismatch: expected {sorted(expected_groups)}, got {sorted(cli_groups)}"
            )
        for role, expected_fraction in expected_groups.items():
            assert_fraction_equal(expected_fraction, cli_groups[role], f"{case_id}: final.group.{role}")

    if "individual_shares" in expected_cli:
        expected_individuals_raw = ensure_fraction_lists(case_id, expected_cli["individual_shares"], "expected_cli.individual_shares")
        expected_individuals = {normalise_role(role): shares for role, shares in expected_individuals_raw.items()}
        for role in expected_individuals:
            cli_individuals.setdefault(role, [])
        if set(expected_individuals) != set(cli_individuals):
            raise AssertionError(
                f"{case_id}: CLI individual roles mismatch"
            )
        for role, expected_list in expected_individuals.items():
            assert_fraction_list_equal(expected_list, cli_individuals[role], f"{case_id}: final.individuals.{role}")

    extra_fields = {
        "sum_fixed": result["shares"]["fixed"]["sumFixed"],
        "sum_fixed_normalized": result["shares"]["normalized"]["sumFixedNormalized"],
        "sum_final": result["shares"]["final"].get("sumFinal", "0/1"),
        "residual_before_asaba": result["shares"]["normalized"].get("residualForAsaba", "0/1"),
        "residual_consumed": result["shares"].get("asaba", {}).get("residualConsumed", "0/1"),
    }

    for field, actual_value in extra_fields.items():
        if field in expected_cli:
            expected_value = parse_fraction(str(expected_cli[field]))
            assert_fraction_equal(expected_value, parse_fraction(actual_value), f"{case_id}: expected_cli.{field}")

    if "fixed" in expected_cli:
        fixed_expectation = expected_cli["fixed"]
        if not isinstance(fixed_expectation, dict):
            raise RuntimeError(f"{case_id}: expected_cli.fixed must be an object")

        fixed_section = result.get("shares", {}).get("fixed", {})
        if "group_shares" in fixed_expectation:
            expected_fixed_groups_raw = ensure_fraction_map(
                case_id,
                fixed_expectation["group_shares"],
                "expected_cli.fixed.group_shares",
            )
            actual_fixed_groups_raw = ensure_fraction_map(
                case_id,
                fixed_section.get("groups", {}),
                "shares.fixed.groups",
            )
            expected_fixed_groups = {normalise_role(role): value for role, value in expected_fixed_groups_raw.items()}
            actual_fixed_groups = {normalise_role(role): value for role, value in actual_fixed_groups_raw.items()}

            if set(expected_fixed_groups) != set(actual_fixed_groups):
                raise AssertionError(
                    f"{case_id}: fixed group roles mismatch: expected {sorted(expected_fixed_groups)}, got {sorted(actual_fixed_groups)}"
                )

            for role, expected_value in expected_fixed_groups.items():
                assert_fraction_equal(
                    expected_value,
                    actual_fixed_groups[role],
                    f"{case_id}: fixed.group.{role}",
                )

        if "individual_shares" in fixed_expectation:
            expected_fixed_individuals_raw = ensure_fraction_lists(
                case_id,
                fixed_expectation["individual_shares"],
                "expected_cli.fixed.individual_shares",
            )
            actual_fixed_individuals_raw = ensure_fraction_lists(
                case_id,
                fixed_section.get("individuals", {}),
                "shares.fixed.individuals",
            )

            expected_fixed_individuals = {normalise_role(role): shares for role, shares in expected_fixed_individuals_raw.items()}
            actual_fixed_individuals = {normalise_role(role): shares for role, shares in actual_fixed_individuals_raw.items()}

            if set(expected_fixed_individuals) != set(actual_fixed_individuals):
                raise AssertionError(f"{case_id}: fixed individual roles mismatch")

            for role, expected_list in expected_fixed_individuals.items():
                assert_fraction_list_equal(
                    expected_list,
                    actual_fixed_individuals[role],
                    f"{case_id}: fixed.individuals.{role}",
                )

    if "traces" in expected_cli:
        expected_traces = expected_cli["traces"]
        if not isinstance(expected_traces, list):
            raise RuntimeError(f"{case_id}: expected_cli.traces must be a list")
        actual_traces = result["shares"].get("asaba", {}).get("notes", [])
        if len(expected_traces) != len(actual_traces):
            raise AssertionError(f"{case_id}: expected {len(expected_traces)} traces, got {len(actual_traces)}")
        for index, (expected_trace, actual_trace) in enumerate(zip(expected_traces, actual_traces)):
            for key in ("rule_id", "targets", "reason"):
                exp_value = expected_trace.get(key)
                act_value = actual_trace.get({
                    "rule_id": "ruleId",
                    "targets": "targets",
                    "reason": "reason",
                }[key])
                if exp_value != act_value:
                    raise AssertionError(f"{case_id}: trace[{index}].{key} mismatch")

    if "strict_exit_code" in expected_cli:
        strict_exit = expected_cli["strict_exit_code"]
        if not isinstance(strict_exit, int):
            raise RuntimeError(f"{case_id}: expected_cli.strict_exit_code must be an integer")
        strict_result = run_cli(
            build_cli_payload(fixture),
            args=["--strict"],
            expected_exit=strict_exit,
            rulebook_path=get_rulebook_path(fixture),
        )
        if "warnings" in expected_cli:
            strict_warnings = strict_result.get("warnings", [])
            expected_warnings = expected_cli["warnings"]
            if strict_warnings != expected_warnings:
                raise AssertionError(
                    f"{case_id}: strict warnings mismatch: expected {expected_warnings}, got {strict_warnings}"
                )
        if "warnings_contains" in expected_cli:
            strict_warnings = strict_result.get("warnings", [])
            for needle in expected_cli["warnings_contains"]:
                if not any(needle in warning for warning in strict_warnings):
                    raise AssertionError(
                        f"{case_id}: strict warnings expected to contain '{needle}' within {strict_warnings}"
                    )

        if "warnings_not_contains" in expected_cli:
            strict_warnings = strict_result.get("warnings", [])
            for needle in expected_cli["warnings_not_contains"]:
                if any(needle in warning for warning in strict_warnings):
                    raise AssertionError(
                        f"{case_id}: strict warnings should not contain '{needle}' within {strict_warnings}"
                    )
        if "errors" in expected_cli:
            strict_errors = strict_result.get("errors", [])
            expected_errors = expected_cli["errors"]
            if strict_errors != expected_errors:
                raise AssertionError(
                    f"{case_id}: strict errors mismatch: expected {expected_errors}, got {strict_errors}"
                )
        if "errors_contains" in expected_cli:
            strict_errors = strict_result.get("errors", [])
            for needle in expected_cli["errors_contains"]:
                if not any(needle in error for error in strict_errors):
                    raise AssertionError(
                        f"{case_id}: strict errors expected to contain '{needle}' within {strict_errors}"
                    )

        if "strict_schema_validation_errors" in expected_cli:
            expected_strict_schema_errors = expected_cli["strict_schema_validation_errors"]
            if not isinstance(expected_strict_schema_errors, list):
                raise RuntimeError(
                    f"{case_id}: expected_cli.strict_schema_validation_errors must be a list"
                )
            actual_schema_errors = strict_result.get("schema_validation_errors", [])
            if actual_schema_errors != expected_strict_schema_errors:
                raise AssertionError(
                    f"{case_id}: strict schema validation errors mismatch: "
                    f"expected {expected_strict_schema_errors}, got {actual_schema_errors}"
                )


def build_cli_payload(fixture: dict) -> dict:
    input_section = fixture.get("input", {})
    heirs = input_section.get("heirs", [])
    payload: Dict[str, object] = {"heirs": heirs}

    rulebook_flags = input_section.get("rulebook_flags")
    if rulebook_flags is not None:
        if not isinstance(rulebook_flags, dict):
            raise RuntimeError("input.rulebook_flags must be an object when provided")
        payload["rulebook_flags"] = rulebook_flags

    rulebook_path = input_section.get("rulebook_path")
    if rulebook_path is not None and not isinstance(rulebook_path, str):
        raise RuntimeError("input.rulebook_path must be a string when provided")

    return payload


def get_rulebook_path(fixture: dict) -> Optional[Path]:
    input_section = fixture.get("input", {})
    rulebook_path = input_section.get("rulebook_path")
    if rulebook_path is None:
        return None
    if not isinstance(rulebook_path, str):
        raise RuntimeError("input.rulebook_path must be a string when provided")
    candidate = Path(rulebook_path)
    if not candidate.is_absolute():
        candidate = (FIXTURES_DIR / candidate).resolve()
    return candidate


def assert_sum_to_one(groups: Dict[str, Fraction], case_id: str) -> None:
    total = sum(groups.values(), Fraction(0, 1))
    if total != Fraction(1, 1):
        raise AssertionError(f"{case_id}: final shares do not sum to 1 (got {total})")


def assert_collective_vs_individuals(groups: Dict[str, Fraction], individuals: Dict[str, List[Fraction]], case_id: str) -> None:
    for role, shares in individuals.items():
        total = sum(shares, Fraction(0, 1))
        group_share = groups.get(role, Fraction(0, 1))
        assert_fraction_equal(group_share, total, f"{case_id}: collective.{role}")


def assert_asaba_ratios(result: dict, case_id: str) -> None:
    asaba = result.get("shares", {}).get("asaba", {})
    raw = asaba.get("individuals", {})
    if isinstance(raw, dict):
        raw_individuals = ensure_fraction_lists(case_id, raw, "shares.asaba.individuals")
    else:
        raw_individuals = {}
    individuals: Dict[str, List[Fraction]] = {}
    for role, shares in raw_individuals.items():
        normalised = normalise_role(role)
        individuals.setdefault(normalised, []).extend(shares)

    for male_role, female_role in MIXED_ASABA_PAIRS:
        male_shares = [share for share in individuals.get(male_role, []) if share != Fraction(0, 1)]
        female_shares = [share for share in individuals.get(female_role, []) if share != Fraction(0, 1)]
        if not male_shares or not female_shares:
            continue
        male_total = sum(male_shares, Fraction(0, 1))
        female_total = sum(female_shares, Fraction(0, 1))
        male_average = male_total / len(male_shares)
        female_average = female_total / len(female_shares)
        assert_fraction_equal(
            female_average * 2,
            male_average,
            f"{case_id}: asaba_ratio.{male_role}/{female_role}",
        )


def assert_full_sibling_priority(groups: Dict[str, Fraction], individuals: Dict[str, List[Fraction]], case_id: str) -> None:
    for full_role, consanguine_role in FULL_VS_CONSANGUINE:
        full_share = groups.get(full_role, Fraction(0, 1))
        if full_share == Fraction(0, 1):
            continue
        consanguine_group = groups.get(consanguine_role, Fraction(0, 1))
        assert_fraction_equal(Fraction(0, 1), consanguine_group, f"{case_id}: full_priority.group.{consanguine_role}")
        for index, share in enumerate(individuals.get(consanguine_role, [])):
            assert_fraction_equal(Fraction(0, 1), share, f"{case_id}: full_priority.{consanguine_role}[{index}]")


def assert_spouses_not_in_radd(result: dict, case_id: str) -> None:
    fixed = result["shares"]["fixed"]
    normalized = result["shares"]["normalized"]
    residual = parse_fraction(normalized.get("residualForAsaba", "0/1"))
    diff = parse_fraction(normalized["sumFixedNormalized"]) - parse_fraction(fixed["sumFixed"])
    if diff <= Fraction(0, 1):
        return
    if residual != Fraction(0, 1):
        return
    final_groups = ensure_fraction_map(case_id, result["shares"]["final"]["groups"], "shares.final.groups")
    for spouse_role in ("husband", "wives"):
        fixed_share = fixed["groups"].get(spouse_role)
        if fixed_share is None:
            continue
        assert_fraction_equal(
            parse_fraction(fixed_share),
            final_groups.get(spouse_role, Fraction(0, 1)),
            f"{case_id}: spouse_radd.{spouse_role}"
        )


def assert_awl_preserves_ratios(result: dict, case_id: str) -> None:
    fixed_sum = parse_fraction(result["shares"]["fixed"]["sumFixed"])
    if fixed_sum <= Fraction(1, 1):
        return
    factor = Fraction(1, 1) / fixed_sum
    fixed_groups = ensure_fraction_map(case_id, result["shares"]["fixed"]["groups"], "shares.fixed.groups")
    normalized_groups = ensure_fraction_map(case_id, result["shares"]["normalized"]["groups"], "shares.normalized.groups")
    for role, fixed_share in fixed_groups.items():
        if fixed_share == Fraction(0, 1):
            continue
        normalized_share = normalized_groups.get(role)
        if normalized_share is None:
            continue
        assert_fraction_equal(fixed_share * factor, normalized_share, f"{case_id}: awl.{role}")


def assert_deterministic(fixture: dict, result: dict, case_id: str) -> None:
    rerun = run_cli(build_cli_payload(fixture), rulebook_path=get_rulebook_path(fixture))
    if rerun["shares"]["final"] != result["shares"]["final"]:
        raise AssertionError(f"{case_id}: CLI output not deterministic")


def verify_fixture(path: Path) -> None:
    with path.open("r", encoding="utf-8") as handle:
        fixture = json.load(handle)

    case_id = fixture.get("case_id", path.stem)
    heirs = fixture.get("input", {}).get("heirs")
    if not isinstance(heirs, list):
        raise RuntimeError(f"{case_id}: input.heirs must be a list")

    payload = build_cli_payload(fixture)
    result = run_cli(payload, rulebook_path=get_rulebook_path(fixture))
    final_groups, final_individuals = extract_final_shares(result)

    expected_groups, expected_individuals = extract_expected_shares(case_id, fixture.get("expected", {}))
    for role, expected_share in expected_groups.items():
        actual_share = final_groups.get(role, Fraction(0, 1))
        assert_fraction_equal(expected_share, actual_share, f"{case_id}: group.{role}")

    for role, expected_list in expected_individuals.items():
        actual_list = final_individuals.get(role, [])
        assert_fraction_list_equal(expected_list, actual_list, f"{case_id}: individuals.{role}")

    invariants = fixture.get("expected", {}).get("invariants", {})
    if invariants.get("sum_to_one"):
        assert_sum_to_one(final_groups, case_id)
    if invariants.get("collective_matches_individuals"):
        assert_collective_vs_individuals(final_groups, final_individuals, case_id)
    if invariants.get("spouses_excluded_from_radd"):
        assert_spouses_not_in_radd(result, case_id)
    if invariants.get("awl_preserves_ratios"):
        assert_awl_preserves_ratios(result, case_id)
    if invariants.get("deterministic"):
        assert_deterministic(fixture, result, case_id)

    assert_asaba_ratios(result, case_id)
    assert_full_sibling_priority(final_groups, final_individuals, case_id)

    extract_cli_metadata(case_id, fixture, result)


def main() -> int:
    fixtures: List[Path] = []
    for name in TARGET_FIXTURES:
        candidate = FIXTURES_DIR / name
        if candidate.exists():
            fixtures.append(candidate)

    if not fixtures:
        print("No fixtures found", file=sys.stderr)
        return 1

    failures = 0
    for path in fixtures:
        case_id = path.stem
        try:
            verify_fixture(path)
            print(f"[OK] {case_id}")
        except AssertionError as exc:
            failures += 1
            print(f"[FAIL] {case_id}: {exc}", file=sys.stderr)
        except Exception as exc:  # pragma: no cover - debugging helper
            failures += 1
            print(f"[ERROR] {case_id}: {exc}", file=sys.stderr)

    print(f"Cases: {len(fixtures)}, Failures: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
