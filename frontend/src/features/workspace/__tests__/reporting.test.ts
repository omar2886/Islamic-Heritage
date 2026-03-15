import { describe, expect, it } from 'vitest'
import type { ResultsViewModel } from '../../../entities/calculation/mappers/responseToViewModel'
import { buildPlainTextReport } from '../reporting'

describe('workspace reporting', () => {
  it('genera un informe de texto legible para exportar o copiar', () => {
    const results: ResultsViewModel = {
      executiveSummary: {
        totalBeneficiaryGroups: 2,
        estateValue: 120000,
        currency: 'EUR',
        resolutionType: 'asaba',
      },
      shares: [
        {
          roleId: 'mother',
          count: 1,
          groupFraction: '1/6',
          amount: '20000.00',
          isFixed: true,
          isAsaba: false,
        },
        {
          roleId: 'sons',
          count: 2,
          groupFraction: '5/6',
          individualFraction: '5/12',
          amount: '50000.00',
          isFixed: false,
          isAsaba: true,
        },
      ],
      blocksAndWarnings: ['normalized wives group'],
      auditLog: {
        phaseLedger: [],
        steps: [],
      },
    }

    const report = buildPlainTextReport({
      caseOverview: {
        badges: ['Maliki'],
        headline: 'Caso de causante varon',
        highlights: ['Conyuge declarado: una esposa superviviente.'],
        summary: 'Se han declarado 3 grupos y 4 personas.',
      },
      generatedAt: '2026-03-14 23:30',
      narrative: {
        auditMoments: [{ phaseLabel: 'Asaba', detail: 'Residual consumido.' }],
        auditSummary: 'La trazabilidad conserva 3 fases.',
        headline: 'Hijos marca la lectura principal del reparto.',
        highlightBadges: ['Residual por asaba'],
        summary: 'El remanente termina absorbido por asaba.',
        takeaways: ['Hijos concentra la lectura principal del reparto.'],
      },
      results,
    })

    expect(report).toContain('Informe de reparto')
    expect(report).toContain('Caso de causante varon')
    expect(report).toContain('Madre')
    expect(report).toContain('Hijos')
    expect(report).toContain('Advertencias')
  })
})
