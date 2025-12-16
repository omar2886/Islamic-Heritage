# Frontends PHP legacy

Este directorio recoge los experimentos PHP previos que convivían dentro de `public/_legacy/`. El objetivo es archivarlos lejos del docroot para evitar exposiciones accidentales y documentar qué aportaba cada script.

## Estado de los scripts

### `docs/_legacy/combined.php`
Formulario monolítico que crea un caso y sus herederos en una misma vista HTML. Inserta los datos directamente en la tabla `cases` y en `heirs` mediante `PDO`, y delega el reparto final en `InheritanceCalculator`. Renderiza la tabla de resultados en la misma petición POST y depende de la constante `BASE_URL` para enlazar los estilos actuales. 【F:docs/_legacy/combined.php†L1-L196】【F:docs/_legacy/combined.php†L196-L320】

### `docs/_legacy/deepseek.php`
Interfaz alternativa basada en “cajas” con zoom/pan que permite anidar descendientes. Su flujo POST es similar al de `combined.php`: persiste los registros y luego invoca a `InheritanceCalculator` para montar la tabla HTML con fracciones. Incluye lógica JavaScript inline para generar la jerarquía. 【F:docs/_legacy/deepseek.php†L1-L160】【F:docs/_legacy/deepseek.php†L160-L320】

### `docs/_legacy/get_case_id.php`
Script auxiliar mínimo que devuelve el `MAX(id)` de la tabla `cases`. Se apoyaba en llamadas AJAX desde la UI antigua para recuperar el identificador recientemente insertado. 【F:docs/_legacy/get_case_id.php†L1-L10】

### `docs/_legacy/index_legacy.php`
Front controller clásico que roteaba entre las vistas y controladores PHP (por ejemplo `CaseController`, `HeirController`, `CalculationController`). El enrutado se accionaba mediante el parámetro `?page=` y cargaba los controladores modernos, por lo que hoy colisiona con la aplicación nueva. 【F:docs/_legacy/index_legacy.php†L1-L36】

## Limitaciones actuales
- Las rutas `require_once __DIR__ . '/../config/config.php'` esperaban vivir bajo `public/`; ahora es necesario ajustar el include path manualmente para poder ejecutarlos sin errores fatales.
- Las plantillas siguen apuntando a `BASE_URL . 'public/...` para CSS/JS y al almacenamiento relacional (`cases`, `heirs`). Es recomendable ejecutarlos solo en entornos de laboratorio con copias de la base de datos.

## Cómo ejecutar temporalmente
1. Ajusta las rutas `require_once` a `dirname(__DIR__, 2) . '/config/config.php'` (o exporta `include_path`) antes de lanzar la UI.
2. Sirve el directorio legacy con `php -S 0.0.0.0:8000 -t docs/_legacy` desde la raíz del repositorio.
3. Abre la URL correspondiente (por ejemplo `http://localhost:8000/combined.php`).

Estos pasos reinstalan el comportamiento previo manteniendo el código fuera de `public/`.
