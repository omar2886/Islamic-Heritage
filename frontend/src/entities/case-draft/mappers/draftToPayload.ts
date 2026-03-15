import type { CaseDraft } from '../schema';
import type { CalcPayload, CalcRole } from '../../calculation/schema';

/**
 * Mapper puro B-004:
 * Recibe un CaseDraft de la UI (formato UX, ej. "hijos: 2, hijas: 1")
 * Devuelve un CalcPayload canónico que pasa a calc.php (formato Técnico).
 */
export function mapDraftToPayload(draft: CaseDraft): CalcPayload {
  const payload: CalcPayload = {
    heirs: [],
    currency: draft.causante.currency || undefined,
    estate_value: draft.causante.estateValue !== undefined && draft.causante.estateValue !== null ? Number(draft.causante.estateValue) : undefined,
    ui_meta: {
      sex: draft.causante.sex,
      source: 'ui-next',
    }
  };

  const add = (role: CalcRole, count: number) => {
    if (count > 0) {
      payload.heirs.push({ role, count });
    }
  };

  // 1. Spouses & Parents
  if (draft.causante.sex === 'female' && draft.immediateFamily.hasHusband) {
    add('husband', 1);
  } else if (draft.causante.sex === 'male' && draft.immediateFamily.numberOfWives > 0) {
    add('wife', draft.immediateFamily.numberOfWives);
  }

  if (draft.immediateFamily.hasFather) add('father', 1);
  if (draft.immediateFamily.hasMother) add('mother', 1);

  // 2. Descendants (Sons & Daughters)
  add('son', draft.descendants.sons);
  add('daughter', draft.descendants.daughters);

  // Grandchildren (only via son, as daughters descendants don't inherit in primary Maliki rules unless very specific edge cases handled by backend)
  if (draft.descendants.hasDeceasedSon) {
    add('sons_son', draft.descendants.grandsons);
    add('sons_daughter', draft.descendants.granddaughters);
  }

  // 3. Extended (Siblings)
  add('full_brother', draft.extendedFamily.fullBrothers);
  add('full_sister', draft.extendedFamily.fullSisters);
  add('consanguine_brother', draft.extendedFamily.paternalBrothers);
  add('consanguine_sister', draft.extendedFamily.paternalSisters);
  add('uterine_brother', draft.extendedFamily.maternalBrothers);
  add('uterine_sister', draft.extendedFamily.maternalSisters);

  // 4. Grandparents
  if (draft.extendedFamily.hasPaternalGrandfather) add('paternal_grandfather', 1);
  if (draft.extendedFamily.hasPaternalGrandmother) add('paternal_grandmother', 1);
  if (draft.extendedFamily.hasMaternalGrandmother) add('maternal_grandmother', 1);
  
  if (draft.extendedFamily.hasPaternalGreatGrandmother) add('paternal_great_grandmother', 1);
  if (draft.extendedFamily.hasMaternalGreatGrandmother) add('maternal_great_grandmother', 1);

  // 5. Uncles & Agnatic cousins
  add('paternal_uncle', draft.extendedFamily.paternalUncles);
  add('consanguine_paternal_uncle', draft.extendedFamily.paternalConsanguineUncles);
  add('paternal_uncle_son', draft.extendedFamily.paternalUncleSons);
  add('consanguine_paternal_uncle_son', draft.extendedFamily.paternalConsanguineUncleSons);
  add('paternal_uncles_daughter', draft.extendedFamily.paternalUnclesDaughters);
  add('consanguine_paternal_uncles_daughter', draft.extendedFamily.paternalConsanguineUnclesDaughters);
  add('paternal_uncle_sons_daughter', draft.extendedFamily.paternalUncleSonsDaughters);
  add('consanguine_paternal_uncle_sons_daughter', draft.extendedFamily.paternalConsanguineUncleSonsDaughters);

  // El payload requiere al menos 1 heredero.
  // Si el form está vacío pero se fuerza mapeo, calcPayloadSchema de Zod ya saltará, 
  // pero lo dejamos pasar tal cual para que testee el backend/Zod.
  
  // Limpiamos los fields vacios para un payload mas pulcro
  if (payload.currency === undefined) delete payload.currency;
  if (payload.estate_value === undefined) delete payload.estate_value;

  return payload;
}
