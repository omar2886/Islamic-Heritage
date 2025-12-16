# QA CHECKLIST (UI pública)

## Funcional
- [ ] Builder renderiza secciones y Personas.
- [ ] Toggle “Derivar desde Personas (grafo)” activo por defecto.
- [ ] Derivación estructural: father/mother, spouse(s), hijos/as, hermanos (plenos/consanguíneos/uterinos).
- [ ] Validaciones: límites de cónyuges por sexo; padre/madre vivos bloquean según reglas.
- [ ] Previsualización de payload; handoff a results vía `sessionStorage`.

## Resultados
- [ ] POST a `/public/api/calc.php` con `cli_flags ["--explain","--audit"]`.
- [ ] Render de `group_shares`, `individual_shares`, `sum_final`.
- [ ] Tablas visibles o, ante error, banner rojo + cURL reproducible.
- [ ] Botones “Descargar resultado / payload” y “Copiar cURL / resultado”.

## A11y
- [ ] *Skip link* visible en foco; lleva al contenido (home/builder/results).
- [ ] Foco inicial en el root de la vista.
- [ ] Banners `role="status|alert"` y `aria-live`.
- [ ] Controles con labels y `:focus-visible`.

## Import/Export
- [ ] Exporta caso (JSON) y lo reimporta sin pérdidas.
- [ ] Import con alias normaliza a roles canónicos y muestra avisos.

## smoke CLI
- [ ] `php scripts/smoke_http.php`

## Paquete
- [ ] `python3 scripts/make_public_zip.py` genera `public.zip`.
- [ ] El zip **excluye** `public/tools/`; el legacy PHP vive en `docs/_legacy/`.
