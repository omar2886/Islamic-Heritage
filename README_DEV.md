# Guía rápida para desarrolladores

## Pruebas locales

* Smoke tests clásicos: `python3 scripts/run_tests.py`
* Incluir auditoría UI/E2E (requiere PHP y Node): `python3 scripts/run_tests.py --include-e2e`

El flag `--include-e2e` arranca automáticamente el servidor PHP de subruta en `http://127.0.0.1:8016/Heritage/public/` (mediante `scripts/dev_subpath_server.py`), ejecuta los tests de Playwright y luego detiene el servidor. Los artefactos de la auditoría (screenshots, HTML y `audit.json`) se escriben en `tests/e2e/artifacts/`.

Si quieres levantar el servidor de subruta manualmente:

```bash
python3 scripts/dev_subpath_server.py
# o para un ciclo puntual
python3 scripts/dev_subpath_server.py --once -- npx playwright test
```
