# Plan Tecnico de Rediseno UI para Heritage

Fecha: 2026-03-14
Estado: borrador de trabajo para iterar contigo
Enfoque recomendado: reconstruccion guiada de la experiencia web, sin reescribir el motor de calculo

## 1. Objetivo

Este documento resume una revision profunda del proyecto y propone un plan tecnico mejorado para rehacer toda la interfaz de usuario de `Heritage` con calidad profesional.

La conclusion principal es esta:

- la base logica del calculo esta bastante mas madura que la capa de experiencia
- el problema no es solo estetico
- hoy existe una mezcla peligrosa de UI minima, rutas legacy, QA obsoleto, packaging desalineado y documentacion contradictoria
- si no se corrige el approach, un nuevo frontend bonito correria el riesgo de volver a quedar encima de una base desordenada

Por eso la recomendacion ya no es solo "hacer una UI moderna", sino aplicar un approach mas solido:

- `schema-first`
- `draft model canonico`
- `frontend desacoplado`
- `rollout por strangler pattern`
- `recanonizacion de rutas, QA y deploy`

## 2. Resumen ejecutivo

## 2.1 Diagnostico corto

`Heritage` tiene hoy cuatro realidades distintas coexistiendo:

1. un motor PHP y dominio de reparto bastante robustos
2. una SPA minima real en `public/ui/`
3. una capa MVC/legacy PHP antigua aun presente en el repo
4. una bateria de docs, scripts y tests que en muchos casos siguen describiendo builders, pantallas y flujos que ya no son la aplicacion publicada

Eso significa que el proyecto tiene una deuda estructural de producto, frontend y release engineering.

## 2.2 Recomendacion corta

Mantener el motor de calculo y reconstruir la experiencia web como una aplicacion moderna separada, guiada, explicativa y testeable.

La arquitectura objetivo recomendada es:

- frontend nuevo en `frontend/`
- build estatico hacia `public/ui-next/` y despues `public/ui/`
- `React + TypeScript + Vite`
- `CaseDraft` canonico como modelo intermedio de producto
- adaptador `CaseDraft -> CalcPayload`
- contrato API formalizado con tests de contrato
- migracion controlada sin romper la capa de calculo actual

## 2.3 Lo mas importante que cambia respecto al plan anterior

El nuevo approach incorpora explicitamente estas ideas, que ahora considero necesarias:

- un modelo canonico de caso (`CaseDraft`) para evitar que el frontend vuelva a acoplarse al payload tecnico del calculador
- una estrategia de migracion tipo `strangler` en vez de reemplazo brusco
- saneamiento de deploy y packaging, porque hoy la historia de publicacion esta desalineada
- rebase de QA y documentacion, porque gran parte del material actual valida pantallas que no son la UI viva
- separacion real entre experiencia de usuario, auditoria tecnica y superficies legacy

## 3. Que revise para sacar este plan

He revisado principalmente:

- `public/ui/*`
- `public/api/*`
- `app/Services/*`
- `app/Models/InheritanceCalculator.php`
- `app/Domain/*`
- `scripts/*`
- `tests/*`
- `docs/*`
- `config/config.php`
- `db/schema.sql`

Tambien valide el comportamiento general local del entrypoint y de los endpoints:

- la raiz del repo redirige a `./public/ui/`
- `public/ui/` sirve la SPA minima actual
- `public/api/roles.php` responde correctamente
- `public/api/calc.php` responde correctamente con un payload minimo valido

## 4. Inventario real del estado actual

## 4.1 Lo que si esta vivo y aporta valor

### Dominio y calculo

La base de negocio esta en:

- `app/Services/*`
- `app/Domain/*`
- `app/Models/InheritanceCalculator.php`
- `app/Resources/rules/maliki.yml`

La salida del calculo ya tiene suficiente riqueza para una buena UX:

- `shares.fixed`
- `shares.normalized`
- `shares.asaba`
- `shares.final`
- `warnings`
- `audit`
- `explain`
- `meta.phase_ledger`

Esto es excelente, porque permite construir una UI fuerte sin inventar una narrativa de calculo paralela.

### API publica util

- `public/api/calc.php`
- `public/api/roles.php`

## 4.2 Lo que hoy parece ruta real de uso

La experiencia visible actual vive en:

- `index.php` en raiz del repo
- `public/ui/index.html`
- `public/ui/src/*`

La UI actual es una SPA minima basada en:

