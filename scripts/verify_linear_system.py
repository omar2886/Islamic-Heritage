#!/usr/bin/env python3
"""External verifier for CLI linear constraints."""

from __future__ import annotations

import json
import sys
from fractions import Fraction
from typing import Dict, Iterable, List, Mapping, Tuple

ASABA_MIXED_PAIRS: Tuple[Tuple[str, str], ...] = (
    ("son", "daughter"),
    ("sons_son", "sons_daughter"),
    ("full_brother", "full_sister"),
    ("consanguine_brother", "consanguine_sister"),
)

CANONICAL_ALIASES: Dict[str, str] = {
    "daughter": "daughters",
    "daughters": "daughters",
    "wife": "wives",
    "wives": "wives",
    "uterine_brother": "uterine_siblings",
    "uterine_sister": "uterine_siblings",
    "uterine_siblings": "uterine_siblings",
}

SPOUSE_ROLES: Tuple[str, ...] = ("husband", "wife", "wives")

ZERO = Fraction(0, 1)


def fr(raw: str) -> Fraction:
    if not isinstance(raw, str):
        raise AssertionError(f"Expected fraction string, got {raw!r}")
    if "/" not in raw:
        raise AssertionError(f"Invalid fraction format: {raw!r}")
    numerator, denominator = raw.split("/", 1)
    try:
        return Fraction(int(numerator), int(denominator))
    except Exception as exc:  # noqa: BLE001
        raise AssertionError(f"Invalid fraction components: {raw!r}") from exc


def canonical_key(role: str) -> str:
    return CANONICAL_ALIASES.get(role, role)


def sum_group_shares(groups: Mapping[str, str]) -> Fraction:
    canonical_totals: Dict[str, Fraction] = {}
    for role, share in groups.items():
        fraction = fr(share)
        key = canonical_key(role)
        previous = canonical_totals.get(key)
        if previous is not None and previous != fraction:
            raise AssertionError(
                f"Alias roles {role} and {key} disagree: {previous} vs {fraction}"
            )
        canonical_totals[key] = fraction
    return sum(canonical_totals.values(), ZERO)


def parse_individuals(solution: Mapping[str, object]) -> Dict[str, List[Fraction]]:
    result: Dict[str, List[Fraction]] = {}
    individuals = solution.get("individual_shares")
    if not isinstance(individuals, Mapping):
        return result
    for role, values in individuals.items():
        if not isinstance(values, Iterable):
            continue
        parsed: List[Fraction] = []
        for value in values:
            parsed.append(fr(value))
        result[role] = parsed
    # Provide canonical aliases if only singular/plural present
    for role, alias in CANONICAL_ALIASES.items():
        if role in result and alias not in result:
            result[alias] = result[role]
    return result


