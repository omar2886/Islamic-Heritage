# QA rápida de flujo

Lista rápida para validar el MVP del flujo en UI (manual):

1. Cargar la pantalla inicial y ver título/prólogo visible.
2. Seleccionar sexo de la persona fallecida sin errores visuales.
3. Añadir herederos con los controles (+/-) y ver actualización de totales.
4. Validar que las advertencias/errores aparecen en el panel lateral.
5. Probar autocompletado/búsqueda de roles y filtrar correctamente.
6. Revisar sección de revisión/resumen antes de calcular.
7. Ejecutar cálculo y confirmar que se muestran los shares y porcentajes.
8. Ver importes monetarios cuando se ingresa el valor de la herencia.
9. Exportar/descargar JSON y comprobar que contiene los mismos datos.
10. Recargar la página y comprobar que el estado guardado se restaura.

## Comandos de smoke tests

```bash
php -l scripts/run_flow_scenarios.php
php scripts/run_flow_scenarios.php
```
