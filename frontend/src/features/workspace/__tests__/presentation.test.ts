import { describe, expect, it } from 'vitest'
import { mapDraftToPayload } from '../../../entities/case-draft/mappers/draftToPayload'
import { caseDraftSchema } from '../../../entities/case-draft/schema'
import type { ResultsViewModel } from '../../../entities/calculation/mappers/responseToViewModel'
import {
  buildCaseOverview,
  buildResultsNarrative,
  fractionToPercentLabel,
  fractionToRatioValue,
  sortSharesForDisplay,
} from '../presentation'

describe('workspace presentation helpers', () => {
  it('resume el caso con una lectura funcional y estable', () => {
    const draft = caseDraftSchema.parse({
      causante: {
        sex: 'male',
        estateValue: 240000,
        currency: 'MAD',
      },
      immediateFamily: {
        numberOfWives: 2,
        hasFather: true,
        hasMother: true,
      },
      descendants: {
        sons: 2,
        daughters: 1,
      },
      extendedFamily: {
        fullSisters: 1,
      },
      preferences: {
        expertMode: false,
      },
    })

    const overview = buildCaseOverview(draft, mapDraftToPayload(draft))

    expect(overview.headline).toBe('Caso de causante varon')
    expect(overview.summary).toContain('6 grupos')
    expect(overview.summary).toContain('8 personas')
    expect(overview.highlights[0]).toContain('2 esposas')
    expect(overview.highlights[2]).toContain('2 hijos')
    expect(overview.badges).toContain('MAD')
  })

  it('prioriza por importe visible y construye una narrativa de reparto', () => {
    const results: ResultsViewModel = {
      executiveSummary: {
        totalBeneficiaryGroups: 3,
        estateValue: 120000,
        currency: 'EUR',
        resolutionType: 'asaba',
      },
      shares: [
        {
          roleId: 'wife',
          count: 1,
          groupFraction: '1/8',
          amount: '15000.00',
          isFixed: true,
          isAsaba: false,
        },
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
          groupFraction: '17/24',
          individualFraction: '17/48',
          amount: '42500.00',
          isFixed: false,
          isAsaba: true,
        },
      ],
      blocksAndWarnings: ['normalized wives group'],
      auditLog: {
        phaseLedger: [
          {
            phase: 'FIXED',
            action: 'after',
            details: 'After FIXED phase',
          },
          {
            phase: 'ASABA',
            action: 'after',
            details: 'After ASABA phase',
          },
        ],
        steps: [1, 2, 3],
      },
    }

    const ordered = sortSharesForDisplay(results.shares)
    const narrative = buildResultsNarrative(results)

    expect(ordered[0].roleId).toBe('sons')
    expect(narrative.headline).toContain('Hijos')
    expect(narrative.summary).toContain('asaba')
    expect(narrative.takeaways[0]).toContain('Hijos')
    expect(narrative.auditMoments).toHaveLength(2)
  })

  it('convierte fracciones a una lectura visual estable', () => {
    expect(fractionToPercentLabel('1/8')).toBe('13%')
    expect(fractionToRatioValue('17/24')).toBeCloseTo(17 / 24)
    expect(fractionToPercentLabel('bad')).toBeNull()
  })
})
