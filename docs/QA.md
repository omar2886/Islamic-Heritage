# QA manual rápido

Pasos básicos para verificar que el foco no se pierde y el flujo completo funciona:

1. En "Causante", escribir "Omar" seguido sin perder foco en el campo de nombre.
2. Escribir montante "100000" seguido sin perder foco.
3. Definir sexo masculino y añadir wife = 1 en herederos; avanzar por los pasos.
4. En "Revisión" pulsar "Calcular" y comprobar que llega la respuesta JSON (RAW visible).
5. Probar el caso con montante vacío y confirmar que aparece error visible y no calcula.
6. Caso manual PR3: herencia 1000, causante masculino, wife = 1 y son = 1 → en resultados se debe ver wife 1/8 y el resto para son sin errores en consola.
