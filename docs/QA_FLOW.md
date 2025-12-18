# QA de flujo HTTP

Pequeña batería de smoke tests y fuzz controlado para proteger el flujo HTTP básico.

## Cómo ejecutar

1. Inicia el servidor embebido apuntando al directorio `public`:
   ```bash
   php -S localhost:8000 -t public
   ```
2. En otra terminal, ejecuta el smoke HTTP para las rutas públicas:
   ```bash
   php scripts/flow_smoke_http.php
   ```
3. Desde la misma sesión (o una nueva), lanza las pruebas de payloads y fuzz controlado:
   ```bash
   python3 scripts/run_flow_tests.py --fuzz
   ```

`FLOW_BASE_URL` (PHP) y `--base-url` (Python) permiten apuntar a otra URL si el servidor corre en un host o puerto distinto.
