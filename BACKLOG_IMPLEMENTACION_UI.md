# Backlog de Implementacion UI para Heritage

Fecha: 2026-03-14
Base de referencia: `PLAN_TECNICO_REDISENO_UI.md`
Estado: backlog inicial listo para ejecucion controlada

## 1. Objetivo

Este documento convierte el plan arquitectonico en un backlog tecnico ejecutable.

La intencion es que podamos picar codigo por bloques pequenos, con dependencias claras y sin romper el enfoque ya acordado:

- `CaseDraft` como modelo canonico
- `Zod` como unica fuente de verdad para schema + tipado TS
- mapeadores puros testeables sin React ni PHP
- rollout tipo `Strangler`
- una sola historia oficial de rutas, deploy y QA

## 2. Reglas de ejecucion

## 2.1 Reglas obligatorias

1. Ninguna tarea de UI nueva debe acoplarse directamente al payload final de `calc.php` sin pasar por `CaseDraft`.
2. Ninguna validacion principal de UX debe definirse fuera de schemas Zod o fuera del modelo canonico.
3. Los mapeadores `CaseDraft -> CalcPayload` y `CalcResponse -> ViewModel` deben ser puros y unit-testables.
4. La nueva UI debe nacer en paralelo a la existente y publicarse primero en `ui-next`.
5. No se debe ampliar la UI legacy salvo para aislarla o redirigirla.
6. Ninguna suite E2E nueva debe apuntar a rutas legacy.

## 2.2 Definition of Ready para cada tarea

Una tarea esta lista para ejecutarse si:

- su dependencia anterior esta cerrada
- se sabe en que carpeta vivira el codigo
- se conoce su criterio de aceptacion
- no exige decisiones de producto aun abiertas

## 2.3 Definition of Done para cada tarea

Una tarea no se considera terminada hasta que:

- el codigo compila
- tiene pruebas adecuadas al nivel correcto
- la documentacion minima se ha actualizado si afecta al contrato o al deploy
- no deja rutas o nombres ambiguos nuevos en el repo

## 3. Orden de ejecucion recomendado

## Ola 0. Canon del proyecto

Meta: dejar claro que es "lo vivo" antes de construir.

## Ola 1. Schemas y mapeadores

Meta: fijar el nucleo del nuevo frontend sin tocar aun la UI final.

## Ola 2. Shell y design system

Meta: construir una base presentacional estable.

## Ola 3. Builder guiado

Meta: capturar el caso con UX profesional.

## Ola 4. Resultados

Meta: transformar la salida del calculo en experiencia entendible.

## Ola 5. Strangler, deploy y QA final

Meta: publicar sin riesgo y retirar drift.

## 4. Backlog detallado

## EPIC A. Recanonizacion del proyecto

### A-001 Definir la ruta publica canonica

Objetivo:

- cerrar si el producto final vive en `/` o en `/ui/`

Entregables:

- decision escrita en `PLAN_TECNICO_REDISENO_UI.md`
- decision reflejada en docs de deploy

Dependencias:

- ninguna

Criterios de aceptacion:

- existe una sola ruta publica oficial documentada
- se documenta tambien la ruta temporal de `ui-next`

### A-002 Definir la estrategia Strangler en produccion

Objetivo:

- cerrar el mecanismo tecnico real de convivencia entre UI actual y UI nueva

Entregables:

- decision operativa para Apache/Nginx o `public/index.php`
- matriz de routing para local, subpath y produccion

Dependencias:

- A-001

Criterios de aceptacion:

- hay una estrategia escrita para servir `ui-next` sin romper la UI actual
- la estrategia cubre shared hosting y subpath

### A-003 Auditar y etiquetar superficies legacy

Objetivo:

- separar lo soportado de lo heredado

Entregables:

- lista de rutas legacy
- lista de scripts legacy
- lista de tests legacy

Dependencias:

- ninguna

Criterios de aceptacion:

- cada superficie vieja queda clasificada como `legacy`, `retirar`, `aislar` o `mantener`

