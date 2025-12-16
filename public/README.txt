Calculadora de herencia islámica — escuela Maliki (UI pública)

Estructura
----------
public/
  index.php             Router simple (home, builder, results)
  css/styles.css        Estilos base (contraste ≥ 4.5:1, focus-visible)
  js/                   Módulos JS (sin frameworks)
    boot-home.js        Entrypoint de la portada
    boot-builder.js     Entrypoint del constructor (formulario)
    boot-results.js     Entrypoint de resultados
    api.js, roles.js, validation.js, serializer.js
    state.js, persons.js, derive.js, aliases.js, caseio.js, storage.js
    ui/components.js, ui/builder.js, ui/persons.js, ui/results.js
  api/roles.php         Catálogo de roles (fallback si vacío)
  api/calc.php          Endpoint principal de cálculo (JSON POST)
  tools/explain_smoke.php
                        Herramienta de backend para desarrollo

Legacy PHP archivado en `docs/_legacy/` (fuera del docroot) junto con `docs/_legacy_cleanup/`.

Contrato de entrada al backend
------------------------------
Endpoint estable de cálculo:
POST public/api/calc.php
Content-Type: application/json

{
  "heirs": [ { "role": "wife", "count": 1 }, ... ],
  "estate_value": "1000",
  "amount": "1000",                  // compat
  "cli_flags": ["--explain","--audit"],
  "ui_meta": { "sex":"male|female|unknown", "decedentId":"P#" },
  "persons": [ { "id":"P1", "name":"...", "sex":"male|female|unknown", "alive":true, "role":"wife|..." , "fatherId":null, "motherId":null, "spouseIds":["P#"] } ]
}

Validaciones UI (screening)
---------------------------
- Sexo varón  ⇒ husband=0; wives ≤ 4
- Sexo mujer  ⇒ wife=0;    husband ≤ 1
- Sexo desconocido ⇒ máx. 1 cónyuge total
- Padre vivo  ⇒ excluye abuelos paternos + TODOS los hermanos (plenos/consanguíneos/uterinos)
- Madre viva  ⇒ excluye abuela materna
- Solo personas VIVAS computan.

Alias → canónico (importación)
------------------------------
- spouses/spouse/conyuge → wife|husband según sexo del causante (unknown: se omite)
- sons/hijos → son ; daughters/hijas → daughter
- pgf/abuelo_paterno → paternal_grandfather ; pgm/abuela_paterna → paternal_grandmother
- mgm/abuela_materna → maternal_grandmother
- brother/hermano → full_brother ; sister/hermana → full_sister
- agnatic_brother → consanguine_brother ; uterine_bro → uterine_brother
Los roles no canónicos se ignoran con aviso.

Despliegue local (dev)
----------------------
php -S 0.0.0.0:8000 -t public

Cálculo de ejemplo (curl)
-------------------------
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"heirs":[{"role":"wife","count":1},{"role":"daughter","count":1}],"estate_value":"1000","amount":"1000","cli_flags":["--explain","--audit"]}' \
  http://localhost:8000/api/calc.php
