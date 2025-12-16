# Test Harness

The repository ships with a Python orchestration script (`scripts/run_tests.py`) that drives the PHP inheritance pipeline end-to-end. The harness exercises normalisation → eligibility → fixed shares → share normalisation → ʿaṣaba, verifies canonical fixtures, and enforces the expected Maliki invariants.

## Prerequisites

* PHP 8.1 or newer with the standard CLI SAPI (used by the calculators).
* Python 3.10+ (for the harness and additional validation logic).

## Running the suite

```bash
python3 scripts/run_tests.py
```

The script performs the following checks:

1. Executes the rulebook smoke test (PHP).
2. Validates fraction arithmetic helpers.
3. Runs every canonical Maliki fixture (`tests/fixtures/C01…C16_*.json`) plus the supplemental scenario files (e.g. `C04b`, `Z02`) through the CLI calculator and asserts:
   * All published group and individual shares match the fixture expectations.
   * The final sum of the estate equals `1/1` and the aggregate of group shares is consistent.
   * Mixed ʿaṣaba distributions respect the 2:1 ratio between male and female counterparts (sons/daughters, full siblings, etc.).
   * Full siblings always take precedence over consanguine siblings (consanguines remain at `0`).
   * Any optional metadata supplied under `expected_cli` (e.g. `sum_fixed`) matches the calculator output.
   * Optional verifications under `expected.context_flags`, `expected.normalized_roles`, or `expected.warnings_contains` are honoured whenever the CLI returns the corresponding data.

The command exits with a non-zero status code if any assertion fails.

## Fixture format

Each fixture file follows this structure:

```json
{
  "case_id": "C03_spouse_2daughters_mother_father_awl",
  "input": {
    "heirs": [
      {"role": "husband", "count": 1},
      {"role": "daughter", "count": 2},
      {"role": "mother", "count": 1},
      {"role": "father", "count": 1}
    ],
    "ctxHints": {}
  },
  "expected": {
    "group_shares": {
      "husband": "1/5",
      "daughters": "8/15",
      "mother": "2/15",
      "father": "2/15"
    },
    "individual_shares": {
      "daughters": ["4/15", "4/15"]
    },
    "invariants": {
      "sum_to_one": true,
      "spouses_excluded_from_radd": true,
      "awl_preserves_ratios": true,
      "no_blocked_receives_share": true,
      "collective_matches_individuals": true,
      "deterministic": true
    }
  }
}
```

* `input.heirs` contains canonical heirs with their roles and counts. Optional overrides (`sex`, `degree`, `side`, `alive`) can be supplied when needed.
* `input.ctxHints` allows forcing specific context flags (e.g. `siblingsCount`).
* `expected.group_shares` (or the legacy `expected.shares`) enumerates the expected collective fractions for each heir group. `expected.individual_shares` lists per-heir results when relevant. Legacy fixtures that express both under `expected.shares` remain supported.
* Optional keys such as `expected.context_flags`, `expected.normalized_roles`, and `expected.warnings_contains` enable assertions on CLI metadata when present in the output. The harness only enforces these checks when the CLI exposes the corresponding fields (missing metadata does not fail the test).
* Fixtures may also specify audit expectations: `expected.audit_awl_factor`, `expected.audit_radd_residual`, or `expected.audit_asaba_alloc_contains`. When provided, the runner ensures the CLI executes with `--audit` and verifies the reported audit metrics against the fixture. Cases without these keys are unaffected.
* Monetary validations are opt-in: supplying `input.estate_value` alongside `expected.amounts_by_role` (and optional `expected.currency`) instructs the harness to compare the emitted decimal strings and confirm that their sum matches the estate value.
* Fixtures may include `input.cli_flags` to pass additional CLI switches (for example `--strict=false`) without affecting the payload delivered to the calculator.
* `expected.invariants` toggles the standard invariants that should be asserted for the case. The ʿaṣaba-specific checks (sum final = 1, 2:1 ratios, full sibling precedence) are enforced automatically whenever the relevant heirs are present.

## Canonical cases

