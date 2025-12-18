# Checklist manual de smoke tests V3

Usa esta lista rápida después de desplegar cambios en la interfaz V3 para validar que el flujo básico sigue funcionando.

1. Caso mínimo: crear árbol con un solo individuo y confirmar que renderiza el nodo raíz sin errores.
2. Padres vivos: agregar padre y madre vivos al árbol, revisar que aparecen y que los enlaces se dibujan correctamente.
3. Hijos múltiples: añadir varios hijos al nodo raíz y validar que la distribución y numeración son consistentes.
4. Ciclo inválido: intentar asignar como padre a un descendiente y confirmar que la UI rechaza el ciclo con un mensaje claro.
5. Quinta esposa: agregar cuatro esposas y verificar que la quinta entrada muestra validación o límite adecuado.
6. Divorcio/viudez: marcar una pareja como divorciada o viuda y comprobar que el estado visual y los textos se actualizan.
7. Cambio de rol: editar el rol de un nodo (p. ej., de hija a hijo) y revisar que los iconos/colores se ajustan.
8. Genealogía existente: cargar un árbol guardado en V3 y asegurarse de que todos los nodos aparecen con sus relaciones.
9. Exportación/descarga: probar la acción de exportar o descargar el árbol y confirmar que el archivo se genera.
10. Navegación de resultados: ejecutar un cálculo desde V3 y abrir la vista de resultados para comprobar que el resumen y las secciones se muestran.
