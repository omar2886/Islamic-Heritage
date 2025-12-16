# Auditoría de interfaz clásica

## Mapa de áreas front

### UI clásica
- `/workspace/Heritage/public/app/classic/deepseek.php`
- `/workspace/Heritage/public/app/classic/main.js`
- `/workspace/Heritage/public/app/classic/styles.css`
- `/workspace/Heritage/public/app/classic/api/compute.js`
- `/workspace/Heritage/public/app/classic/model/{derive_heirs.js, roles.js, validators.js}`
- `/workspace/Heritage/public/app/classic/ui/panels.js`
- `/workspace/Heritage/public/app/classic/test/*.html`

### JS front (global)
- `/workspace/Heritage/public/assets/js/app.js`
- `/workspace/Heritage/public/assets/js/panzoom.min.js`
- `/workspace/Heritage/public/app/main.js`
- `/workspace/Heritage/public/app/ui/{badge.js, case_builder.js, explain_panel.js, shares_panel.js, tree_builder.js}`
- `/workspace/Heritage/public/app/api/compute.js`
- `/workspace/Heritage/public/app/model/{roles.js, validators.js}`

### CSS
- `/workspace/Heritage/public/assets/css/{main.css, styles.css}`
- `/workspace/Heritage/public/app/styles.css`
- `/workspace/Heritage/public/app/classic/styles.css`

### Endpoints PHP
- `/workspace/Heritage/public/index.php`
- `/workspace/Heritage/public/tools/{batch_runner.php, bootstrap_check.php, explain_smoke.php, run_fuzz.php}`
- Backend controllers en `/workspace/Heritage/app/Controllers/{CalculationController.php, CaseController.php, HeirController.php}`
- **Archivados fuera del docroot:** `/workspace/Heritage/docs/_legacy/{combined.php, deepseek.php, get_case_id.php, index_legacy.php}`

### Runtime / dominio
- Modelos y servicios bajo `/workspace/Heritage/app/Models/*.php` y `/workspace/Heritage/app/Services/*.php`
- Configuración en `/workspace/Heritage/config/config.php`
- Scripts auxiliares en `/workspace/Heritage/scripts/*`

## Entry points identificados
- HTTP: `public/index.php`, `public/app/classic/deepseek.php` (la versión PHP vive ahora en `docs/_legacy/deepseek.php`)
- JS global: `public/assets/js/app.js` (inyecta `window.App`, `window.TreeModel`, `window.EventBus`)
- Módulo principal clásico: `public/app/classic/main.js`

## Orden real de carga en `deepseek.php`
Fragmento relevante:

```html
<script src="/Heritage/public/assets/js/panzoom.min.js"></script>
<script src="/Heritage/public/assets/js/app.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js"></script>
<script type="module" src="/Heritage/public/app/classic/main.js"></script>
```

- Se respeta el orden solicitado para los dos primeros scripts y el módulo, pero existe una carga adicional del CDN de `lz-string` entre `app.js` y `main.js`.
- `public/assets/js/app.js` define explícitamente `window.App`, `window.TreeModel` y `window.EventBus`.

## Diagnóstico de ejecución (Playwright)
- Navegación: `http://127.0.0.1:8000/app/classic/deepseek.php`
- No se ejecuta `bootClassicBuilder`: el módulo ES `main.js` no llega a evaluar, por lo que el `DOMContentLoaded` declarado en el archivo no se registra.
- Los `<script>` con rutas absolutas `/Heritage/...` devuelven HTML en lugar de JS (servidos desde `/public/index.php`), provocando errores de sintaxis.

### Registros de consola
```
PAGEERROR Unexpected token '<'
PAGEERROR Unexpected token '<'
ERROR Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.
```

### Respuestas observadas
- `GET /Heritage/public/assets/js/app.js` → `200 OK` con `Content-Type: text/html` y cuerpo HTML (`index.php`).【0ab172†L1-L10】【34ab9c†L5-L13】
- `GET /Heritage/public/app/classic/main.js` → responde HTML (misma causa), lo que evita que `DOMContentLoaded` del módulo se dispare.

## Conclusiones
1. La estructura front se distribuye entre `public/app/classic`, `public/assets` y módulos compartidos en `public/app`.
2. El HTML clásico incluye los scripts esperados pero con rutas absolutas que no coinciden con el docroot (`/app/classic/deepseek.php`), ocasionando respuestas HTML.
3. Debido a las respuestas incorrectas, el módulo ES falla y la interfaz no se inicializa.
4. Es necesario ajustar las rutas o el servidor para servir los recursos JavaScript con MIME correcto antes de continuar con cambios funcionales.
