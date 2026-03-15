import type { ResultsViewModel, ShareViewModel } from '../../entities/calculation/mappers/responseToViewModel'
import type { CalcPayload } from '../../entities/calculation/schema'
import type { CaseDraft } from '../../entities/case-draft/schema'

const roleLabels: Record<string, string> = {
  consanguine_brother: 'Hermano paterno',
  consanguine_brothers: 'Hermanos paternos',
  consanguine_paternal_uncle: 'Tio paterno paterno',
  consanguine_paternal_uncle_son: 'Hijo de tio paterno paterno',
  consanguine_paternal_uncle_sons_daughter:
    'Hija de hijo de tio paterno paterno',
  consanguine_paternal_uncles_daughter: 'Hija de tio paterno paterno',
  consanguine_sister: 'Hermana paterna',
  consanguine_sisters: 'Hermanas paternas',
  daughter: 'Hija',
  daughters: 'Hijas',
  father: 'Padre',
  full_brother: 'Hermano de padre y madre',
  full_brothers: 'Hermanos de padre y madre',
  full_sister: 'Hermana de padre y madre',
  full_sisters: 'Hermanas de padre y madre',
  husband: 'Esposo',
  maternal_grandmother: 'Abuela materna',
  maternal_great_grandmother: 'Bisabuela materna',
  mother: 'Madre',
  paternal_grandfather: 'Abuelo paterno',
  paternal_grandmother: 'Abuela paterna',
  paternal_great_grandmother: 'Bisabuela paterna',
  paternal_uncle: 'Tio paterno',
  paternal_uncle_son: 'Hijo de tio paterno',
  paternal_uncle_sons_daughter: 'Hija de hijo de tio paterno',
  paternal_uncles_daughter: 'Hija de tio paterno',
  son: 'Hijo',
  sons: 'Hijos',
  sons_daughter: 'Nieta por hijo',
  sons_daughters: 'Nietas por hijo',
  sons_son: 'Nieto por hijo',
  sons_sons: 'Nietos por hijo',
  uterine_brother: 'Hermano materno',
  uterine_brothers: 'Hermanos maternos',
  uterine_sister: 'Hermana materna',
  uterine_sisters: 'Hermanas maternas',
  wife: 'Esposa',
  wives: 'Esposas',
}

const phaseLabels: Record<string, string> = {
  ASABA: 'Asaba',
  AWL: 'Awl',
  FIXED: 'Cuotas fijas',
  RADD: 'Radd',
  SPECIAL: 'Reglas especiales',
}

const resolutionCopy: Record<string, { badge: string; summary: string }> = {
  asaba: {
    badge: 'Residual por asaba',
    summary:
      'El remanente termina absorbido por asaba en la linea con mejor derecho dentro de la rama agnatica visible.',
  },
  radd: {
    badge: 'Redistribucion por radd',
    summary:
      'Tras las cuotas iniciales, el remanente se redistribuye entre quienes pueden participar en radd.',
  },
  standard: {
    badge: 'Reparto estandar',
    summary:
      'El caso se resuelve sin un patron residual excepcional visible en la capa de producto.',
  },
}

export interface CaseOverview {
  badges: string[]
  headline: string
  highlights: string[]
  summary: string
}

export interface AuditMoment {
  detail: string
  phaseLabel: string
}