- formularios por rol y conteo
- validaciones ligeras en cliente
- llamada directa a `calc.php`
- tabla de resultados
- panel de debug integrado

## 4.3 Lo que esta mezclado, roto o desalineado

Aqui esta la mayor fuente de riesgo:

- `public/index.php` intenta cargar `partials` y `views` que no existen
- `public/app/v2/index.php` hereda esa ruta
- `app/Views/*` conserva vistas antiguas no conectadas con la UI real
- `docs/_legacy/*` conserva interfaces previas
- muchos tests de UI siguen esperando builders o wizards que no estan en `public/ui`
- scripts de smoke y e2e siguen levantando o verificando rutas obsoletas
- `docs/DEPLOY_SHARED_HOSTING.md` y `scripts/make_public_zip.py` no cuentan la misma historia de deploy

No es solo "legacy en el repo". Es legacy que sigue contaminando:

- documentacion
- QA
- empaquetado
- diagnostico
- suposiciones de arquitectura

## 5. Hallazgos nuevos y puntos debiles mas importantes

## 5.1 La experiencia actual no esta modelada desde el usuario

Hoy el frontend obliga a pensar en el caso como lista de roles tecnicos y conteos.

Eso puede servir como modo experto, pero es una mala experiencia principal.

El usuario real piensa en:

- quien era el causante
- quien sobrevive
- cuantos hijos e hijas hay
- si hay padres
- si hay conyuge
- si existen nietos por hijo
- si el patrimonio se quiere repartir tambien en importe

No piensa en:

- catalogos internos de roles
- agrupaciones tecnicas
- metadatos de compatibilidad
- detalles de trazas en bruto

## 5.2 La interfaz transmite MVP, no producto serio

La UI actual en `public/ui` comunica:

- prototipo tecnico
- panel interno
- herramienta de laboratorio

No comunica:

- confianza
- claridad
- autoridad
- calma
- precision pedagogica

Sintomas visuales y de producto:

- layout generico
- tipografia sin personalidad
- resultados muy tabulares y densos
- debug visible en la misma experiencia
- ayudas insuficientes
- falta de narrativa del producto

## 5.3 La arquitectura frontend actual es demasiado fragil para evolucionar

`public/ui/src/main.js` concentra:

- estado
- render
- side effects
- API
- snapshots
- validacion
- wiring del DOM

Eso ya no escala para una experiencia profesional.

Ademas, el frontend actual tiene fallos concretos:

- `validateHard()` y `validateSoft()` no comparten contrato con quien las consume
- el panel debug usa una clave de estado incorrecta
- varias `msgKey` no coinciden con el diccionario i18n
- el cliente API se instancia con opciones que no usa realmente
- la UI lanza sondeos de compatibilidad contra `calc.php` en runtime, algo impropio de produccion

## 5.4 No existe un modelo canonico de producto entre la UX y el payload tecnico

Este es uno de los huecos mas importantes detectados.

Hoy la UI esta casi pegada al payload de calculo:

- el usuario rellena roles
- el frontend arma `heirs[]`
- se manda directo a `calc.php`

Eso hace dificil construir bien:

- modo guiado
- modo experto
- borradores guardados
- import/export
- review previa al calculo
- comparacion de escenarios
- futura vista genealogica

### Debilidad de fondo

Falta una capa intermedia tipo:

- `CaseDraft`

Que represente el caso desde la logica de producto y no desde el contrato tecnico de calculo.

Sin esa capa, cualquier rediseño quedara demasiado acoplado al motor.

## 5.5 Hay una situacion de "split-brain" en routing y deploy

Este es un problema mas serio de lo que parecia al principio.

### Realidad A

La raiz del repo `index.php` redirige a `./public/ui/`.

### Realidad B

Si se sirve o empaqueta `public/` como docroot, el `index.php` efectivo pasa a ser `public/index.php`, que esta roto porque depende de vistas inexistentes.

### Realidad C

La documentacion de despliegue dice que deben funcionar rutas como:

- `/?page=builder`
- `/?page=results`

### Realidad D

El script `scripts/make_public_zip.py` empaqueta `public/` con un prefijo `public/`, lo que introduce otra convencion distinta a la documentada.

### Conclusiones

- la historia de despliegue no es canonica
- el punto de entrada real del producto no esta estabilizado
- la publicacion es propensa a errores
- no se puede rediseñar bien la UX sin resolver antes esta incoherencia operacional

## 5.6 QA y documentacion estan validando aplicaciones distintas

