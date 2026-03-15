import { caseDraftSchema, type CaseDraft } from '../../entities/case-draft/schema'

export interface DraftPreset {
  description: string
  draft: CaseDraft
  id: string
  title: string
}

function makePreset(input: unknown): CaseDraft {
  return caseDraftSchema.parse(input)
}

export const draftPresets: DraftPreset[] = [
  {
    id: 'asaba-children',
    title: 'Esposa, madre e hijos',
    description:
      'Caso directo para validar cuota fija de la madre y residual hacia hijos.',
    draft: makePreset({
      causante: {
        sex: 'male',
        school: 'maliki',
        estateValue: 120000,
        currency: 'EUR',
      },
      immediateFamily: {
        numberOfWives: 1,
        hasMother: true,
      },
      descendants: {
        sons: 2,
      },
      extendedFamily: {},
      preferences: {
        expertMode: false,
      },
    }),
  },
  {
    id: 'radd-daughters',
    title: 'Esposo y dos hijas',
    description:
      'Escenario limpio para revisar lectura de cuotas femeninas y redistribucion.',
    draft: makePreset({
      causante: {
        sex: 'female',
        school: 'maliki',
        estateValue: 90000,
        currency: 'MAD',
      },
      immediateFamily: {
        hasHusband: true,
        hasMother: true,
      },
      descendants: {
        daughters: 2,
      },
      extendedFamily: {},
      preferences: {
        expertMode: false,
      },
    }),
  },
  {
    id: 'extended-family',
    title: 'Familia extendida',
    description:
      'Sirve para comprobar la captura avanzada con hermanos, abuelo paterno y tios.',
    draft: makePreset({
      causante: {
        sex: 'male',
        school: 'maliki',
        estateValue: 150000,
        currency: 'USD',
      },
      immediateFamily: {
        hasMother: true,
      },
      descendants: {},
      extendedFamily: {
        fullBrothers: 1,
        fullSisters: 2,
        hasPaternalGrandfather: true,
        paternalUncles: 1,
      },
      preferences: {
        expertMode: true,
      },
    }),
  },
]