| Case | Description | Key expectation |
| ---- | ----------- | --------------- |
| C01 | Husband + 1 daughter | Husband 1/4, daughter 3/4 via *radd* |
| C02 | Four wives + son + daughter + parents | Wives 1/8 collectively; son/daughter split the residual 2:1 |
| C03 | Husband + two daughters + parents | Fixed shares undergo *ʿawl* scaling (factor 4/5) |
| C04 | Husband + parents (no descendants) | Mother takes 1/6 (third of remainder); father absorbs the residual |
| C05 | Two uterine siblings + mother | Uterines receive 2/3 after *radd*; mother finishes at 1/3 |
| C06 | Father + two daughters | Father receives 1/3 (1/6 fixed + residual) |
| C07 | Three wives + mother + father | Wives 1/4; father absorbs residual after mother 1/3 |
| C08 | Son + daughter | Entire estate split 2:1 as *ʿaṣaba* |
| C09 | Uterine sibling blocked by descendant | Blocked heir receives 0 |
| C10 | Daughters with full siblings (no father/PGF) | Daughters keep 2/3; residual to full siblings at 2:1 while consanguines remain blocked |

## Extending the suite

1. Create a new JSON file in `tests/fixtures/` (the harness automatically considers files that begin with `CXX_`).
2. Provide all expected group and individual fractions as reduced strings (e.g. `"5/12"`) inside `expected.group_shares`/`expected.individual_shares` (or the legacy `expected.shares`). This ensures the Python harness can compare the calculator output directly.
3. Toggle any of the standard invariants under `expected.invariants` as needed (e.g. `sum_to_one`, `deterministic`).
4. To exercise Maliki-specific behaviour:
   * Include mixed male/female ʿaṣaba heirs to trigger the automatic 2:1 ratio checks.
   * Model scenarios with full and consanguine siblings together to confirm the precedence rule (consanguines should have zero shares).
   * Supply `expected_cli` metadata if you need to pin internal sums such as `sum_fixed`.
5. Re-run `python3 scripts/run_tests.py` to validate the new case.

The legacy PHP runner (`php scripts/run_tests.php`) remains available for direct execution, but the Python harness is the authoritative entry point used by CI.

## Manual UI checks

The classic builder relies on the browser implementation of `deepseekImportTree`. To verify the failure handling path:

1. Open the classic UI in a browser and capture a reference to the original importer: `const original = window.deepseekImportTree;`.
2. Override it with a stub that forces a failure: `window.deepseekImportTree = () => false;`.
3. Attempt any mutation in the builder (por ejemplo, añade un familiar utilizando los controles del lienzo).
4. Confirma que aparece un toast de error indicando que no se pudieron aplicar los cambios.
5. Repite la operación fallida (manteniendo el stub que devuelve `false`) para provocar el doble fallo del importador y verifica que surge el toast "No se pudo restaurar el estado anterior" junto con el mensaje de consola correspondiente.
6. Restaura el importador original ejecutando `window.deepseekImportTree = original;`.

This exercise ensures that the UI emits the toast, restores the previous tree, and avoids invoking `handleTreeChanged` when the import step is rejected. If the fallback restoration also fails, the UI must surface the "No se pudo restaurar el estado anterior" toast, log the console error, and abort the mutation so you can reload the page.

### Validaciones de sexo del causante en el builder clásico

1. Con el causante configurado como varón, intenta ejecutar el cálculo teniendo al menos un heredero con rol `husband` y confirma que aparece la alerta "Causante varón: no puede haber husband." sin continuar con el cálculo.
2. Manteniendo al causante varón, verifica que se sigue mostrando la alerta "Causante varón: máximo 4 esposas" cuando se excede el límite de cuatro esposas vivas.
3. Cambia el sexo del causante a mujer, añade un heredero con rol `wife` y confirma que se bloquea el cálculo con la alerta "Causante mujer: no puede haber wife.".
4. Asegúrate de que se conserva la validación "Causante mujer: máximo 1 esposo" al intentar exceder un esposo vivo.

### Roles únicos en el builder clásico

1. Intenta añadir un segundo heredero con rol `father` y confirma que la UI muestra la alerta "Solo se permite un father." sin crear el registro.
2. Repite la prueba con un segundo heredero `mother` y verifica que aparece la alerta "Solo se permite un mother.".