### A-004 Reescribir la historia oficial de deploy

Objetivo:

- eliminar el actual "split-brain" entre docs, zip y entrypoints

Entregables:

- nueva documentacion de deploy
- estrategia de empaquetado coherente

Dependencias:

- A-001
- A-002

Criterios de aceptacion:

- el paquete generado coincide con la estructura desplegable real
- las rutas documentadas son las que verdaderamente funcionan

## EPIC B. Schemas y modelo canonico

### B-001 Crear `CaseDraftSchema` con Zod

Objetivo:

- definir el modelo canonico de producto

Entregables:

- `frontend/src/entities/case-draft/schema.ts`
- tipos derivados con `z.infer`

Dependencias:

- A-001

Criterios de aceptacion:

- `CaseDraft` cubre causante, familia inmediata, descendencia, avanzados, patrimonio y preferencias UI
- el tipado TS sale directamente de Zod

### B-002 Crear `CalcPayloadSchema`

Objetivo:

- formalizar la forma exacta del payload que el frontend enviara al backend

Entregables:

- schema Zod del payload
- helpers de serializacion

Dependencias:

- B-001

Criterios de aceptacion:

- el payload esta tipado desde Zod
- el schema permite validar el resultado del mapper puro

### B-003 Crear `CalcResponseSchema`

Objetivo:

- formalizar la respuesta realmente soportada por la nueva UI

Entregables:

- schema Zod de respuesta
- normalizadores de campos opcionales

Dependencias:

- B-002

Criterios de aceptacion:

- la nueva UI puede parsear respuesta valida sin usar `any`
- quedan identificados los campos obligatorios para resultados V1

### B-004 Implementar mapper puro `CaseDraft -> CalcPayload`

Objetivo:

- desacoplar definitivamente la captura UX del payload de calculo

Entregables:

- modulo puro sin React
- tests unitarios

Dependencias:

- B-001
- B-002

Criterios de aceptacion:

- no depende de DOM
- no depende de fetch
- no depende de PHP
- toda salida queda validada por `CalcPayloadSchema`

### B-005 Implementar mapper puro `CalcResponse -> ResultsViewModel`

Objetivo:

- traducir la respuesta tecnica a un modelo presentacional estable

Entregables:

- modulo puro sin React
- tests unitarios

Dependencias:

- B-003

Criterios de aceptacion:

- el frontend de resultados no lee JSON bruto del backend directamente
- el view model ya separa resumen, reparto, explicacion y auditoria

### B-006 Crear fixtures compartidas de contrato

Objetivo:

- usar los mismos casos para validar mapper, frontend y backend

Entregables:

- carpeta de fixtures UI
- casos minimos, comunes y edge

Dependencias:

- B-004
- B-005

Criterios de aceptacion:

- existe al menos un fixture por flujo: minimo, conyuge+descendencia, abuelos, hermanos, caso con `awl`, caso con `radd`, caso con `asaba`

## EPIC C. Infraestructura frontend

### C-001 Inicializar workspace `frontend/`

Objetivo:

- crear la nueva aplicacion sin tocar aun `public/ui`

Entregables:

- Vite
- React
- TypeScript
- scripts de desarrollo y build

Dependencias:

- A-001

Criterios de aceptacion:

- la app arranca en local
- el build genera salida estaticamente deployable

### C-002 Configurar `strict mode`, lint y format

Objetivo:

- evitar deuda desde el arranque

Entregables:

- `tsconfig` estricto
- ESLint
- formatter

Dependencias:

- C-001

Criterios de aceptacion:

- el CI local falla si hay errores de tipo o lint

### C-003 Configurar testing frontend

Objetivo:

- dejar lista la base para unit tests y E2E

Entregables:

- Vitest
- Playwright
- scripts npm

Dependencias:

- C-001

Criterios de aceptacion:

- se puede correr unit y e2e desde el nuevo workspace

### C-004 Montar cliente API tipado

Objetivo:

- centralizar todas las llamadas al backend

Entregables:

- `calcClient`
- `catalogClient`
- parseo Zod de entrada y salida

Dependencias:

- B-002
- B-003
- C-001

Criterios de aceptacion:

- ningun componente React llama a `fetch` directo contra `calc.php`

### C-005 Definir estructura de carpetas real

Objetivo:

- evitar nueva deriva estructural

Entregables:

- layout real `app/pages/features/entities/shared`

Dependencias:

- C-001

Criterios de aceptacion:

- la estructura queda documentada y usada por el primer codigo real

## EPIC D. Design system y shell

### D-001 Definir tokens visuales

Objetivo:

- crear la base visual del producto

Entregables:

- colores
- spacing
- radios
- tipografia
- shadows
- focus states

Dependencias:

- C-001

Criterios de aceptacion:

- todos los componentes nuevos consumen tokens, no valores sueltos

### D-002 Crear primitives UI

Objetivo:

- construir una capa base reutilizable

Entregables:

- botones
- inputs
- number fields
- select
- badges
- cards
- alerts
- stepper
- drawer
- table responsiva

Dependencias:

- D-001

Criterios de aceptacion:

- las primitives ya soportan estado disabled, error, help y focus

### D-003 Crear shell de aplicacion

Objetivo:

- levantar la estructura principal del producto

Entregables:

- layout
- header
- footer
- contenedor de pagina
- enrutado base

Dependencias:

- D-001
- C-001

Criterios de aceptacion:

- existe una portada minima y un acceso claro al builder

### D-004 Definir estrategia i18n real

Objetivo:

- profesionalizar el contenido

Entregables:

- arquitectura de traducciones
- glosario base
- espanol e ingles V1

Dependencias:

- C-001

Criterios de aceptacion:

- ningun copy nuevo vive hardcodeado dentro de componentes

### D-005 Separar debug de experiencia principal

Objetivo:

- evitar contaminar la UI publica

Entregables:

- surface diagnostica separada
- flags dev o ruta protegida

Dependencias:

- D-003

Criterios de aceptacion:

- el usuario normal no ve payloads ni JSON bruto en la experiencia principal

## EPIC E. Builder guiado

### E-001 Implementar store del `CaseDraft`

Objetivo:

- centralizar el estado del builder

Entregables:

- reducer o store
- selectors
- acciones puras

Dependencias:

- B-001
- C-001

Criterios de aceptacion:

- todos los pasos leen y escriben `CaseDraft`

### E-002 Implementar paso "Causante y patrimonio"

Objetivo:

- capturar el contexto base del caso

Entregables:

- sexo
- escuela
- patrimonio
- moneda

Dependencias:

- E-001
- D-002

Criterios de aceptacion:

- guarda y valida sobre Zod

### E-003 Implementar paso "Familia inmediata"

Objetivo:

- conyuge y padres

Entregables:

- UI guiada
- ayudas contextuales

Dependencias:

- E-002

Criterios de aceptacion:

- el usuario no necesita saber los role IDs internos

### E-004 Implementar paso "Descendencia"

Objetivo:

- hijos e hijas

Entregables:

- UI clara
- hints de impacto

Dependencias:

- E-003

Criterios de aceptacion:

- el paso soporta flujo comun sin terminologia tecnica excesiva

### E-005 Implementar paso "Nietos por hijo"

Objetivo:

- modelar la condicion avanzada con claridad

Entregables:

- UI condicional
- ayuda contextual
- validacion coherente

Dependencias:

- E-004

Criterios de aceptacion:

- el usuario entiende por que aparece y cuando aplica

### E-006 Implementar paso "Hermanos"

Objetivo:

- capturar plenos, consanguineos y uterinos

Entregables:

- UI segmentada
- ayudas de lectura

Dependencias:

- E-005

Criterios de aceptacion:

- la carga cognitiva se mantiene controlada

### E-007 Implementar paso "Parientes avanzados"

Objetivo:

- encapsular lo menos frecuente

