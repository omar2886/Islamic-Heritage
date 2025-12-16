# Rulebook DSL Overview

The Maliki rulebook is encoded as a YAML document that mirrors the main stages of the inheritance pipeline.  The DSL is intentionally declarative so the engines in `app/Services` can inspect shares, apply predicates, and enforce edge-case handling in a predictable way.

The root document contains four top-level sections:

- `blocks`: exclusion rules that make certain heirs ineligible when a condition evaluates to true.
- `fixed_shares`: *farḍ* (fixed share) directives grouped by heir role.
- `special_cases`: residual distribution strategies that do not fit into fixed shares.
- `mother_reduction`: helper expressions loaded alongside fixed shares (see `RuleBookMaliki::motherReductionExpressions`).  The
  bundled Maliki rulebook uses a single predicate `ctx.has_descendants || ctx.siblings_count >= 2`, where `ctx.siblings_count`
  aggregates full, consanguine, and uterine siblings even if they are later excluded by blocking rules.

The snippets below illustrate the DSL features and how the PHP services consume them.

## Blocks

A block removes one or more heirs from consideration when a predicate evaluates to `true`.  Each block rule provides:

- `id`: stable identifier used in tracing and debugging.
- `description`: optional human readable explanation.
- `when`: predicate tree evaluated by `Predicates::eval`.
- `targets`: list of normalized heir role identifiers that are barred when the condition holds.

```yaml
- id: maliki.block.uterine_siblings
  description: Uterine siblings are excluded by descendants or paternal ascendants.
  when:
    any_of:
      - context.has_descendants
      - context.has_father
      - context.has_paternal_grandfather
  targets:
    - uterine_brother
    - uterine_sister
```

The predicate language accepts boolean compositions (`and`, `or`, `not`), comparisons (`==`, `!=`, `>=`, `<=`, `<`, `>`), and helper functions such as `presence("role")`, `count("role")`, and context accessors via the `ctx.` prefix.  See `tests/fixtures/predicate_cases.json` for living examples that exercise the parser.

## Fixed shares (*farḍ*)

The `fixed_shares` section is keyed by heir role.  Each entry describes how the estate fraction should be reserved when the condition is satisfied.  A definition can contribute either an individual share (`share`) or a collective allotment for the role (`group_share`).

```yaml
husband:
  - when: not context.has_descendants
    share: "1/2"
    note: Husband receives half in absence of descendants.
  - when: context.has_descendants
    share: "1/4"
```

Key fields:

- `when`: predicate using the same DSL as blocks.  Omitted predicates default to `true`.
- `share`: fraction string (numerator/denominator) awarded per individual heir.
- `group_share`: fraction string awarded collectively to the role; distribution can be refined through `distribute`.
- `distribute`: optional keyword describing how to split a group share (`equal`, `ratio_2_to_1`, etc.).
- `note`: free-form explanation for auditors.

The runtime flattens these directives into a linear array (see `RuleBookMaliki::fixedShares`) while preserving the originating role via the `group` field.  This allows the `FixedShareEngine` to iterate over all applicable rules uniformly.

### Complementary shares for granddaughters through sons

The Maliki treatment of granddaughters through sons distinguishes between the presence of a single daughter and multiple daughters:

- With exactly **one daughter** and no sons or grandsons through sons, the granddaughters through sons take a collective **1/6**.  Combined with the daughter's half, this preserves the canonical two-thirds quota for female descendants before any radd adjustments are applied.
- With **two or more daughters**, the granddaughters through sons lose their fixed entitlement and only inherit through residuary mechanisms when a male counterpart at their level exists.

## Special cases

`special_cases` collects logic that activates after fixed shares are assigned:

- `distribute`: residual distribution directives (e.g., a father absorbing remainder when no male agnate exists, or sons and daughters sharing `2:1`).
- `residual`: clarifies when radd (return of residue) is *not* applied and which heirs inherit the leftover estate directly.
- `radd`: configuration for the return process.  The DSL lists excluded roles and explanatory notes; the normalizer enforces the spouse exclusion invariant when redistributing excess.
- `awl`: describes the proportional reduction method triggered when fixed shares oversubscribe the estate.  The current rulebook specifies `scale_to_one`, preserving ratios across the affected roles.

Each subsection leverages the predicate DSL to describe `when` conditions and enumerates `targets` that participate in the residual outcome.  For example:

```yaml
special_cases:
  distribute:
    - id: maliki.distribute.daughter_with_son
      when: heirs.son.exists
      targets:
        - son
        - daughter
      method: ratio_2_to_1
```

The PHP smoke test (`scripts/smoke_rulebook.php`) performs structural validation to guarantee that expected sections exist, that identifiers remain unique, and that the counts match the contents of the YAML file.  When extending the rulebook, prefer enriching these declarative structures over embedding logic in PHP so that the engines remain data-driven.