export interface ResultsNarrative {
  auditMoments: AuditMoment[]
  auditSummary: string
  headline: string
  highlightBadges: string[]
  summary: string
  takeaways: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function parseAmount(value: string | undefined): number | undefined {
  if (!value) return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseFraction(value: string): number | null {
  const [numeratorRaw, denominatorRaw] = value.split('/')
  const numerator = Number(numeratorRaw)
  const denominator = Number(denominatorRaw)

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null
  }

  return numerator / denominator
}

function compactList(parts: string[]): string[] {
  return parts.filter((part) => part.trim() !== '')
}

function sumExtendedFamily(draft: CaseDraft): number {
  return (
    draft.extendedFamily.fullBrothers +
    draft.extendedFamily.fullSisters +
    draft.extendedFamily.paternalBrothers +
    draft.extendedFamily.paternalSisters +
    draft.extendedFamily.maternalBrothers +
    draft.extendedFamily.maternalSisters +
    draft.extendedFamily.paternalUncles +
    draft.extendedFamily.paternalConsanguineUncles +
    draft.extendedFamily.paternalUncleSons +
    draft.extendedFamily.paternalConsanguineUncleSons +
    draft.extendedFamily.paternalUnclesDaughters +
    draft.extendedFamily.paternalConsanguineUnclesDaughters +
    draft.extendedFamily.paternalUncleSonsDaughters +
    draft.extendedFamily.paternalConsanguineUncleSonsDaughters +
    (draft.extendedFamily.hasPaternalGrandfather ? 1 : 0) +
    (draft.extendedFamily.hasPaternalGrandmother ? 1 : 0) +
    (draft.extendedFamily.hasMaternalGrandmother ? 1 : 0) +
    (draft.extendedFamily.hasPaternalGreatGrandmother ? 1 : 0) +
    (draft.extendedFamily.hasMaternalGreatGrandmother ? 1 : 0)
  )
}

function normalizeAuditDetail(detail: string) {
  return detail
    .replace(/^Before\s+/i, '')
    .replace(/^After\s+/i, '')
    .trim()
}

export function humanizeRole(roleId: string): string {
  const directLabel = roleLabels[roleId]
  if (directLabel) return directLabel

  return roleId
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

export function formatMoney(
  value: string | undefined,
  currency: string | undefined,
): string {
  if (!value) return 'Sin importe'

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return currency ? `${value} ${currency}` : value
  }

  try {
    if (currency) {
      return new Intl.NumberFormat('es-MA', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(parsed)
    }
  } catch {
    return `${parsed.toLocaleString('es-MA')} ${currency}`
  }

  return parsed.toLocaleString('es-MA')
}

export function summarizeHeirs(heirs: CalcPayload['heirs']): string {
  if (heirs.length === 0) return 'Aun no hay herederos declarados.'

  return heirs
    .slice(0, 4)
    .map((heir) => `${humanizeRole(heir.role)} x${heir.count}`)
    .join(' · ')
}

export function sortSharesForDisplay(shares: ShareViewModel[]): ShareViewModel[] {
  return [...shares].sort((left, right) => {
    const leftAmount = parseAmount(left.amount) ?? -1
    const rightAmount = parseAmount(right.amount) ?? -1

    if (leftAmount !== rightAmount) return rightAmount - leftAmount
    if (left.count !== right.count) return right.count - left.count
    return left.roleId.localeCompare(right.roleId)
  })
}

export function fractionToPercentLabel(fraction: string): string | null {
  const value = parseFraction(fraction)
  if (value === null) return null

  const normalized = Math.max(0, Math.min(value * 100, 100))
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)}%`
}

export function fractionToRatioValue(fraction: string): number | null {
  const value = parseFraction(fraction)
  if (value === null) return null

  return Math.max(0, Math.min(value, 1))
}

export function buildCaseOverview(
  draft: CaseDraft,
  payload: CalcPayload,
): CaseOverview {
  const declaredPeople = payload.heirs.reduce((total, heir) => total + heir.count, 0)
  const estateLabel =
    draft.causante.estateValue === undefined
      ? 'sin masa economica declarada todavia'
      : `con una masa estimada de ${draft.causante.estateValue}${
          draft.causante.currency ? ` ${draft.causante.currency}` : ''
        }`

  const spouseHighlight =
    draft.causante.sex === 'male'
      ? draft.immediateFamily.numberOfWives > 0
        ? `Conyuge declarado: ${pluralize(
            draft.immediateFamily.numberOfWives,
            'esposa',
          )}.`
        : 'No se han declarado esposas supervivientes.'
      : draft.immediateFamily.hasHusband
        ? 'Conyuge declarado: un esposo superviviente.'
        : 'No se ha declarado esposo superviviente.'

  const parentBits = compactList([
    draft.immediateFamily.hasFather ? 'padre' : '',
    draft.immediateFamily.hasMother ? 'madre' : '',
  ])

  const parentHighlight =
    parentBits.length > 0
      ? `Ascendientes directos declarados: ${parentBits.join(' y ')}.`
      : 'No se han declarado padre ni madre.'

  const descendantBits = compactList([
    draft.descendants.sons > 0
      ? pluralize(draft.descendants.sons, 'hijo', 'hijos')
      : '',
    draft.descendants.daughters > 0
      ? pluralize(draft.descendants.daughters, 'hija', 'hijas')
      : '',
    draft.descendants.grandsons > 0
      ? pluralize(draft.descendants.grandsons, 'nieto por hijo', 'nietos por hijo')
      : '',
    draft.descendants.granddaughters > 0
      ? pluralize(
          draft.descendants.granddaughters,
          'nieta por hijo',
          'nietas por hijo',
        )
      : '',
  ])

  const descendantsHighlight =
    descendantBits.length > 0
      ? `Descendencia declarada: ${descendantBits.join(', ')}.`
      : 'No se ha declarado descendencia.'

  const extendedCount = sumExtendedFamily(draft)
  const extendedHighlight =
    extendedCount > 0
      ? `Familia extendida activa: ${pluralize(extendedCount, 'persona')} en ramas colaterales o ascendientes lejanos.`
      : 'No se ha declarado familia extendida.'

  return {
    badges: compactList([
      'Maliki',
      draft.preferences.expertMode ? 'Modo experto' : 'Modo guiado',
      `${payload.heirs.length} grupos`,
      draft.causante.currency ?? '',
    ]),
    headline:
      draft.causante.sex === 'male'
        ? 'Caso de causante varon'
        : 'Caso de causante mujer',
    highlights: [
      spouseHighlight,
      parentHighlight,
      descendantsHighlight,
      extendedHighlight,
    ],
    summary: `Se han declarado ${payload.heirs.length} grupos y ${pluralize(
      declaredPeople,
      'persona',
    )} potencialmente llamadas al reparto, ${estateLabel}.`,
  }
}

export function buildResultsNarrative(
  results: ResultsViewModel,
): ResultsNarrative {
  const orderedShares = sortSharesForDisplay(results.shares)
  const leadingShare = orderedShares[0]
  const fixedCount = orderedShares.filter((share) => share.isFixed).length
  const asabaCount = orderedShares.filter((share) => share.isAsaba).length
  const warningCount = results.blocksAndWarnings.length
  const phaseLedgerCount = results.auditLog.phaseLedger?.length ?? 0
  const explainStepsCount = results.auditLog.steps?.length ?? 0
  const resolution =
    resolutionCopy[results.executiveSummary.resolutionType ?? 'standard'] ??
    resolutionCopy.standard

  const leadSentence = leadingShare
    ? `${humanizeRole(leadingShare.roleId)} concentra la lectura principal del reparto con ${leadingShare.groupFraction}${
        leadingShare.amount
          ? ` y un importe visible de ${formatMoney(
              leadingShare.amount,
              results.executiveSummary.currency,
            )}`
          : ''
      }.`
    : 'La respuesta no expone beneficiarios visibles en la capa de producto.'

  const takeaways = compactList([
    leadSentence,
    fixedCount > 0
      ? `${pluralize(fixedCount, 'grupo')} entra con cuota fija reconocible en la salida final.`
      : 'No se aprecian grupos con cuota fija visible en el resultado.',
    asabaCount > 0
      ? `${pluralize(asabaCount, 'grupo')} participa por asaba o absorcion del residual.`
      : 'No se aprecia absorcion residual por asaba en la salida final.',
    warningCount > 0
      ? `El motor ha emitido ${pluralize(warningCount, 'advertencia')} que conviene revisar antes de dar el caso por cerrado.`
      : 'El motor no ha emitido advertencias de normalizacion en esta ejecucion.',
  ])

  const auditMoments = (results.auditLog.phaseLedger ?? [])
    .flatMap((entry) => {
      if (!isRecord(entry)) return []

      const phase =
        typeof entry.phase === 'string' ? entry.phase.toUpperCase() : undefined
      const action =
        typeof entry.action === 'string' ? entry.action.toLowerCase() : undefined
      const details =
        typeof entry.details === 'string' ? normalizeAuditDetail(entry.details) : ''

      if (!phase || action !== 'after') return []

      return [
        {
          detail:
            details !== ''
              ? details
              : `Fase ${phaseLabels[phase] ?? phase} completada.`,
          phaseLabel: phaseLabels[phase] ?? phase,
        },
      ]
    })
    .slice(0, 4)

  return {
    auditMoments,
    auditSummary:
      auditMoments.length > 0
        ? `La trazabilidad conserva ${pluralize(
            phaseLedgerCount,
            'fase',
          )} registradas y ${pluralize(explainStepsCount, 'paso')} explicativos.`
        : `La respuesta conserva ${pluralize(
            phaseLedgerCount,
            'fase',
          )} registradas, aunque la beta todavia no resume hitos legibles en esta ejecucion.`,
    headline: leadingShare
      ? `${humanizeRole(leadingShare.roleId)} marca la lectura principal del reparto.`
      : 'El reparto ya puede leerse como una resolucion del caso.',
    highlightBadges: compactList([
      resolution.badge,
      `${results.executiveSummary.totalBeneficiaryGroups} grupos beneficiarios`,
      fixedCount > 0 ? `${fixedCount} cuotas fijas` : '',
      asabaCount > 0 ? `${asabaCount} por asaba` : '',
    ]),
    summary: `${resolution.summary} La salida visible cubre ${pluralize(
      results.executiveSummary.totalBeneficiaryGroups,
      'grupo',
    )} beneficiarios y permite leer el reparto sin abrir la capa tecnica.`,
    takeaways,
  }
}