He encontrado varios sintomas de deriva:

- tests que esperan `builder`, `results`, `builder3`, `results3`
- tests que esperan `#sec-persons`, `#btnAddPerson`, `heritage_payload`, `wizard`, etc.
- docs manuales que hablan de flujos que no existen en `public/ui`
- scripts E2E que arrancan rutas desfasadas

Esto significa algo importante:

Hoy el proyecto puede dar una falsa sensacion de cobertura sin proteger la UI real publicada.

## 5.7 Superficies legacy y de diagnostico aun mal encapsuladas

Hay restos legacy que, aunque no sean hoy la UX principal, siguen siendo riesgo:

- `app/Views/*`
- controladores antiguos
- `db/schema.sql` y MVC relacional de casos/herederos
- `public/diag.php` con links a recursos desfasados

En particular, `public/diag.php` sigue respondiendo a una arquitectura vieja y usa un token por defecto debil.

Aunque esto no sea el problema central de UX, forma parte del mismo problema de producto: el repo no tiene una linea clara entre superficies soportadas y superficies heredadas.

## 5.8 La estrategia de contenido e i18n esta verde

La i18n actual:

- vive inline en JS
- mezcla lenguaje tecnico y lenguaje de usuario
- no esta preparada para crecer
- no tiene una estrategia clara de glosario o terminos juristicos

Para un producto como este, eso importa mucho.

No basta con traducir labels. Hace falta decidir:

- que terminos se mantienen en arabe transliterado
- que terminos se explican
- que nivel de lenguaje se usa
- que idiomas van primero
- si se quiere preparar soporte futuro para AR o FR

## 5.9 Falta una estrategia de observabilidad y diagnostico de producto

Hoy hay debug tecnico, pero no una observabilidad de producto util.

Seria mucho mas valioso registrar:

- fallos de calculo
- errores de validacion mas frecuentes
- abandonos por paso
- payloads invalidos
- tiempos de respuesta

No hace falta meter una gran plataforma desde el dia 1, pero si dejar previsto:

- logging estructurado
- modo debug separado
- trazas de fallo reproducibles

## 6. Causas raiz

El problema de la interfaz viene de una combinacion de factores:

1. el motor evoluciono mas deprisa que el frontend
2. hubo varias iteraciones de UI sin converger en una sola canonica
3. se fue acumulando legacy sin un corte definitivo
4. el frontend actual quedo muy pegado al payload tecnico
5. docs, tests y packaging no se recanonizaron cuando la UI cambio

Por eso el nuevo plan tiene que actuar sobre:

- producto
- arquitectura
- QA
- deploy
- documentacion

No solo sobre CSS.

## 7. Nuevo approach recomendado

## 7.1 Approach general

La mejor estrategia no es reescribir "la pagina actual".

La mejor estrategia es esta:

### Fase conceptual

- definir una experiencia nueva desde el modelo mental del usuario
- definir un modelo de datos intermedio de producto
- congelar el contrato del calculador

### Fase tecnica

- construir un frontend nuevo paralelo
- mapear `CaseDraft -> CalcPayload`
- validar con fixtures y tests de contrato

### Fase de migracion

- publicar en `ui-next`
- validar
- pasar a `ui`
- retirar rutas y docs obsoletas

## 7.2 Los cuatro pilares del nuevo approach

### Pilar 1. Schema-first

Antes de construir la UI nueva, hay que definir y fijar:

- `CalcPayloadSchema`
- `CalcResponseSchema`
- `CaseDraftSchema`
- opcionalmente `UICatalogSchema`

Eso reduce drift y hace posible:

- contract tests
- type generation
- validacion estable

### Pilar 2. Draft model canonico

Crear un modelo intermedio, por ejemplo:

- `CaseDraft`

Con estructura de producto, no de backend.

Ejemplo conceptual:

- datos del causante
- familia inmediata
- descendencia
- colaterales
- patrimonio
- preferencias de visualizacion

Luego, un adaptador traduce ese draft al payload tecnico del calculador.

Esto sera la base para:

- wizard
- modo experto
- borradores
- import/export
- revision previa

### Pilar 3. Strangler rollout

No sustituir de golpe la UI actual.

Plan de rollout:

- UI nueva en `public/ui-next/`
- validacion funcional con el mismo backend
- endurecer QA y contrato
- solo despues convertirla en `public/ui/`

### Pilar 4. Recanonizacion del proyecto

Hay que elegir una sola verdad para cada una de estas cosas:

- ruta publica oficial
- build oficial
- empaquetado oficial
- suite de QA oficial
- docs oficiales

Mientras eso no exista, cualquier rediseño seguira apoyandose en arena.

## 8. Vision objetivo del producto

## 8.1 Principios de UX

La nueva experiencia debe sentirse:

- profesional
- clara
- guiada
- confiable
- didactica sin ser infantil
- apta para movil
- util para usuario comun
- util tambien para usuario experto

## 8.2 Modelo de experiencia recomendado

Recomiendo dos modos:

### Modo guiado

Es la experiencia principal y prioritaria.

Pensada para:

- usuarios generales
- asesores
- personas que no dominan la taxonomia tecnica de herederos

### Modo experto

Vista compacta y rapida por roles y conteos.

Pensada para:

- pruebas
- usuarios avanzados
- soporte
- verificacion del contrato

El modo experto no debe definir la UX principal. Debe convivir como atajo profesional.

## 8.3 Pantallas o superficies recomendadas

### 1. Portada o landing

Objetivos:

- explicar que hace la herramienta
- dejar claro el alcance Maliki
- generar confianza
- ofrecer acceso a un ejemplo real
- enlazar a "nuevo caso"

### 2. Builder guiado

Objetivos:

- capturar informacion sin abrumar
- ordenar por proximidad familiar
- reducir errores
- mostrar resumen persistente del caso

### 3. Revision previa al calculo

Objetivos:

- revisar quien entra
- detectar omisiones
- mostrar coherencia del caso antes de enviar

### 4. Resultados

Objetivos:

- mostrar reparto de forma inmediata
- explicar exclusiones
- explicar metodo
- separar vista humana de vista tecnica

### 5. Diagnostico tecnico separado

Objetivos:

- ver payload y respuesta completa
- auditar trazas
- no contaminar la experiencia del usuario final

## 9. Arquitectura objetivo

## 9.1 Stack propuesto

Recomendacion:

- React 19
- TypeScript
- Vite
- React Router con `basename` configurable para subruta
- React Hook Form + Zod
- cliente fetch tipado o TanStack Query
- Storybook
- Playwright

### Por que esta opcion

- buen equilibrio entre robustez y velocidad
- build estatico compatible con hosting compartido
- tipado fuerte en la capa con mas deuda actual
- escalabilidad para wizard, resultados, variantes y testing

## 9.2 Estructura de carpetas recomendada

```text
frontend/
  src/
    app/
    pages/
    features/
      case-builder/
      results/
      diagnostics/
    entities/
      case-draft/
      calculation/
    shared/
      api/
      ui/
      lib/
      i18n/
  public/
  package.json
```

## 9.3 Modelo de datos recomendado

### Modelo canonico de producto

- `CaseDraft`

Responsable de representar el caso en la UI.

### Modelo de integracion

- `CalcPayload`

Responsable de hablar con `calc.php`.

### Modelo de salida

- `CalculationResult`

Adaptado desde la respuesta real del backend a necesidades de presentacion.

## 9.4 Adaptadores necesarios

- `CaseDraft -> CalcPayload`
- `CalcResponse -> CalculationResult`
- `RolesCatalog/UICatalog -> UI metadata`

Esto permitira desacoplar:

- experiencia
- contrato del backend
- presentacion

## 9.5 Endpoint nuevo recomendado

Recomiendo anadir un endpoint tipo:

- `GET /public/api/ui_catalog.php`

Con metadata rica para la UI:

- orden de roles
- agrupaciones
- labels por idioma
- ayudas
- limites
- restricciones
- disponibilidad por escuela

Si no se quiere crear ya en backend, puede arrancarse temporalmente desde un JSON versionado en frontend, pero la solucion final deberia tener una fuente de verdad clara.

## 9.6 Sistema de diseno

Se debe definir desde el inicio:

- tipografia
- escala de espaciado
- paleta
- elevaciones
- radios
- tabla de tokens
- formularios
- estados
- iconografia
- layout
- tono de mensajes

Recomendacion visual:

- alejarse del dark MVP actual
- construir una estetica clara, elegante y serena
- disenar pensando primero en lectura y confianza

## 9.7 Estrategia de contenido e i18n

No dejar la i18n como un diccionario inline improvisado.

Hay que definir:

- idioma base de desarrollo
- idiomas soportados en V1
- glosario juridico
- tono de copy
- politica de terminos tecnicos

Recomendacion:

- V1 como minimo en espanol e ingles bien hechos
- dejar preparada la arquitectura para arabe y frances
- mantener un glosario comun para terminos como `fard`, `asaba`, `awl`, `radd`

## 9.8 Diagnostico y observabilidad

Separar claramente:

- experiencia de usuario
- experiencia de soporte

Recomendacion:

- quitar debug de la UI principal
- mover diagnostico a una superficie interna o modo de desarrollo
- registrar fallos estructurados
- definir eventos clave del builder

## 9.9 Deploy y packaging

Esta parte debe entrar en el plan desde el principio, no al final.

Objetivos:

- una sola historia de deploy
- una sola ruta principal
- un solo paquete publicable

Recomendacion:

- decidir si el producto publico vive en `/ui/` o en `/`
- adaptar `public/index.php` para servir la UI nueva o redirigir de forma canonica
- rehacer `make_public_zip.py` para empaquetar exactamente lo que se despliega
- actualizar docs de deploy solo cuando esa historia ya sea real

## 10. Modelo funcional propuesto

## 10.1 Flujo guiado

### Paso 1. Causante y alcance

- sexo
- escuela juridica
- patrimonio
- moneda

### Paso 2. Familia inmediata

- esposo o esposas
- padre
- madre

### Paso 3. Descendencia

- hijos
- hijas
- pistas de impacto juridico de forma simple

### Paso 4. Nietos por hijo

- activacion condicional
- explicacion contextual
- validaciones coherentes

### Paso 5. Hermanos

- plenos
- consanguineos
- uterinos

### Paso 6. Parientes avanzados

- abuelo paterno
- abuelas
- tios paternos y rama agnatica

### Paso 7. Revision

- resumen del caso
- conflictos
- puntos dudosos
- boton de calcular

## 10.2 Modo experto

Debe permitir:

- editar por roles
- ver payload derivado
- recalcular rapido
- comparar con el draft guiado

Pero no debe forzar a todos los usuarios a entrar por ese camino.

## 10.3 Resultados

### Nivel 1. Resumen

- patrimonio
- tipo de resolucion del remanente
- reparto principal

### Nivel 2. Reparto

- cards o tabla responsiva por grupo/heredero
- fraccion grupal
- fraccion individual
- monto
- origen del derecho

### Nivel 3. Explicacion

- cuotas fijas
- awl
- radd
- asaba
- bloqueos

### Nivel 4. Auditoria

- JSON completo
- traces
- phase ledger
- warnings tecnicos

## 11. Roadmap mejorado por frentes de trabajo

## Frente A. Rebase tecnico del proyecto

Objetivo: limpiar la base antes de construir.

### Tareas

- definir rutas oficiales vivas
- marcar legacy de forma explicita
- decidir entrypoint publico canonico
- rehacer packaging
- rehacer docs de deploy
- definir que scripts siguen siendo validos

### Entregables

- mapa oficial de rutas
- flujo oficial de deploy
- matriz legacy vs soportado

## Frente B. Contrato y modelos

Objetivo: fijar la frontera frontend-backend.

### Tareas

- definir `CaseDraftSchema`
- definir `CalcPayloadSchema`
- definir `CalcResponseSchema`
- construir adaptadores
- crear contract tests

### Entregables

- schemas versionados
- fixtures representativas
- tipos TS derivados o equivalentes

## Frente C. Sistema de diseno y shell

Objetivo: crear una base de UI seria.

### Tareas

- tema visual
- componentes base
- layout principal
- patrones de formularios
- estados de error, vacio y carga
- base i18n

### Entregables

- shell navegable
- design tokens
- libreria de componentes inicial

## Frente D. Builder guiado

Objetivo: crear la nueva experiencia de entrada.

### Tareas

- wizard por pasos
- resumen lateral o persistente
- validaciones claras
- autosave de borrador
- review previa
- modo experto integrado

### Entregables

- builder guiado funcional
- borradores
- review previa al calculo

## Frente E. Resultados y explicabilidad

Objetivo: transformar la potencia del backend en claridad real.

### Tareas

- resumen ejecutivo
- reparto principal
- bloqueos y exclusiones
- timeline del calculo
- auditoria separada
- impresion/exportacion basica

### Entregables

- nueva pantalla de resultados
- narrativa del calculo
- superficie de auditoria

## Frente F. QA y release

Objetivo: validar la UI real y cortar la deriva.

### Tareas

