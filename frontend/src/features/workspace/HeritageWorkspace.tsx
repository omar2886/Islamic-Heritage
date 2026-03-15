import { startTransition, useEffect, useState } from 'react'
import { createInitialDraft } from '../../entities/case-draft/createInitialDraft'
import { mapDraftToPayload } from '../../entities/case-draft/mappers/draftToPayload'
import {
  caseDraftSchema,
  type CaseDraft,
  type CausanteDraft,
  type DescendantsDraft,
  type ExtendedFamilyDraft,
  type ImmediateFamilyDraft,
  type PreferencesDraft,
} from '../../entities/case-draft/schema'
import { calcPayloadSchema } from '../../entities/calculation/schema'
import type {
  ResultsViewModel,
  ShareViewModel,
} from '../../entities/calculation/mappers/responseToViewModel'
import {
  CalculationClientError,
  calculateInheritance,
} from '../../shared/api/calcClient'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import {
  buildCaseOverview,
  buildResultsNarrative,
  fractionToPercentLabel,
  fractionToRatioValue,
  formatMoney,
  humanizeRole,
  sortSharesForDisplay,
  summarizeHeirs,
  type CaseOverview,
} from './presentation'
import { draftPresets, type DraftPreset } from './presets'
import { buildPlainTextReport } from './reporting'
import {
  clearWorkspaceState,
  persistWorkspaceState,
  restoreWorkspaceState,
} from './storage'

type StepId = 'profile' | 'closest-family' | 'extended-family' | 'review'

interface StepDefinition {
  id: StepId
  index: string
  title: string
  description: string
}

const steps: StepDefinition[] = [
  {
    id: 'profile',
    index: '01',
    title: 'Perfil del caso',
    description: 'Sexo del finado, valor de la herencia y nivel de profundidad.',
  },
  {
    id: 'closest-family',
    index: '02',
    title: 'Nucleo cercano',
    description: 'Conyuge, padres, hijos y nietos por hijo.',
  },
  {
    id: 'extended-family',
    index: '03',
    title: 'Familia extendida',
    description: 'Hermanos, abuelos y rama agnatica si hace falta.',
  },
  {
    id: 'review',
    index: '04',
    title: 'Revision y calculo',
    description: 'Comprobacion final, payload tecnico y reparto explicado.',
  },
]

const currencyOptions = ['', 'MAD', 'EUR', 'USD', 'SAR', 'AED']

const closeFamilyRoles = new Set([
  'husband',
  'wife',
  'father',
  'mother',
  'son',
  'daughter',
  'sons_son',
  'sons_daughter',
])

function sanitizeCount(value: string, max = 100): number {
  if (value.trim() === '') return 0

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0

  return Math.min(Math.trunc(parsed), max)
}

function sanitizeEstateValue(value: string): number | undefined {
  if (value.trim() === '') return undefined

  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined

  return parsed
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages.filter((message) => message.trim() !== ''))]
}

function isExtendedRole(role: string): boolean {
  return !closeFamilyRoles.has(role)
}

