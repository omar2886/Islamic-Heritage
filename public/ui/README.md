# Islamic Heritage UI (public/ui)

PR0: Bootstrap estático.
- Sin llamadas API
- Sin routing
- Sin persistencia
- Sin lógica de negocio

Abrir: /Heritage/public/ui/

VALIDACIONES OBLIGATORIAS ANTES DE ENTREGAR
1) Confirmar que NO hay cambios fuera de public/ui:
   - git status
   - git diff --name-only HEAD
2) Confirmar que index.html carga sin errores:
   - abrir public/ui/index.html (o ruta /Heritage/public/ui/) y revisar consola (sin errores).

ENTREGA
- Crear rama: codex/pr0-ui-bootstrap
- Commit único: "PR0: UI bootstrap skeleton"
- Abrir PR hacia la rama default (main)
- En la descripción del PR pegar:
  - lista de archivos creados
  - confirmación: "No API calls, no routing, no changes outside public/ui"

PROHIBIDO
- Añadir cualquier archivo adicional
- Tocar public/index.php o cualquier archivo del core/contrato
- Añadir llamadas fetch o endpoints
- Añadir librerías externas
