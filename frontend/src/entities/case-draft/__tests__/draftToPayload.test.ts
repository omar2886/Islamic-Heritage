import { describe, it, expect } from 'vitest';
import { caseDraftSchema } from '../schema';
import { mapDraftToPayload } from '../mappers/draftToPayload';
import { calcPayloadSchema } from '../../calculation/schema';

describe('B-004 mapper: CaseDraft -> CalcPayload', () => {

  it('debe mapear un draft mínimo válido (solo esposo)', () => {
    // 1. Arrange: caso base con un esposo.
    const minimalDraft = caseDraftSchema.parse({
      causante: { sex: 'female' },
      immediateFamily: { hasHusband: true },
      descendants: {},
      extendedFamily: {}
    });

    // 2. Act
    const payload = mapDraftToPayload(minimalDraft);

    // 3. Assert
    expect(payload.ui_meta?.sex).toBe('female');
    expect(payload.heirs).toHaveLength(1);
    expect(payload.heirs[0]).toEqual({ role: 'husband', count: 1 });
    
    // Y probamos que es un payload válido según el single-source de verdad
    expect(() => calcPayloadSchema.parse(payload)).not.toThrow();
  });

  it('debe omitir esposa si el causante es femenino (ignorar inconsistencia si llega a puentear Zod)', () => {
    // Usamos cast parcial para saltarnos el superRefine de Zod y ver si el mapper es robusto
    const brokenDraft = {
      causante: { sex: 'female' },
      immediateFamily: { hasHusband: false, numberOfWives: 3 },
      descendants: {},
      extendedFamily: {}
    } as Parameters<typeof mapDraftToPayload>[0];
    
    const payload = mapDraftToPayload(brokenDraft);
    expect(payload.heirs.find(h => h.role === 'wife')).toBeUndefined();
  });

  it('debe mapear descendencia completa', () => {
    const descendantsDraft = caseDraftSchema.parse({
      causante: { sex: 'male' },
      immediateFamily: {},
      descendants: { sons: 2, daughters: 4, hasDeceasedSon: true, grandsons: 1, granddaughters: 2 },
      extendedFamily: {}
    });

    const payload = mapDraftToPayload(descendantsDraft);

    const checkRole = (role: string, expectedCount: number) => {
      const heir = payload.heirs.find(h => h.role === role);
      expect(heir?.count).toBe(expectedCount);
    };

    checkRole('son', 2);
    checkRole('daughter', 4);
    checkRole('sons_son', 1);
    checkRole('sons_daughter', 2);
  });

  it('debe omitir sobrinos/nietos si flag hasDeceasedSon es false', () => {
    // De nuevo, mandamos un objeto que Zod rechazaría pero que el mapper debe gestionar
    const wrongGrandchildrenDraft = {
      causante: { sex: 'male' },
      immediateFamily: {},
      descendants: { sons: 1, daughters: 0, hasDeceasedSon: false, grandsons: 3 },
      extendedFamily: {}
    } as Parameters<typeof mapDraftToPayload>[0];

    const payload = mapDraftToPayload(wrongGrandchildrenDraft);
    expect(payload.heirs.find(h => h.role === 'sons_son')).toBeUndefined();
  });
});
