# Guía rápida para desarrolladores

## Pruebas locales

* Smoke tests clásicos: `python3 scripts/run_tests.py`
* Auditoría UI/E2E en subruta local (requiere PHP y Node): `python3 scripts/run_tests.py --include-e2e`
* Auditoría UI/E2E contra base remota existente: `python3 scripts/run_tests.py --include-e2e --e2e-base-url https://tafsir.es/Heritage/public/`

El flag `--include-e2e` arranca automáticamente el servidor PHP de subruta en `http://127.0.0.1:8016/Heritage/public/` (mediante `scripts/dev_subpath_server.py`), ejecuta los tests de Playwright y luego detiene el servidor. Los artefactos de la auditoría (screenshots, HTML y `audit.json`) se escriben en `tests/e2e/artifacts/`. Si ya tienes un entorno remoto accesible, puedes saltarte el servidor local y apuntar directamente a su base con `--e2e-base-url` (no se arrancará nada en local).

Instala los browsers de Playwright una sola vez con `npx playwright install chromium` (o delega en el runner con `HERITAGE_E2E_INSTALL=1 python3 scripts/run_tests.py --include-e2e`).

### Diagnóstico manual de arranque

La app ya no muestra el banner de diagnóstico en navegación normal. Si la interfaz no consigue montarse, el root mostrará un mensaje breve con enlaces para recargar o abrir en modo diagnóstico.

* Forzar el diagnóstico explícitamente añadiendo `?diag=1` a la URL (ej.: `/index.php?page=builder&diag=1`).
* En modo normal no se hacen probes ni aparece el banner; solo se mostrará un fallback mínimo si el UI no termina de cargar.

Si quieres levantar el servidor de subruta manualmente:

```bash
python3 scripts/dev_subpath_server.py
# o para un ciclo puntual
python3 scripts/dev_subpath_server.py --once -- npx playwright test
```

## Deployment

For the current shared-hosting workflow, see:

- `docs/DEPLOY_SHARED_HOSTING.md`
