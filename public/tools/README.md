# Tools directory

This folder hosts utility front-ends that interact with the Maliki calculator.

## Batch Runner (`batch_runner.html` + `batch_runner.php`)

- Open `public/tools/batch_runner.html` in a browser (or serve `public/` via `php -S localhost:8000 -t public`).
- Paste the cases either as a JSON array or in NDJSON (one JSON object per line). The minimum payload for each case is:

```json
{
  "heirs": [
    { "role": "wife", "count": 3 }
  ]
}
```

- Optional keys such as `cli_flags`, `estate_value`, `rulebook_path`, and `rulebook_flags` are forwarded untouched.
- Press **Ejecutar** to call `public/tools/batch_runner.php`, which wraps `calc_from_array()` without relying on a shell.
- Results appear in a table with traffic-light colouring: green `ok`, amber for Bayt al-Māl residuals, red for failing invariants.
- Use the **Descargar JSON** / **Descargar CSV** buttons to export the aggregated output. CSV columns include dynamic `group_*` headers discovered across the batch (capped at 50 to avoid runaway growth).

### Endpoint contract (`public/tools/batch_runner.php`)

`POST` with `Content-Type: application/json`:

```json
{"cases":[{"heirs":[{"role":"wife","count":3}],"cli_flags":["--explain"]}]}
```

Each result entry contains:

```json
{
  "input": { ...normalized case... },
  "output": { ...calc_from_array response... },
  "ok": true,
  "diagnostics": {
    "sum_final": "1/1",
    "residual_policy": "bayt_al_mal",
    "bayt_due": "3/4",
    "warnings_count": 0,
    "errors_count": 0
  }
}
```

The `ok` flag matches the calculator rule: `sum_final == "1/1"` or, if `meta.residual_policy == "bayt_al_mal"`, any fraction strictly below `1/1`.

Errors in individual cases are returned inline (`ok = false` plus the engine message) so the rest of the batch can continue.

### Fixtures & guardrails

The batch runner relies on the calculator’s telemetry: `meta.residual_policy`, `meta.bayt_due`, and the new `meta.assertions` block (see `scripts/CalcRunner.php`). In CI we execute `tests/run_min_suite.php`, which enforces these invariants under `--strict` to catch regressions.
