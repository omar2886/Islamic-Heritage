# Islamic Heritage – Cálculo de herencia islámica según fiqh clásico


## Edge Pack M-E1..E8

| ID  | Escenario clave | Resultado esperado (resumen) |
|-----|-----------------|-------------------------------|
| M-E1 | Hija + hermana plena | Hija `1/2`, hermana plena toma el residuo como `asabah`. |
| M-E2 | Hija + hija de hijo (con y sin esposa) | Completan `2/3`; sin varón el remanente se redistribuye vía `RADD`. |
| M-E3 | Hermanas con hijas | Hermanas (plenas/consanguíneas) se vuelven `asabah` tras la cuota fija de las hijas. |
| M-E4 | Abuelo paterno vs. hermanos | El abuelo paterno absorbe todo, los hermanos quedan bloqueados. |
| M-E5 | Descendencia o abuelo paterno vs. uterinos | Los uterinos reciben `0/1` cuando existe descendencia o PGF. |
| M-E6 | Abuelas sin madre | La(s) abuela(s) reciben el residuo vía `RADD` (`1/1` en solitario, `1/2` cada una si hay dos). |
| M-E7 | Más de cuatro esposas | Se emite aviso duro y en modo `--strict` el cálculo finaliza con código `2`. |
| M-E8 | Variaciones de Umariyya | Ajuste clásico (madre `1/3` del remanente) y combinaciones con hijas o esposas múltiples. |

Todos los casos cuentan con fixtures en `tests/fixtures/ME*.json` y se ejercitan en `tests/run_min_suite.php`.

### `meta.residual_policy`

El motor expone `meta.residual_policy` para indicar qué mecanismo resolvió el remanente:

- `none`: las cuotas fijas sumaron `1` sin redistribución adicional.
- `asaba`: el residuo pasó a herederos agnáticos o a quienes hacen _ta'sib ma'a al-ghayr_.
- `radd`: el residuo se redistribuyó proporcionalmente entre no cónyuges elegibles.
- `bayt_al_mal`: queda remanente tras excluir cónyuges del `RADD`; se debe al Bayt al-Mal.

Consulta `public/tools/bootstrap_check.php` para una verificación rápida del runtime en despliegues sin shell.

## Créditos / Licencia

El cálculo y las herramientas fueron elaborados por el equipo de Islamic Heritage para difundir la distribución clásica de herencias. Se publica bajo la licencia MIT; si reutilizas el código, conserva este aviso de autoría y la licencia correspondiente.

## Fuzz
- `php tests/fuzz/fuzz.php --cases=1000 --seed=42`
- Propiedades validadas: Σ=1, no-negativo, determinismo, bloqueos padre/PGF y varón descendiente/siblings.
- Úsalo en CI para validar PRs.
