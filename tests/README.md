# Tests Sprint 2

## 0) Requisitos
- PHP CLI disponible (`php -S`).
- Python 3 disponible.

## 1) Smoke (rápido, sin JS)
```bash
python3 tests/sprint2_smoke.py
```

Verifica:

* Levanta `php -S 127.0.0.1:8000 -t public`.
* `GET /index.php?page=home|builder|results` → 200 y placeholders esperados.
* `GET /api/roles.php` → JSON con clave `roles` (puede ser [] si el dominio no está cargado).

## 2) E2E (headless, con JS)

```bash
python3 -m pip install -q pyppeteer
python3 tests/sprint2_headless.py
```

Verifica en el **builder**:

* Render dinámico de secciones.
* Validaciones de cónyuges y ascendentes/hermanos.
* Generación de `payload` (preview).
* `sessionStorage['heritage_payload']` definido al pulsar “Calcular”.

> Si `pyppeteer` no puede descargar Chromium por políticas de red, el script salta a **modo degradado** y te lo indica.