Entregables:

- abuelos
- abuelas
- tios y rama agnatica

Dependencias:

- E-006

Criterios de aceptacion:

- esta informacion no invade el flujo principal si no hace falta

### E-008 Implementar paso "Revision"

Objetivo:

- revisar antes de calcular

Entregables:

- resumen estructurado
- alertas de coherencia
- CTA de calcular

Dependencias:

- E-007
- B-004

Criterios de aceptacion:

- desde revision se puede ver el caso completo sin JSON

### E-009 Implementar modo experto

Objetivo:

- dar velocidad a usuarios avanzados sin romper el modelo canonico

Entregables:

- vista por roles
- sincronizacion bidireccional con `CaseDraft`

Dependencias:

- E-008

Criterios de aceptacion:

- el modo experto no crea un segundo estado paralelo

### E-010 Persistencia local del borrador

Objetivo:

- no perder trabajo del usuario

Entregables:

- autosave
- restore
- reset controlado

Dependencias:

- E-001

Criterios de aceptacion:

- el draft se restaura sin corromper el schema

## EPIC F. Resultados

### F-001 Implementar resumen ejecutivo de resultados

Objetivo:

- ofrecer la primera lectura del caso en segundos

Entregables:

- resumen
- tipo de resolucion del remanente
- estado general del calculo

Dependencias:

- B-005
- C-004

Criterios de aceptacion:

- el usuario entiende el resultado general sin bajar al detalle

### F-002 Implementar vista principal de reparto

Objetivo:

- mostrar la distribucion de forma clara y responsiva

Entregables:

- cards o tabla adaptativa
- fraccion grupal
- fraccion individual
- monto

Dependencias:

- F-001

Criterios de aceptacion:

- en movil la lectura sigue siendo clara

### F-003 Implementar vista de explicacion

Objetivo:

- hacer visible el razonamiento del motor

Entregables:

- fixed
- awl
- radd
- asaba
- orden narrativo claro

Dependencias:

- F-002

Criterios de aceptacion:

- el usuario puede seguir la historia del calculo sin leer trazas crudas

### F-004 Implementar bloque de exclusiones y warnings

Objetivo:

- convertir advertencias en informacion util

Entregables:

- warnings explicadas
- bloqueos y afectados

Dependencias:

- F-002

Criterios de aceptacion:

- los bloqueos no aparecen mezclados caoticamente con el reparto principal

### F-005 Implementar auditoria tecnica separada

Objetivo:

- dar profundidad sin contaminar la experiencia principal

Entregables:

- drawer, tab o pagina tecnica
- payload
- response
- ledger
- JSON

Dependencias:

- F-003

Criterios de aceptacion:

- soporte y usuarios avanzados pueden auditar sin exponer esto a todos

## EPIC G. Strangler y capa publica

### G-001 Publicar `ui-next` en paralelo

Objetivo:

- poner en marcha la nueva app sin sustituir aun la actual

Entregables:

- salida build en `public/ui-next/`
- acceso estable en local y subpath

Dependencias:

- C-001
- D-003

Criterios de aceptacion:

- la nueva UI abre en una ruta separada sin romper la actual

### G-002 Resolver routing real de produccion

Objetivo:

- aplicar el Strangler elegido

Entregables:

- configuracion Apache/Nginx o `public/index.php`
- fallback y redirects

Dependencias:

- A-002
- G-001

Criterios de aceptacion:

- la UI nueva se puede activar o desactivar con riesgo minimo

### G-003 Rehacer el entrypoint publico

Objetivo:

- eliminar el estado roto de `public/index.php`

Entregables:

- loader o redirect canonico funcional

Dependencias:

- G-002

Criterios de aceptacion:

- el entrypoint que reciba el usuario siempre carga algo valido

### G-004 Rehacer `make_public_zip.py`

Objetivo:

- empaquetar exactamente el producto desplegable

Entregables:

- script actualizado
- prueba de smoke del zip

Dependencias:

- A-004
- G-003

