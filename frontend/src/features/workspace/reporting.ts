import type { ResultsViewModel } from '../../entities/calculation/mappers/responseToViewModel'
import type { CaseOverview, ResultsNarrative } from './presentation'
import { formatMoney, humanizeRole, sortSharesForDisplay } from './presentation'

export interface ExportableReportInput {
  caseOverview: CaseOverview
  generatedAt: string
  narrative: ResultsNarrative
  results: ResultsViewModel
}

export function buildPlainTextReport({
  caseOverview,
  generatedAt,
  narrative,
  results,
}: ExportableReportInput): string {
  const lines: string[] = [
    'Heritage UI Next',
    'Informe de reparto',
    `Generado: ${generatedAt}`,
    '',
    'Resumen del caso',
    caseOverview.headline,
    caseOverview.summary,
    ...caseOverview.highlights.map((highlight) => `- ${highlight}`),
    '',
    'Lectura ejecutiva',
    narrative.headline,
    narrative.summary,
    ...narrative.takeaways.map((takeaway) => `- ${takeaway}`),
    '',
    'Reparto visible',
  ]

  for (const share of sortSharesForDisplay(results.shares)) {
    lines.push(
      `- ${humanizeRole(share.roleId)}: grupo ${share.groupFraction}, individual ${share.individualFraction ?? 'No aplica'}, importe ${formatMoney(share.amount, results.executiveSummary.currency)}`,
    )
  }

  if (results.blocksAndWarnings.length > 0) {
    lines.push('', 'Advertencias')
    lines.push(...results.blocksAndWarnings.map((warning) => `- ${warning}`))
  }

  lines.push('', 'Trazabilidad')
  lines.push(narrative.auditSummary)
  lines.push(
    ...narrative.auditMoments.map(
      (moment) => `- ${moment.phaseLabel}: ${moment.detail}`,
    ),
  )

  return lines.join('\n')
}