def build_count_lookup(solution: Mapping[str, object], individuals: Mapping[str, List[Fraction]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    heirs = solution.get("input")
    if isinstance(heirs, Mapping):
        heirs_list = heirs.get("heirs")
        if isinstance(heirs_list, Iterable):
            for entry in heirs_list:
                if not isinstance(entry, Mapping):
                    continue
                role = entry.get("role")
                if not isinstance(role, str):
                    continue
                raw_count = entry.get("count", 1)
                try:
                    count = int(raw_count)
                except Exception:  # noqa: BLE001
                    continue
                counts[role] = count
                alias = canonical_key(role)
                counts.setdefault(alias, count)
    for role, shares in individuals.items():
        non_zero = sum(1 for share in shares if share != ZERO)
        if non_zero:
            counts.setdefault(role, non_zero)
            alias = canonical_key(role)
            counts.setdefault(alias, non_zero)
    return counts


def role_values(individuals: Mapping[str, List[Fraction]], role: str) -> List[Fraction]:
    values = individuals.get(role)
    if values is not None:
        return values
    alias = canonical_key(role)
    return individuals.get(alias, [])


def role_count(counts: Mapping[str, int], role: str) -> int:
    if role in counts:
        return counts[role]
    alias = canonical_key(role)
    return counts.get(alias, 0)


def check_sum(solution: Mapping[str, object]) -> None:
    shares = solution.get("shares")
    if not isinstance(shares, Mapping):
        raise AssertionError("Missing shares section in CLI output")
    final_section = shares.get("final")
    if not isinstance(final_section, Mapping):
        raise AssertionError("Missing final shares section in CLI output")
    groups = final_section.get("groups")
    if not isinstance(groups, Mapping) or not groups:
        raise AssertionError("Final share groups missing or empty")
    total = sum_group_shares(groups)
    if total != Fraction(1, 1):
        raise AssertionError(f"Final group shares sum to {total} instead of 1/1")


def check_radd_spouses(solution: Mapping[str, object]) -> None:
    audit = solution.get("audit")
    if not isinstance(audit, Mapping):
        return
    radd = audit.get("radd")
    if not isinstance(radd, Mapping):
        return
    residual_raw = radd.get("residual")
    if residual_raw is None:
        return
    residual = fr(residual_raw)
    if residual == ZERO:
        return
    shares = solution.get("shares")
    if not isinstance(shares, Mapping):
        return
    fixed = shares.get("fixed")
    final = shares.get("final")
    if not isinstance(fixed, Mapping) or not isinstance(final, Mapping):
        return
    fixed_groups = fixed.get("groups") if isinstance(fixed.get("groups"), Mapping) else {}
    final_groups = final.get("groups") if isinstance(final.get("groups"), Mapping) else {}
    for role in SPOUSE_ROLES:
        if role not in fixed_groups or role not in final_groups:
            continue
        before = fr(fixed_groups[role])
        after = fr(final_groups[role])
        if before != after:
            raise AssertionError(f"Radd should not adjust {role}: {before} -> {after}")


def check_two_to_one(solution: Mapping[str, object], individuals: Mapping[str, List[Fraction]], counts: Mapping[str, int]) -> None:
    audit = solution.get("audit")
    if not isinstance(audit, Mapping):
        return
    asaba = audit.get("asaba")
    if not isinstance(asaba, Mapping):
        return
    if asaba.get("method") != "two_to_one":
        return
    alloc_raw = asaba.get("alloc")
    if not isinstance(alloc_raw, Mapping):
        raise AssertionError("Audit asaba alloc missing for two_to_one method")
    alloc = {role: fr(share) for role, share in alloc_raw.items()}
    for male, female in ASABA_MIXED_PAIRS:
        if male not in alloc or female not in alloc:
            continue
        male_total = alloc[male]
        female_total = alloc[female]
        if male_total == ZERO or female_total == ZERO:
            continue
        male_values = [share for share in role_values(individuals, male) if share != ZERO]
        female_values = [share for share in role_values(individuals, female) if share != ZERO]
        male_count = len(male_values)
        female_count = len(female_values)
        if male_count == 0:
            male_count = role_count(counts, male)
        if female_count == 0:
            female_count = role_count(counts, female)
        if male_count == 0 or female_count == 0:
            continue
        if male_count == 1 and female_count == 1:
            if male_total != female_total * 2:
                raise AssertionError(
                    f"Two-to-one mismatch for {male}/{female}: {male_total} vs {female_total}"
                )
            continue
        per_male = male_total / male_count
        per_female = female_total / female_count
        if per_male != per_female * 2:
            raise AssertionError(
                f"Per-capita two-to-one mismatch for {male}/{female}: {per_male} vs {per_female}"
            )


def check_equal_asaba(solution: Mapping[str, object], individuals: Mapping[str, List[Fraction]], counts: Mapping[str, int]) -> None:
    audit = solution.get("audit")
    if not isinstance(audit, Mapping):
        return
    asaba = audit.get("asaba")
    if not isinstance(asaba, Mapping):
        return
    if asaba.get("method") != "equal":
        return
    alloc_raw = asaba.get("alloc")
    if not isinstance(alloc_raw, Mapping):
        raise AssertionError("Audit asaba alloc missing for equal method")
    per_capita: List[Fraction] = []
    for role, share_raw in alloc_raw.items():
        share = fr(share_raw)
        if share == ZERO:
            continue
        role_count_value = len([s for s in role_values(individuals, role) if s != ZERO])
        if role_count_value == 0:
            role_count_value = role_count(counts, role)
        if role_count_value == 0:
            role_count_value = 1
        per_capita.append(share / role_count_value)
    if len(per_capita) <= 1:
        return
    first = per_capita[0]
    for value in per_capita[1:]:
        if value != first:
            raise AssertionError("Equal method produced differing per-capita shares")


def check(solution: Mapping[str, object]) -> None:
    check_sum(solution)
    individuals = parse_individuals(solution)
    counts = build_count_lookup(solution, individuals)
    check_radd_spouses(solution)
    check_two_to_one(solution, individuals, counts)
    check_equal_asaba(solution, individuals, counts)


if __name__ == "__main__":
    payload = sys.stdin.read()
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:  # noqa: BLE001
        raise SystemExit(f"Invalid JSON input: {exc}")
    if not isinstance(data, Mapping):
        raise SystemExit("CLI output must be a JSON object")
    check(data)
    print("OK")
