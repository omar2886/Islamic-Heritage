import { describe, expect, it } from 'vitest'
import { calcPayloadSchema } from '../../../entities/calculation/schema'
import { mapDraftToPayload } from '../../../entities/case-draft/mappers/draftToPayload'
import { draftPresets } from '../presets'

describe('workspace presets', () => {
  it('expone presets validos y mapeables al contrato tecnico', () => {
    expect(draftPresets.length).toBeGreaterThanOrEqual(3)

    for (const preset of draftPresets) {
      expect(preset.id).not.toBe('')
      expect(preset.title).not.toBe('')
      expect(() =>
        calcPayloadSchema.parse(mapDraftToPayload(preset.draft)),
      ).not.toThrow()
    }
  })
})
