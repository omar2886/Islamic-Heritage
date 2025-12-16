# CLI de cálculo (`scripts/calc_cli.php`)

El script `scripts/calc_cli.php` proporciona una interfaz mínima para invocar el motor de
cálculo desde la línea de comandos. Esta versión inicial acepta un JSON por `STDIN` con la
lista canónica de herederos y devuelve un eco del payload junto con la versión del motor.

> ⚠️ Durante la migración (P0) el motor todavía no realiza cálculos; únicamente confirma que la
> estructura de entrada es válida. Las siguientes iteraciones añadirán el reparto real.

## Formato de entrada

La entrada debe ser un objeto JSON con la clave `heirs`. Cada elemento del arreglo de herederos
requiere:

* `role` — cadena que representa el rol (por ejemplo `husband`, `daughter`).
* `count` — entero con la cantidad de herederos para ese rol.

Ejemplo mínimo (`samples/echo.json`):

```json
{
  "heirs": [
    { "role": "husband", "count": 1 }
  ]
}
```

## Ejecución

```bash
php scripts/calc_cli.php < samples/echo.json
```

El comando anterior imprime un único objeto JSON con las claves:

* `version` — cadena que identifica la versión del motor (`0.1.0`).
* `echo` — copia íntegra del objeto recibido por entrada estándar.

La salida formateada luce así:

```json
{
    "version": "0.1.0",
    "echo": {
        "heirs": [
            {
                "role": "husband",
                "count": 1
            }
        ]
    }
}
```

## Pruebas de humo

`scripts/run_smoke.py` carga `samples/echo.json`, ejecuta el CLI y verifica que la respuesta
contenga las claves `version` y `echo`. Esto permite validar rápidamente la integración sin
necesitar la interfaz web.