export function HeritageWorkspace() {
  const [draft, setDraft] = useState(
    () => restoreWorkspaceState()?.draft ?? createInitialDraft(),
  )
  const [currentStep, setCurrentStep] = useState<StepId>(
    () => restoreWorkspaceState()?.step ?? 'profile',
  )
  const [results, setResults] = useState<ResultsViewModel | null>(null)
  const [rawOutput, setRawOutput] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [lastCalculatedPayloadKey, setLastCalculatedPayloadKey] = useState<
    string | null
  >(null)
  const [isCalculating, setIsCalculating] = useState(false)

  const draftValidation = caseDraftSchema.safeParse(draft)
  const payloadPreview = mapDraftToPayload(draft)
  const payloadValidation = calcPayloadSchema.safeParse(payloadPreview)
  const payloadKey = JSON.stringify(payloadPreview)
  const caseOverview = buildCaseOverview(draft, payloadPreview)

  const currentStepIndex = steps.findIndex((step) => step.id === currentStep)
  const currentStepMeta = steps[currentStepIndex]
  const declaredGroups = payloadPreview.heirs.length
  const declaredPeople = payloadPreview.heirs.reduce(
    (total, heir) => total + heir.count,
    0,
  )
  const closeFamilyCount = payloadPreview.heirs
    .filter((heir) => closeFamilyRoles.has(heir.role))
    .reduce((total, heir) => total + heir.count, 0)
  const extendedFamilyCount = payloadPreview.heirs
    .filter((heir) => isExtendedRole(heir.role))
    .reduce((total, heir) => total + heir.count, 0)

  const draftIssues = draftValidation.success
    ? []
    : draftValidation.error.issues.map((issue) => issue.message)
  const payloadIssues = payloadValidation.success
    ? []
    : payloadValidation.error.issues.map((issue) => issue.message)
  const issues = uniqueMessages([...draftIssues, ...payloadIssues])
  const canCalculate = draftValidation.success && payloadValidation.success
  const isResultsStale =
    lastCalculatedPayloadKey !== null && lastCalculatedPayloadKey !== payloadKey

  useEffect(() => {
    persistWorkspaceState({
      draft,
      step: currentStep,
    })
  }, [currentStep, draft])

  function mutateDraft(transform: (current: CaseDraft) => CaseDraft) {
    setServerError(null)
    setDraft((current) => caseDraftSchema.parse(transform(current)))
  }

  function updateCausante<Key extends keyof CausanteDraft>(
    key: Key,
    value: CausanteDraft[Key],
  ) {
    mutateDraft((current) => ({
      ...current,
      causante: {
        ...current.causante,
        [key]: value,
      },
    }))
  }

  function updateImmediateFamily<Key extends keyof ImmediateFamilyDraft>(
    key: Key,
    value: ImmediateFamilyDraft[Key],
  ) {
    mutateDraft((current) => ({
      ...current,
      immediateFamily: {
        ...current.immediateFamily,
        [key]: value,
      },
    }))
  }

  function updateDescendants<Key extends keyof DescendantsDraft>(
    key: Key,
    value: DescendantsDraft[Key],
  ) {
    mutateDraft((current) => ({
      ...current,
      descendants: {
        ...current.descendants,
        [key]: value,
      },
    }))
  }

  function updateExtendedFamily<Key extends keyof ExtendedFamilyDraft>(
    key: Key,
    value: ExtendedFamilyDraft[Key],
  ) {
    mutateDraft((current) => ({
      ...current,
      extendedFamily: {
        ...current.extendedFamily,
        [key]: value,
      },
    }))
  }

  function updatePreferences<Key extends keyof PreferencesDraft>(
    key: Key,
    value: PreferencesDraft[Key],
  ) {
    mutateDraft((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        [key]: value,
      },
    }))
  }

  function handleSexChange(sex: 'male' | 'female') {
    mutateDraft((current) => ({
      ...current,
      causante: {
        ...current.causante,
        sex,
      },
      immediateFamily: {
        ...current.immediateFamily,
        hasHusband: sex === 'female' ? current.immediateFamily.hasHusband : false,
        numberOfWives:
          sex === 'male' ? current.immediateFamily.numberOfWives : 0,
      },
    }))
  }

  function handleGrandchildChange(
    key: 'grandsons' | 'granddaughters',
    value: number,
  ) {
    mutateDraft((current) => {
      const nextDescendants = {
        ...current.descendants,
        [key]: value,
      }

      const hasGrandchildren =
        nextDescendants.grandsons > 0 || nextDescendants.granddaughters > 0

      return {
        ...current,
        descendants: {
          ...nextDescendants,
          hasDeceasedSon: hasGrandchildren ? true : nextDescendants.hasDeceasedSon,
        },
      }
    })
  }

  function handleDeceasedSonToggle(checked: boolean) {
    mutateDraft((current) => ({
      ...current,
      descendants: {
        ...current.descendants,
        hasDeceasedSon: checked,
        grandsons: checked ? current.descendants.grandsons : 0,
        granddaughters: checked ? current.descendants.granddaughters : 0,
      },
    }))
  }

  function goToStep(stepId: StepId) {
    setCurrentStep(stepId)
  }

  function goToNextStep() {
    const nextStep = steps[currentStepIndex + 1]
    if (nextStep) setCurrentStep(nextStep.id)
  }

  function goToPreviousStep() {
    const previousStep = steps[currentStepIndex - 1]
    if (previousStep) setCurrentStep(previousStep.id)
  }

  function resetWorkspace() {
    setDraft(createInitialDraft())
    setCurrentStep('profile')
    setResults(null)
    setRawOutput(null)
    setServerError(null)
    setLastCalculatedPayloadKey(null)
    clearWorkspaceState()
  }

  function loadPreset(preset: DraftPreset) {
    setDraft(preset.draft)
    setCurrentStep('review')
    setResults(null)
    setRawOutput(null)
    setServerError(null)
    setLastCalculatedPayloadKey(null)
  }

  async function handleCalculate() {
    if (!canCalculate) {
      setCurrentStep('review')
      return
    }

    setIsCalculating(true)
    setServerError(null)

    try {
      const calculation = await calculateInheritance(draft)

      startTransition(() => {
        setResults(calculation.viewModel)
        setRawOutput(JSON.stringify(calculation.rawOutput, null, 2))
        setLastCalculatedPayloadKey(JSON.stringify(calculation.payload))
        setCurrentStep('review')
      })
    } catch (error) {
      if (error instanceof CalculationClientError) {
        setServerError(error.message)
      } else {
        setServerError('No se ha podido calcular el reparto en este momento.')
      }
    } finally {
      setIsCalculating(false)
    }
  }

  return (
    <section className="workspaceSection" id="builder">
      <div className="workspace">
        <aside className="workspaceSidebar">
          <div className="workspacePanel workspacePanel--sidebar">
            <div className="workspaceSidebar__header">
              <p className="workspaceEyebrow">Builder beta</p>
              <h2 className="workspaceSidebar__title">Captura guiada del caso</h2>
              <p className="workspaceSidebar__body">
                La captura ya esta organizada por cercania familiar y preparada
                para hablar con el motor real sin exponer al usuario al payload
                tecnico.
              </p>
            </div>

            <nav className="stepNav" aria-label="Pasos del builder">
              {steps.map((step) => (
                <button
                  className={`stepNav__button ${
                    currentStep === step.id ? 'stepNav__button--active' : ''
                  }`.trim()}
                  key={step.id}
                  onClick={() => goToStep(step.id)}
                  type="button"
                >
                  <span className="stepNav__index">{step.index}</span>
                  <span className="stepNav__copy">
                    <span className="stepNav__title">{step.title}</span>
                    <span className="stepNav__summary">
                      {step.id === 'profile' &&
                        `${draft.causante.sex === 'male' ? 'Finado varon' : 'Finada mujer'}${
                          draft.causante.currency
                            ? ` · ${draft.causante.currency}`
                            : ''
                        }`}
                      {step.id === 'closest-family' &&
                        `${closeFamilyCount} familiares directos declarados`}
                      {step.id === 'extended-family' &&
                        `${extendedFamilyCount} familiares extendidos declarados`}
                      {step.id === 'review' &&
                        (canCalculate
                          ? 'Caso listo para calcular'
                          : issues[0] ?? 'Revisar datos del caso')}
                    </span>
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="workspacePanel workspacePanel--sidebar">
            <p className="workspaceEyebrow">Resumen vivo</p>
            <div className="summaryStats">
              <div className="summaryStat">
                <span className="summaryStat__value">{declaredGroups}</span>
                <span className="summaryStat__label">Grupos</span>
              </div>
              <div className="summaryStat">
                <span className="summaryStat__value">{declaredPeople}</span>
                <span className="summaryStat__label">Personas</span>
              </div>
              <div className="summaryStat">
                <span className="summaryStat__value">
                  {draft.causante.estateValue ?? '...'}
                </span>
                <span className="summaryStat__label">Masa</span>
              </div>
            </div>

            <div className="sidebarStack">
              <div className="miniPanel">
                <p className="miniPanel__title">Casos demo</p>
                <div className="presetList">
                  {draftPresets.map((preset) => (
                    <article className="presetCard" key={preset.id}>
                      <div>
                        <p className="presetCard__title">{preset.title}</p>
                        <p className="presetCard__body">{preset.description}</p>
                      </div>
                      <Button
                        className="presetCard__action"
                        onClick={() => loadPreset(preset)}
                        variant="secondary"
                      >
                        Cargar
                      </Button>
                    </article>
                  ))}
                </div>
              </div>

              <div className="miniPanel">
                <p className="miniPanel__title">Lectura del caso</p>
                <p className="miniPanel__body">{caseOverview.summary}</p>
                <div className="badgeRow">
                  {caseOverview.badges.map((badge) => (
                    <Badge key={badge}>{badge}</Badge>
                  ))}
                </div>
                <p className="miniPanel__body miniPanel__body--compact">
                  {summarizeHeirs(payloadPreview.heirs)}
                </p>
              </div>

              <div className="miniPanel">
                <p className="miniPanel__title">Modo de trabajo</p>
                <div className="badgeRow">
                  <Badge tone="accent">Maliki</Badge>
                  <Badge>
                    {draft.preferences.expertMode ? 'Modo experto' : 'Modo guiado'}
                  </Badge>
                  <Badge tone={canCalculate ? 'success' : 'default'}>
                    {canCalculate ? 'Listo para calcular' : 'Pendiente'}
                  </Badge>
                  <Badge>Guardado local</Badge>
                </div>
              </div>

              {isResultsStale && (
                <div className="alert alert--warning">
                  Has cambiado el caso despues del ultimo calculo. Conviene volver
                  a calcular antes de validar el resultado.
                </div>
              )}

              {results && !isResultsStale && (
                <div className="alert alert--success">
                  Hay un resultado reciente asociado al estado actual del caso.
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="workspaceMain">
          <div className="workspacePanel">
            <header className="workspaceHeader">
              <div>
                <p className="workspaceEyebrow">{currentStepMeta.index}</p>
                <h2 className="workspaceHeader__title">{currentStepMeta.title}</h2>
                <p className="workspaceHeader__body">
                  {currentStepMeta.description}
                </p>
              </div>

              <div className="workspaceHeader__actions">
                <Button onClick={resetWorkspace} variant="ghost">
                  Reiniciar caso
                </Button>
              </div>
            </header>

            {currentStep === 'profile' && (
              <div className="workspaceStack">
                <div className="formGrid formGrid--two">
                  <section className="panelCard panelCard--highlight">
                    <p className="panelCard__eyebrow">Identidad base</p>
                    <h3 className="panelCard__title">Contexto del causante</h3>
                    <p className="panelCard__body">
                      Este primer bloque fija el tono del caso y limpia las
                      opciones incompatibles de conyuge.
                    </p>

                    <div className="fieldGrid">
                      <SelectField
                        hint="Define si el caso debe ofrecer esposo o esposas."
                        label="Sexo del finado"
                        onChange={(value) =>
                          handleSexChange(value as CausanteDraft['sex'])
                        }
                        options={[
                          { label: 'Varon', value: 'male' },
                          { label: 'Mujer', value: 'female' },
                        ]}
                        value={draft.causante.sex}
                      />
                    </div>
                  </section>

                  <section className="panelCard">
                    <p className="panelCard__eyebrow">Masa hereditaria</p>
                    <h3 className="panelCard__title">Valor y moneda</h3>
                    <p className="panelCard__body">
                      Son opcionales para explorar el caso, pero si los rellenas
                      la beta ya puede mostrar importes reales por grupo.
                    </p>

                    <div className="fieldGrid">
                      <TextField
                        hint="Puedes dejarlo vacio y centrarte primero en las fracciones."
                        inputMode="decimal"
                        label="Valor estimado de la herencia"
                        onChange={(value) =>
                          updateCausante('estateValue', sanitizeEstateValue(value))
                        }
                        placeholder="250000"
                        value={
                          draft.causante.estateValue === undefined
                            ? ''
                            : String(draft.causante.estateValue)
                        }
                      />

                      <SelectField
                        hint="La API exige un codigo ISO de tres letras."
                        label="Moneda"
                        onChange={(value) =>
                          updateCausante(
                            'currency',
                            value === '' ? undefined : value.toUpperCase(),
                          )
                        }
                        options={currencyOptions.map((currency) => ({
                          label: currency === '' ? 'Sin moneda aun' : currency,
                          value: currency,
                        }))}
                        value={draft.causante.currency ?? ''}
                      />
                    </div>
                  </section>
                </div>

                <section className="panelCard">
                  <p className="panelCard__eyebrow">Profundidad de la UI</p>
                  <h3 className="panelCard__title">Modo de captura</h3>
                  <div className="toggleStack">
                    <ToggleField
                      checked={draft.preferences.expertMode}
                      hint="Activa ramas agnaticas avanzadas y la vista tecnica del payload."
                      label="Mostrar campos avanzados y diagnostico tecnico"
                      onChange={(checked) =>
                        updatePreferences('expertMode', checked)
                      }
                    />
                  </div>
                </section>
              </div>
            )}

            {currentStep === 'closest-family' && (
              <div className="workspaceStack">
                <div className="formGrid formGrid--two">
                  <section className="panelCard panelCard--highlight">
                    <p className="panelCard__eyebrow">Conyuge y ascendientes</p>
                    <h3 className="panelCard__title">Familia inmediata</h3>
                    <p className="panelCard__body">
                      Este bloque recoge a quien normalmente determina antes el
                      reparto: conyuge, padre y madre.
                    </p>

                    <div className="fieldGrid">
                      {draft.causante.sex === 'female' ? (
                        <ToggleField
                          checked={draft.immediateFamily.hasHusband}
                          hint="En un caso femenino solo puede declararse un esposo."
                          label="Existe esposo superviviente"
                          onChange={(checked) =>
                            updateImmediateFamily('hasHusband', checked)
                          }
                        />
                      ) : (
                        <CounterField
                          hint="El limite se restringe a cuatro esposas."
                          label="Numero de esposas supervivientes"
                          max={4}
                          onChange={(value) =>
                            updateImmediateFamily('numberOfWives', value)
                          }
                          value={draft.immediateFamily.numberOfWives}
                        />
                      )}

                      <ToggleField
                        checked={draft.immediateFamily.hasFather}
                        hint="Padre superviviente del causante."
                        label="Padre vivo"
                        onChange={(checked) =>
                          updateImmediateFamily('hasFather', checked)
                        }
                      />

                      <ToggleField
                        checked={draft.immediateFamily.hasMother}
                        hint="Madre superviviente del causante."
                        label="Madre viva"
                        onChange={(checked) =>
                          updateImmediateFamily('hasMother', checked)
                        }
                      />
                    </div>
                  </section>

                  <section className="panelCard">
                    <p className="panelCard__eyebrow">Descendencia</p>
                    <h3 className="panelCard__title">Hijos y nietos por hijo</h3>
                    <p className="panelCard__body">
                      La UI fuerza consistencia: si declaras nietos por hijo,
                      marca automaticamente que existe un hijo fallecido.
                    </p>

                    <div className="fieldGrid">
                      <CounterField
                        hint="Numero de hijos varones."
                        label="Hijos"
                        onChange={(value) => updateDescendants('sons', value)}
                        value={draft.descendants.sons}
                      />

                      <CounterField
                        hint="Numero de hijas."
                        label="Hijas"
                        onChange={(value) =>
                          updateDescendants('daughters', value)
                        }
                        value={draft.descendants.daughters}
                      />

                      <ToggleField
                        checked={draft.descendants.hasDeceasedSon}
                        hint="Necesario para habilitar nietos por hijo."
                        label="Existe al menos un hijo fallecido con descendencia"
                        onChange={(checked) => handleDeceasedSonToggle(checked)}
                      />

                      <CounterField
                        disabled={!draft.descendants.hasDeceasedSon}
                        hint="Solo aplicable cuando hay un hijo fallecido."
                        label="Nietos por hijo"
                        onChange={(value) => handleGrandchildChange('grandsons', value)}
                        value={draft.descendants.grandsons}
                      />

                      <CounterField
                        disabled={!draft.descendants.hasDeceasedSon}
                        hint="Solo aplicable cuando hay un hijo fallecido."
                        label="Nietas por hijo"
                        onChange={(value) =>
                          handleGrandchildChange('granddaughters', value)
                        }
                        value={draft.descendants.granddaughters}
                      />
                    </div>
                  </section>
                </div>
              </div>
            )}

            {currentStep === 'extended-family' && (
              <div className="workspaceStack">
                <div className="formGrid formGrid--two">
                  <section className="panelCard panelCard--highlight">
                    <p className="panelCard__eyebrow">Colaterales</p>
                    <h3 className="panelCard__title">Hermanos y hermanas</h3>
                    <p className="panelCard__body">
                      Agrupados por linea familiar para que el usuario no tenga
                      que pensar en roles tecnicos del motor.
                    </p>

                    <div className="fieldGrid">
                      <CounterField
                        label="Hermanos completos"
                        onChange={(value) =>
                          updateExtendedFamily('fullBrothers', value)
                        }
                        value={draft.extendedFamily.fullBrothers}
                      />
                      <CounterField
                        label="Hermanas completas"
                        onChange={(value) =>
                          updateExtendedFamily('fullSisters', value)
                        }
                        value={draft.extendedFamily.fullSisters}
                      />
                      <CounterField
                        label="Hermanos paternos"
                        onChange={(value) =>
                          updateExtendedFamily('paternalBrothers', value)
                        }
                        value={draft.extendedFamily.paternalBrothers}
                      />
                      <CounterField
                        label="Hermanas paternas"
                        onChange={(value) =>
                          updateExtendedFamily('paternalSisters', value)
                        }
                        value={draft.extendedFamily.paternalSisters}
                      />
                      <CounterField
                        label="Hermanos maternos"
                        onChange={(value) =>
                          updateExtendedFamily('maternalBrothers', value)
                        }
                        value={draft.extendedFamily.maternalBrothers}
                      />
                      <CounterField
                        label="Hermanas maternas"
                        onChange={(value) =>
                          updateExtendedFamily('maternalSisters', value)
                        }
                        value={draft.extendedFamily.maternalSisters}
                      />
                    </div>
                  </section>

                  <section className="panelCard">
                    <p className="panelCard__eyebrow">Ascendientes lejanos</p>
                    <h3 className="panelCard__title">Abuelos y abuelas</h3>
                    <p className="panelCard__body">
                      Esta vista permite declarar de forma limpia las ramas
                      ascendientes que siguen entrando en juego.
                    </p>

                    <div className="fieldGrid">
                      <ToggleField
                        checked={draft.extendedFamily.hasPaternalGrandfather}
                        label="Abuelo paterno"
                        onChange={(checked) =>
                          updateExtendedFamily('hasPaternalGrandfather', checked)
                        }
                      />
                      <ToggleField
                        checked={draft.extendedFamily.hasPaternalGrandmother}
                        label="Abuela paterna"
                        onChange={(checked) =>
                          updateExtendedFamily('hasPaternalGrandmother', checked)
                        }
                      />
                      <ToggleField
                        checked={draft.extendedFamily.hasMaternalGrandmother}
                        label="Abuela materna"
                        onChange={(checked) =>
                          updateExtendedFamily('hasMaternalGrandmother', checked)
                        }
                      />
                      <ToggleField
                        checked={draft.extendedFamily.hasPaternalGreatGrandmother}
                        label="Bisabuela paterna"
                        onChange={(checked) =>
                          updateExtendedFamily(
                            'hasPaternalGreatGrandmother',
                            checked,
                          )
                        }
                      />
                      <ToggleField
                        checked={draft.extendedFamily.hasMaternalGreatGrandmother}
                        label="Bisabuela materna"
                        onChange={(checked) =>
                          updateExtendedFamily(
                            'hasMaternalGreatGrandmother',
                            checked,
                          )
                        }
                      />
                    </div>
                  </section>
                </div>

                <section className="panelCard">
                  <p className="panelCard__eyebrow">Rama agnatica</p>
                  <h3 className="panelCard__title">Tios y descendencia agnatica</h3>
                  {!draft.preferences.expertMode ? (
                    <div className="teaserCard">
                      <p className="teaserCard__body">
                        Este bloque queda recogido para el modo experto, de modo
                        que la ruta principal siga siendo limpia para la mayoria de
                        casos.
                      </p>
                      <Button
                        onClick={() => updatePreferences('expertMode', true)}
                        variant="secondary"
                      >
                        Activar modo experto
                      </Button>
                    </div>
                  ) : (
                    <div className="fieldGrid fieldGrid--wide">
                      <CounterField
                        label="Tios paternos"
                        onChange={(value) =>
                          updateExtendedFamily('paternalUncles', value)
                        }
                        value={draft.extendedFamily.paternalUncles}
                      />
                      <CounterField
                        label="Tios paternos consanguineos"
                        onChange={(value) =>
                          updateExtendedFamily(
                            'paternalConsanguineUncles',
                            value,
                          )
                        }
                        value={draft.extendedFamily.paternalConsanguineUncles}
                      />
                      <CounterField
                        label="Hijos de tio paterno"
                        onChange={(value) =>
                          updateExtendedFamily('paternalUncleSons', value)
                        }
                        value={draft.extendedFamily.paternalUncleSons}
                      />
                      <CounterField
                        label="Hijos de tio paterno consanguineo"
                        onChange={(value) =>
                          updateExtendedFamily(
                            'paternalConsanguineUncleSons',
                            value,
                          )
                        }
                        value={draft.extendedFamily.paternalConsanguineUncleSons}
                      />
                      <CounterField
                        label="Hijas de tio paterno"
                        onChange={(value) =>
                          updateExtendedFamily('paternalUnclesDaughters', value)
                        }
                        value={draft.extendedFamily.paternalUnclesDaughters}
                      />
                      <CounterField
                        label="Hijas de tio paterno consanguineo"
                        onChange={(value) =>
                          updateExtendedFamily(
                            'paternalConsanguineUnclesDaughters',
                            value,
                          )
                        }
                        value={
                          draft.extendedFamily.paternalConsanguineUnclesDaughters
                        }
                      />
                      <CounterField
                        label="Hijas de hijo de tio paterno"
                        onChange={(value) =>
                          updateExtendedFamily(
                            'paternalUncleSonsDaughters',
                            value,
                          )
                        }
                        value={draft.extendedFamily.paternalUncleSonsDaughters}
                      />
                      <CounterField
                        label="Hijas de hijo de tio paterno consanguineo"
                        onChange={(value) =>
                          updateExtendedFamily(
                            'paternalConsanguineUncleSonsDaughters',
                            value,
                          )
                        }
                        value={
                          draft.extendedFamily
                            .paternalConsanguineUncleSonsDaughters
                        }
                      />
                    </div>
                  )}
                </section>
              </div>
            )}

            {currentStep === 'review' && (
              <div className="workspaceStack">
                <div className="reviewGrid">
                  <section className="panelCard panelCard--highlight">
                    <p className="panelCard__eyebrow">Estado del caso</p>
                    <h3 className="panelCard__title">Preparado para calcular</h3>

                    {issues.length === 0 ? (
                      <div className="alert alert--success">
                        El caso pasa la validacion del draft y del contrato
                        tecnico. Ya podemos enviar el payload al backend.
                      </div>
                    ) : (
                      <div className="alert alert--warning">
                        Conviene corregir los puntos siguientes antes de calcular.
                      </div>
                    )}

                    {issues.length > 0 && (
                      <ul className="issueList">
                        {issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    )}

                    <div className="reviewMetrics">
                      <MetricCard
                        label="Grupos declarados"
                        value={String(declaredGroups)}
                      />
                      <MetricCard
                        label="Personas declaradas"
                        value={String(declaredPeople)}
                      />
                      <MetricCard
                        label="Masa"
                        value={
                          draft.causante.estateValue === undefined
                            ? 'Sin valor'
                            : `${draft.causante.estateValue}${
                                draft.causante.currency
                                  ? ` ${draft.causante.currency}`
                                  : ''
                              }`
                        }
                      />
                    </div>
                  </section>

                  <section className="panelCard">
                    <p className="panelCard__eyebrow">Lectura funcional</p>
                    <h3 className="panelCard__title">
                      Como entiende el builder este caso
                    </h3>
                    <p className="panelCard__body">{caseOverview.summary}</p>
                    <div className="badgeRow">
                      {caseOverview.badges.map((badge) => (
                        <Badge key={badge}>{badge}</Badge>
                      ))}
                    </div>
                    <ul className="readingList">
                      {caseOverview.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  </section>
                </div>

                <section className="panelCard">
                  <p className="panelCard__eyebrow">Preview tecnico</p>
                  <h3 className="panelCard__title">Payload resumido</h3>
                  {payloadPreview.heirs.length === 0 ? (
                    <p className="emptyState">
                      Anade al menos un heredero para que la API acepte el caso.
                    </p>
                  ) : (
                    <div className="payloadList">
                      {payloadPreview.heirs.map((heir) => (
                        <article className="payloadList__item" key={heir.role}>
                          <div>
                            <p className="payloadList__title">
                              {humanizeRole(heir.role)}
                            </p>
                            <p className="payloadList__body">
                              {heir.count} persona{heir.count === 1 ? '' : 's'}
                            </p>
                          </div>
                          <Badge>{heir.role}</Badge>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {serverError && <div className="alert alert--error">{serverError}</div>}

                <section className="panelCard panelCard--actions">
                  <div>
                    <p className="panelCard__eyebrow">Accion principal</p>
                    <h3 className="panelCard__title">Calcular reparto</h3>
                    <p className="panelCard__body">
                      Esta beta ya envia el payload real a <code>calc.php</code>,
                      valida la respuesta y la transforma a un modelo listo para UI.
                    </p>
                  </div>

                  <div className="buttonRow">
                    <Button
                      disabled={!canCalculate || isCalculating}
                      onClick={() => void handleCalculate()}
                    >
                      {isCalculating ? 'Calculando...' : 'Calcular reparto'}
                    </Button>
                  </div>
                </section>

                {draft.preferences.expertMode && (
                  <details className="codePanel">
                    <summary>Ver payload tecnico</summary>
                    <pre>{JSON.stringify(payloadPreview, null, 2)}</pre>
                  </details>
                )}

                {results && (
                  <ResultsPanel
                    caseOverview={caseOverview}
                    isStale={isResultsStale}
                    rawOutput={draft.preferences.expertMode ? rawOutput : null}
                    results={results}
                  />
                )}
              </div>
            )}

            <footer className="builderFooter">
              <div className="builderFooter__meta">
                <span>
                  Paso {currentStepIndex + 1} de {steps.length}
                </span>
                <span>{currentStepMeta.description}</span>
              </div>

              <div className="buttonRow">
                <Button
                  disabled={currentStepIndex === 0}
                  onClick={goToPreviousStep}
                  variant="ghost"
                >
                  Paso anterior
                </Button>

                {currentStep !== 'review' ? (
                  <Button onClick={goToNextStep} variant="secondary">
                    Continuar
                  </Button>
                ) : (
                  <Button
                    disabled={!canCalculate || isCalculating}
                    onClick={() => void handleCalculate()}
                  >
                    {isCalculating ? 'Calculando...' : 'Recalcular'}
                  </Button>
                )}
              </div>
            </footer>
          </div>
        </div>
      </div>
    </section>
  )
}

interface SelectFieldProps {
  hint?: string
  label: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value: string
}

function SelectField({
  hint,
  label,
  onChange,
  options,
  value,
}: SelectFieldProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {hint && <span className="field__hint">{hint}</span>}
      <select
        className="field__control"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface TextFieldProps {
  hint?: string
  inputMode?: 'text' | 'decimal'
  label: string
  onChange: (value: string) => void
  placeholder?: string
  value: string
}

function TextField({
  hint,
  inputMode = 'text',
  label,
  onChange,
  placeholder,
  value,
}: TextFieldProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {hint && <span className="field__hint">{hint}</span>}
      <input
        className="field__control"
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </label>
  )
}

interface ToggleFieldProps {
  checked: boolean
  hint?: string
  label: string
  onChange: (checked: boolean) => void
}

function ToggleField({ checked, hint, label, onChange }: ToggleFieldProps) {
  return (
    <label className="toggleField">
      <span className="toggleField__copy">
        <span className="field__label">{label}</span>
        {hint && <span className="field__hint">{hint}</span>}
      </span>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  )
}

interface CounterFieldProps {
  disabled?: boolean
  hint?: string
  label: string
  max?: number
  onChange: (value: number) => void
  value: number
}

function CounterField({
  disabled = false,
  hint,
  label,
  max = 100,
  onChange,
  value,
}: CounterFieldProps) {
  return (
    <label className={`field ${disabled ? 'field--disabled' : ''}`.trim()}>
      <span className="field__label">{label}</span>
      {hint && <span className="field__hint">{hint}</span>}
      <input
        className="field__control"
        disabled={disabled}
        inputMode="numeric"
        min={0}
        onChange={(event) => onChange(sanitizeCount(event.target.value, max))}
        step={1}
        type="number"
        value={value}
      />
    </label>
  )
}

interface MetricCardProps {
  label: string
  value: string
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="metricCard">
      <span className="metricCard__value">{value}</span>
      <span className="metricCard__label">{label}</span>
    </div>
  )
}

interface ResultsPanelProps {
  caseOverview: CaseOverview
  isStale: boolean
  rawOutput: string | null
  results: ResultsViewModel
}

function ResultsPanel({
  caseOverview,
  isStale,
  rawOutput,
  results,
}: ResultsPanelProps) {
  const { executiveSummary } = results
  const narrative = buildResultsNarrative(results)
  const orderedShares = sortSharesForDisplay(results.shares)
  const [shareMessage, setShareMessage] = useState<string | null>(null)

  async function handleCopyReport() {
    const report = buildPlainTextReport({
      caseOverview,
      generatedAt: new Date().toLocaleString('es-MA'),
      narrative,
      results,
    })

    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(report)
      setShareMessage('Resumen copiado al portapapeles.')
      return
    }

    setShareMessage('Este navegador no permite copiar al portapapeles desde la beta.')
  }

  function handleDownloadReport() {
    if (typeof window === 'undefined') return

    const report = buildPlainTextReport({
      caseOverview,
      generatedAt: new Date().toLocaleString('es-MA'),
      narrative,
      results,
    })

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = 'heritage-ui-next-informe.txt'
    link.click()
    window.URL.revokeObjectURL(url)
    setShareMessage('Informe descargado en texto plano.')
  }

  return (
    <section className="resultsPanel">
      <header className="resultsPanel__header">
        <div>
          <p className="panelCard__eyebrow">Resultado</p>
          <h3 className="panelCard__title">Reparto explicado</h3>
          <p className="panelCard__body">
            La respuesta del backend ya llega transformada a una capa de vista
            entendible para la UI.
          </p>
        </div>

        <div className="badgeRow">
          <Badge tone={isStale ? 'accent' : 'success'}>
            {isStale ? 'Resultado desactualizado' : 'Resultado vigente'}
          </Badge>
          <Badge>{executiveSummary.resolutionType ?? 'standard'}</Badge>
        </div>
      </header>

      <div className="reviewMetrics">
        <MetricCard
          label="Grupos beneficiarios"
          value={String(executiveSummary.totalBeneficiaryGroups)}
        />
        <MetricCard
          label="Masa"
          value={
            executiveSummary.estateValue === undefined
              ? 'Sin importe'
              : `${executiveSummary.estateValue}${
                  executiveSummary.currency ? ` ${executiveSummary.currency}` : ''
                }`
          }
        />
        <MetricCard
          label="Politica residual"
          value={executiveSummary.resolutionType ?? 'standard'}
        />
      </div>

      <section className="panelCard panelCard--actions">
        <div>
          <p className="panelCard__eyebrow">Salida util</p>
          <h3 className="panelCard__title">Exportar o compartir la lectura</h3>
          <p className="panelCard__body">
            La beta ya puede sacar un informe legible en texto y copiar un
            resumen para validar rapido el resultado fuera de la app.
          </p>
        </div>

        <div className="buttonRow">
          <Button onClick={() => void handleCopyReport()} variant="secondary">
            Copiar resumen
          </Button>
          <Button onClick={handleDownloadReport} variant="ghost">
            Descargar informe
          </Button>
        </div>
      </section>

      {shareMessage && <div className="alert alert--success">{shareMessage}</div>}

      <div className="narrativeGrid">
        <section className="panelCard panelCard--highlight">
          <p className="panelCard__eyebrow">Lectura ejecutiva</p>
          <h3 className="panelCard__title">{narrative.headline}</h3>
          <p className="panelCard__body">{narrative.summary}</p>
          <div className="badgeRow">
            {narrative.highlightBadges.map((badge) => (
              <Badge key={badge} tone="accent">
                {badge}
              </Badge>
            ))}
          </div>
        </section>

        <section className="panelCard">
          <p className="panelCard__eyebrow">Contexto del caso</p>
          <h3 className="panelCard__title">{caseOverview.headline}</h3>
          <p className="panelCard__body">{caseOverview.summary}</p>
          <ul className="readingList">
            {caseOverview.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panelCard">
        <p className="panelCard__eyebrow">Puntos clave</p>
        <h3 className="panelCard__title">Lo primero que debe leerse</h3>
        <ul className="readingList">
          {narrative.takeaways.map((takeaway) => (
            <li key={takeaway}>{takeaway}</li>
          ))}
        </ul>
      </section>

      <div className="resultsGrid">
        {orderedShares.map((share) => (
          <ResultCard
            currency={executiveSummary.currency}
            key={`${share.roleId}-${share.groupFraction}`}
            share={share}
          />
        ))}
      </div>

      {results.blocksAndWarnings.length > 0 && (
        <section className="panelCard">
          <p className="panelCard__eyebrow">Alertas</p>
          <h3 className="panelCard__title">Advertencias del motor</h3>
          <ul className="issueList">
            {results.blocksAndWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="panelCard">
        <p className="panelCard__eyebrow">Metodo aplicado</p>
        <h3 className="panelCard__title">Secuencia de resolucion</h3>
        <p className="panelCard__body">{narrative.auditSummary}</p>
        {narrative.auditMoments.length > 0 ? (
          <div className="timelineList">
            {narrative.auditMoments.map((moment) => (
              <article
                className="timelineItem"
                key={`${moment.phaseLabel}-${moment.detail}`}
              >
                <span className="timelineItem__phase">{moment.phaseLabel}</span>
                <p className="timelineItem__detail">{moment.detail}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="emptyState">
            Esta ejecucion no ha expuesto hitos legibles adicionales en la beta.
          </p>
        )}

        <div className="reviewMetrics">
          <MetricCard
            label="Fases registradas"
            value={String(results.auditLog.phaseLedger?.length ?? 0)}
          />
          <MetricCard
            label="Pasos explicativos"
            value={String(results.auditLog.steps?.length ?? 0)}
          />
          <MetricCard
            label="Advertencias"
            value={String(results.blocksAndWarnings.length)}
          />
        </div>
      </section>

      <section className="panelCard">
        <p className="panelCard__eyebrow">Auditoria separada</p>
        <h3 className="panelCard__title">Rastro tecnico disponible</h3>
        <div className="reviewMetrics">
          <MetricCard
            label="Fases registradas"
            value={String(results.auditLog.phaseLedger?.length ?? 0)}
          />
          <MetricCard
            label="Pasos explicativos"
            value={String(results.auditLog.steps?.length ?? 0)}
          />
        </div>

        {rawOutput && (
          <details className="codePanel">
            <summary>Ver output tecnico completo</summary>
            <pre>{rawOutput}</pre>
          </details>
        )}
      </section>
    </section>
  )
}

interface ResultCardProps {
  currency: string | undefined
  share: ShareViewModel
}

function ResultCard({ currency, share }: ResultCardProps) {
  const ratio = fractionToRatioValue(share.groupFraction)
  const ratioLabel = fractionToPercentLabel(share.groupFraction)

  return (
    <article className="resultCard">
      <div className="resultCard__header">
        <div>
          <p className="resultCard__title">{humanizeRole(share.roleId)}</p>
          <p className="resultCard__subtitle">
            {share.count} persona{share.count === 1 ? '' : 's'}
          </p>
        </div>

        <div className="badgeRow">
          {share.isFixed && <Badge tone="success">Fard</Badge>}
          {share.isAsaba && <Badge tone="accent">Asaba</Badge>}
        </div>
      </div>

      <dl className="resultCard__facts">
        <div>
          <dt>Fraccion del grupo</dt>
          <dd>{share.groupFraction}</dd>
        </div>
        <div>
          <dt>Fraccion individual</dt>
          <dd>{share.individualFraction ?? 'No aplica'}</dd>
        </div>
        <div>
          <dt>Importe individual</dt>
          <dd>{formatMoney(share.amount, currency)}</dd>
        </div>
      </dl>

      {ratio !== null && ratioLabel && (
        <div className="shareMeter" aria-label={`Peso visual ${ratioLabel}`}>
          <div className="shareMeter__track">
            <div
              className="shareMeter__fill"
              style={{ width: `${Math.max(ratio * 100, 8)}%` }}
            />
          </div>
          <span className="shareMeter__label">{ratioLabel}</span>
        </div>
      )}
    </article>
  )
}