Criterios de aceptacion:

- el zip generado reproduce la estructura real esperada en produccion

## EPIC H. QA y endurecimiento

### H-001 Unit tests de schemas y mapeadores

Objetivo:

- blindar el nucleo del nuevo enfoque

Entregables:

- suite Vitest

Dependencias:

- B-004
- B-005

Criterios de aceptacion:

- los mapeadores se prueban sin React y sin servidor

### H-002 Contract tests contra `calc.php`

Objetivo:

- validar que frontend y backend siguen hablando el mismo idioma

Entregables:

- tests de contrato
- fixtures versionadas

Dependencias:

- B-003
- C-004

Criterios de aceptacion:

- los cambios de contrato se detectan antes de UI/E2E

### H-003 E2E de la UI real

Objetivo:

- dejar de validar pantallas fantasma

Entregables:

- suite Playwright sobre `ui-next`

Dependencias:

- E-008
- F-003

Criterios de aceptacion:

- happy path, errores, responsive y subpath quedan cubiertos

### H-004 QA de accesibilidad

Objetivo:

- elevar calidad real

Entregables:

- checklist a11y
- correcciones de foco, labels, contraste y semantica

Dependencias:

- D-002
- E-008
- F-002

Criterios de aceptacion:

- la UI pasa un baseline razonable de accesibilidad

### H-005 QA de deploy empaquetado

Objetivo:

- verificar la app publicada de verdad

Entregables:

- smoke del paquete desplegado

Dependencias:

- G-004

Criterios de aceptacion:

- el paquete final funciona en la topologia prevista

## EPIC I. Limpieza final

### I-001 Retirar o archivar tests obsoletos

Objetivo:

- eliminar cobertura falsa

Entregables:

- limpieza de suites legacy

Dependencias:

- H-003

Criterios de aceptacion:

- solo queda una suite oficial de UI activa

### I-002 Actualizar docs oficiales

Objetivo:

- alinear el repo con la realidad final

Entregables:

- README
- README_DEV
- deploy
- QA

Dependencias:

- G-004
- H-003

Criterios de aceptacion:

- docs, rutas, build y QA cuentan la misma historia

### I-003 Promover `ui-next` a `ui`

Objetivo:

- completar la migracion

Entregables:

- nueva UI como superficie principal

Dependencias:

- H-003
- H-005
- I-002

Criterios de aceptacion:

- el usuario final ya entra por la nueva UI sin rutas ambiguas

## 5. Corte sugerido por PRs

Para trabajar de forma controlada, recomiendo este orden de PRs:

1. PR-01: canon de rutas y decision Strangler
2. PR-02: workspace `frontend/` + toolchain
3. PR-03: schemas Zod + tipos TS
4. PR-04: mapeador puro `CaseDraft -> CalcPayload`
5. PR-05: mapeador puro `CalcResponse -> ResultsViewModel`
6. PR-06: cliente API tipado + fixtures de contrato
7. PR-07: shell + design tokens + primitives
8. PR-08: builder pasos 1-3
9. PR-09: builder pasos 4-7 + revision
10. PR-10: modo experto + persistencia local
11. PR-11: resultados resumen + reparto
12. PR-12: explicacion + auditoria separada
13. PR-13: `ui-next` publica + routing real
14. PR-14: deploy package + smoke empaquetado
15. PR-15: limpieza de legacy QA/docs y promocion final

## 6. No entra en la primera ronda

Para no desbordar V1, recomiendo dejar fuera de la primera ronda:

- editor genealogico complejo
- cuentas de usuario
- persistencia en base de datos de casos UI
- exportaciones avanzadas
- comparador de escenarios multi-caso
- analytics pesada

## 7. Luz verde tecnica

Este backlog ya esta en un nivel suficiente para empezar a implementar por orden.

Si seguimos de forma disciplinada, yo empezaria por:

- A-001
- A-002
- B-001
- B-002
- C-001

Ese bloque ya nos permite arrancar el esqueleto correcto sin improvisar.
