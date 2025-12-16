#!/usr/bin/env python3
"""Generate randomized inheritance scenarios for fuzz testing.

This script produces a JSON array with a collection of inheritance cases.
Each case includes a `case_id`, the CLI input payload, and some metadata
describing the expected invariants.  The goal is to explore a wide range of
combinations covering spouses, descendants, ascendants and collateral heirs.

The generator keeps the scenarios broadly valid (e.g. no simultaneous husband
and wives entries, bounded wife counts, etc.) while still sampling tricky edge
cases such as the presence of both a father and a paternal grandfather.  This
allows the fuzz runner to assert domain invariants like "father ⇒ paternal
grandfather blocked".
"""

from __future__ import annotations

import argparse
import json
import os
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List


DEFAULT_CASE_COUNT = 750


@dataclass
class Case:
    case_id: str
    heirs: List[Dict[str, int]]

    def to_payload(self) -> Dict[str, object]:
        return {
            "case_id": self.case_id,
            "input": {"heirs": self.heirs},
            "expected": {"invariants": {"sum_to_one": True}},
        }


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate random inheritance cases")
    parser.add_argument(
        "--cases",
        type=int,
        default=int(os.environ.get("FUZZ_CASES", DEFAULT_CASE_COUNT)),
        help="Number of cases to generate (default: %(default)s)",
    )
    parser.add_argument(
        "--seed",
        type=str,
        default=os.environ.get("FUZZ_SEED"),
        help="Seed for the RNG to get reproducible scenarios",
    )
    return parser.parse_args()


def build_rng(seed: str | None) -> random.Random:
    rng = random.Random()
    if seed is not None:
        try:
            rng.seed(int(seed))
        except ValueError:
            rng.seed(seed)
    else:
        rng.seed()
    return rng


def add_heir(counts: Dict[str, int], role: str, count: int) -> None:
    if count <= 0:
        return
    counts[role] = counts.get(role, 0) + count


def ensure_minimum_heirs(counts: Dict[str, int], rng: random.Random) -> None:
    if counts:
        return
    # Ensure at least one heir is present; prefer direct descendants, then parents.
    fallback_roles = [
        ("son", lambda: rng.randint(1, 3)),
        ("daughter", lambda: rng.randint(1, 3)),
        ("father", lambda: 1),
        ("mother", lambda: 1),
    ]
    role, supplier = rng.choice(fallback_roles)
    add_heir(counts, role, supplier())


def ensure_spouse_has_company(counts: Dict[str, int], rng: random.Random) -> None:
    if any(role not in {"husband", "wives"} for role in counts):
        return

    fallback_roles = [
        ("son", lambda: rng.randint(1, 2)),
        ("daughter", lambda: rng.randint(1, 2)),
        ("father", lambda: 1),
        ("mother", lambda: 1),
        ("paternal_grandfather", lambda: 1),
    ]
    role, supplier = rng.choice(fallback_roles)
    add_heir(counts, role, supplier())


def random_descendants(counts: Dict[str, int], rng: random.Random) -> None:
    if rng.random() < 0.7:
        add_heir(counts, "son", rng.randint(0, 3))
        add_heir(counts, "daughter", rng.randint(0, 4))

    # Grandchildren may appear especially when direct sons are absent.
    if counts.get("son", 0) == 0 and rng.random() < 0.4:
        add_heir(counts, "sons_son", rng.randint(1, 3))
    if counts.get("son", 0) == 0 and counts.get("daughter", 0) == 0 and rng.random() < 0.3:
        add_heir(counts, "sons_daughter", rng.randint(1, 3))


def random_parents_and_grandparents(counts: Dict[str, int], rng: random.Random) -> None:
    if rng.random() < 0.6:
        add_heir(counts, "mother", 1)

    father_present = False
    if rng.random() < 0.5:
        add_heir(counts, "father", 1)
        father_present = True

    # Occasionally include both father and paternal grandfather to exercise invariants.
    if (father_present and rng.random() < 0.2) or (not father_present and rng.random() < 0.3):
        add_heir(counts, "paternal_grandfather", 1)

    if rng.random() < 0.3:
        add_heir(counts, "maternal_grandmother", 1)

    if rng.random() < 0.2:
        add_heir(counts, "paternal_grandmother", 1)


def random_spouses(counts: Dict[str, int], rng: random.Random) -> None:
    roll = rng.random()
    if roll < 0.33:
        add_heir(counts, "husband", 1)
    elif roll < 0.66:
        add_heir(counts, "wives", rng.randint(1, 4))
    # Remaining probability: no spouse present


def random_siblings(counts: Dict[str, int], rng: random.Random) -> None:
    if rng.random() < 0.5:
        add_heir(counts, "full_brother", rng.randint(0, 3))
        add_heir(counts, "full_sister", rng.randint(0, 3))

    if rng.random() < 0.3:
        add_heir(counts, "consanguine_brother", rng.randint(0, 2))
        add_heir(counts, "consanguine_sister", rng.randint(0, 2))

    if rng.random() < 0.3:
        add_heir(counts, "uterine_brother", rng.randint(0, 2))
        add_heir(counts, "uterine_sister", rng.randint(0, 2))


def random_case(case_number: int, rng: random.Random) -> Case:
    counts: Dict[str, int] = {}
    random_spouses(counts, rng)
    random_descendants(counts, rng)
    random_parents_and_grandparents(counts, rng)
    random_siblings(counts, rng)

    ensure_minimum_heirs(counts, rng)
    ensure_spouse_has_company(counts, rng)

    heirs = [{"role": role, "count": count} for role, count in counts.items() if count > 0]
    return Case(case_id=f"FZ_{case_number:04d}", heirs=heirs)


def generate_cases(total: int, rng: random.Random) -> Iterable[Case]:
    for index in range(total):
        yield random_case(index, rng)


def main() -> None:
    args = parse_arguments()
    rng = build_rng(args.seed)

    total_cases = max(1, min(args.cases, 1000))
    cases = [case.to_payload() for case in generate_cases(total_cases, rng)]
    print(json.dumps(cases))


if __name__ == "__main__":
    main()
