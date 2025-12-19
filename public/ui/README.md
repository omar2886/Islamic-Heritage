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

PR1: Store + router + persistencia
- Routing por hash: #/wizard, #/builder, #/results
- Persistencia en localStorage (heritage_ui_state_v1)
- Reset borra storage y vuelve a wizard
- Placeholders, sin API

PR2: Contract guard (roles)
- Boot: GET ../api/roles.php
- Compara con EXPECTED_ROLES (27)
- Si mismatch o fallo: UI bloqueada con detalle missing/extra
- Aun no hay POST calc.php

PR3: Case wizard (prefiltro lógico sin calc)
- Ruta real #/wizard con preguntas guiadas, persistencia en localStorage
- Validaciones de coherencia básicas (sexo obligatorio para continuar, rangos 0..100, esposas solo para causante hombre, esposo solo para mujer)
- Panel de resumen y paso al builder cuando el sexo está definido
- No se toca el core ni el contrato, no hay llamadas a calc.php

PR4: Family builder MVP
- Ruta real #/builder con roles agrupados y conteos editables (0..100 con excepciones).
- Precarga opcional desde wizard (solo una vez) para cónyuge, descendencia y padres.
- Vista previa de payload (heirs/count) sin enviar nada. No calc.php en PR4.
- Guardarraíles mínimos: sexo definido en wizard y al menos un heredero; avisos de combinaciones incoherentes.
- Persistencia local conservada.

VALIDACIONES
- Abrir /Heritage/public/ui/
- Ver banner "Verificando contrato..." un instante
- Si roles.php responde y coincide: navegar wizard/builder/results normal
- Si se rompe roles.php o mismatch: ver "UI bloqueada" y diff JSON
- Consola sin errores
- No calc.php en PR4 (solo GET roles.php heredado)

ENTREGA PR2
- Rama: codex/pr2-contract-guard
- Commit único: "PR2: contract guard roles"
- PR hacia main
- Descripción: "GET roles only, no POST, no changes outside public/ui"

VALIDACIONES FINALES ANTES DE ENTREGAR
1) Confirmar no hay cambios fuera de public/ui
2) Confirmar NO existe ningún fetch a calc.php en este PR (solo roles.php)

CHECKLIST FINAL
- No tocar public/index.php
- No tocar public/api/calc.php
- No tocar public/app/

PR5: Integración con calc.php + Results Viewer real
- POST ../api/calc.php con el payload actual del builder (solo heirs).
- Viewer real en #/results con tabla de shares (rol/fracción/porcentaje/importe) o JSON crudo como fallback, audit/trace, exclusiones/bloqueos y errores si llegan.
- Se mantiene contract guard de roles y se evita cualquier endpoint absoluto.
- Sin frameworks ni pasos de build.
- Validaciones obligatorias:
  1) git diff --name-only: solo public/ui/*
  2) Abrir /Heritage/public/ui/
  3) Completar wizard (sexo) -> builder (al menos 1 heredero) -> results
 4) Click "Calcular ahora":
     - status running aparece
     - si el server responde: status ok y se renderiza algo (tabla o JSON fallback)
     - si falla: status error con mensaje claro
 5) Consola sin errores
 6) Confirmar que no hay endpoints absolutos "/api/.."
 7) Nota: habilitado POST calc.php

PR6: Hardening routing + wizard sync
- Routing estable:
  - Con DocumentRoot en /Heritage/ acceder a /Heritage/ y /Heritage/public/ debe redirigir a /Heritage/public/ui/.
  - /Heritage/public/ui/ responde 200 sin necesidad de añadir /index.html (DirectoryIndex en .htaccess).
- Repro wizard actualizado:
  1) Completar wizard y pasar a builder.
  2) Volver al wizard, cambiar por ejemplo sons_count, y regresar a builder.
  3) Debe mostrarse el banner "El wizard ha cambiado..." con el botón "Aplicar cambios del wizard".
  4) Al confirmar, se actualizan solo cónyuge, padres y descendientes; otros roles siguen igual.
- Scroll en builder:
  - Desplazar hasta la mitad de la lista, editar un input numérico, y comprobar que el scroll no salta arriba.
