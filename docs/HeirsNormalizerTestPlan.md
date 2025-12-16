# Plan de pruebas para `HeirsNormalizer`

Este plan documenta tres fixtures genealógicos que permiten validar la capa de normalización sin depender de la UI. Cada fixture se arma instanciando manualmente `PersonNode` y enlazando sus descendientes como lo hace `GenealogyBuilder`. Después de aplicar `SubstitutionManager` y `BlockageManager`, se invoca `HeirsNormalizer::normalize()` y se contrastan los resultados.

## Fixture A – Dos esposas y descendencia directa
- **Descripción**: Causante varón con dos esposas vivas, un hijo y una hija vivos, madre viva y padre fallecido.
- **Heirs esperados**:
  - `wife` con `count=2`, `degree=0`.
  - `mother` con `count=1`, `degree=0`.
  - `son` con `count=1`, `degree=1`.
  - `daughter` con `count=1`, `degree=1`.
- **Contexto esperado**: `hasDescendants=true`, `hasMaleDescendant=true`, `hasFemaleDescendant=true`, `hasFather=false`, `hasPaternalGrandfather=false`, `siblingsCount=0`, `uterinesCount=0`, `wivesCount=2`.

## Fixture B – Nieto por sustitución y colaterales
- **Descripción**: Causante varón sin hijos vivos. Nieto (hijo de hija fallecida) sustituye, abuelo paterno vivo, hermano pleno y hermana uterina vivos.
- **Heirs esperados**:
  - `paternal_grandfather` con `count=1`, `degree=0`.
  - `full_brother` con `count=1`, `degree=0`.
  - `uterine_sister` con `count=1`, `degree=0`.
  - `sons_son` con `count=1`, `degree=2` (nieto varón por sustitución).
- **Contexto esperado**: `hasDescendants=true`, `hasMaleDescendant=true`, `hasFemaleDescendant=false`, `hasFather=false`, `hasPaternalGrandfather=true`, `siblingsCount=2`, `uterinesCount=1`, `wivesCount=0`.

## Fixture C – Causante mujer sin descendencia
- **Descripción**: Causante mujer con esposo vivo, madre viva y dos hermanas consanguíneas vivas.
- **Heirs esperados**:
  - `husband` con `count=1`, `degree=0`.
  - `mother` con `count=1`, `degree=0`.
  - `consanguine_sister` con `count=2`, `degree=0`.
- **Contexto esperado**: `hasDescendants=false`, `hasMaleDescendant=false`, `hasFemaleDescendant=false`, `hasFather=false`, `hasPaternalGrandfather=false`, `siblingsCount=2`, `uterinesCount=0`, `wivesCount=0`.

Las aserciones pueden implementarse con PHPUnit o pruebas funcionales simples verificando los arrays de salida contra las expectativas anteriores.
