import { caseDraftSchema, type CaseDraft } from './schema'

export function createInitialDraft(): CaseDraft {
  return caseDraftSchema.parse({
    causante: {
      sex: 'male',
      school: 'maliki',
    },
    immediateFamily: {},
    descendants: {},
    extendedFamily: {},
    preferences: {
      expertMode: false,
    },
  })
}