- Playwright sobre rutas reales
- tests de contrato
- responsive QA
- accessibility QA
- smoke de deploy empaquetado
- eliminacion de QA obsoleta

### Entregables

- suite oficial alineada con la app real
- pipeline de release confiable

## 12. Fases de ejecucion recomendadas

## Fase 0. Decision de canon

- cerrar ruta publica oficial
- cerrar stack
- cerrar modelo `CaseDraft`
- cerrar historia de deploy

## Fase 1. Foundation

- schemas
- adaptadores
- shell frontend
- sistema de diseno base

## Fase 2. Builder nuevo

- flujo guiado
- modo experto
- revision previa

## Fase 3. Resultados nuevos

- resumen
- explicacion
- auditoria separada

## Fase 4. Rollout controlado

- publicar `ui-next`
- testear
- promover a `ui`

## Fase 5. Limpieza

- retirar docs y QA viejas
- encapsular o archivar legacy
- dejar una sola historia oficial del producto

## 13. Decisiones importantes que conviene tomar pronto

1. La UI publica final debe vivir en `/` o en `/ui/`?
2. V1 debe incluir solo builder guiado y modo experto, o tambien guardar casos?
3. Quieres preparar desde ya multidioma serio con ES/EN y arquitectura para AR/FR?
4. Quieres o no una vista genealogica visual en V1?
5. Quieres que la auditoria tecnica sea solo para administracion o accesible al usuario final?

## 14. Lo que yo NO haria

Para evitar repetir errores, no recomiendo:

- seguir extendiendo la SPA vanilla actual como base del producto final
- dejar el payload de calculo como modelo principal de UI
- mantener runtime role probing en produccion
- seguir documentando varias rutas oficiales a la vez
- intentar soportar al mismo tiempo toda la UI legacy como si fuese parte del producto actual
- mezclar otra vez debug tecnico con experiencia de usuario

## 15. Riesgos y mitigaciones

## Riesgo 1. Hacer una UI bonita pero seguir con backend/frontend acoplados

Mitigacion:

- introducir `CaseDraft`
- introducir adaptadores

## Riesgo 2. Construir la UI nueva sin resolver deploy

Mitigacion:

- definir la historia de publicacion antes del rollout

## Riesgo 3. Volver a generar docs y tests que no reflejen la app viva

Mitigacion:

- recanonizar una sola suite oficial y una sola ruta oficial

## Riesgo 4. Intentar meter demasiadas superficies en V1

Mitigacion:

- V1 centrada en builder, review, resultados y diagnostico separado

## Riesgo 5. Reabrir la caja de Pandora legacy

Mitigacion:

- aislar MVC y docs antiguas
- tratarlas como legado, no como plataforma activa

## 16. Definition of Done para la nueva interfaz

No deberiamos dar por terminada la nueva UI hasta que se cumpla esto:

- un usuario no experto puede completar un caso comun sin conocer el catalogo tecnico de roles
- la UI funciona bien en movil y desktop
- la experiencia principal no expone debug tecnico
- los resultados se entienden sin abrir JSON
- existe una vista de auditoria clara para soporte o usuarios avanzados
- el deploy oficial tiene una sola historia coherente
- la suite oficial valida exactamente la app que se publica
- docs, QA, routes y packaging cuentan la misma historia

## 17. Recomendacion practica inmediata

El siguiente paso mas sensato, antes de programar la UI nueva, es cerrar contigo estas cuatro cosas:

1. ruta oficial del producto
2. stack final
3. modelo `CaseDraft`
4. alcance real de la V1 profesional

En cuanto eso este claro, el resto ya se puede implementar con mucha mas seguridad y sin volver a entrar en deriva.

## 18. Espacio para tus anotaciones

Puedes usar este mismo archivo para marcar:

- prioridades
- pantallas obligatorias
- funcionalidades que quieres en V1
- dudas sobre modo experto
- preferencias visuales
- si quieres o no arbol genealogico en primera fase
- idiomas que deben entrar desde el principio

Mi recomendacion actual de V1:

- builder guiado fuerte
- modo experto opcional
- review previa al calculo
- resultados muy claros
- auditoria separada
- deploy canonico
- cero dependencia de rutas legacy

## 19. Backlog operativo

La conversion de este plan a tareas ejecutables ya esta documentada en:

- `BACKLOG_IMPLEMENTACION_UI.md`

Ese backlog baja el plan a:

- epics
- tareas tecnicas
- dependencias
- criterios de aceptacion
- orden de PRs recomendado
