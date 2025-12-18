import { ROLE_LABELS } from './roles_meta.js';

const ROLE_LIMITS = {
  father: 1,
  mother: 1,
  paternal_grandfather: 1,
  paternal_grandmother: 1,
  maternal_grandmother: 1,
  paternal_great_grandmother: 1,
  maternal_great_grandmother: 1,
  husband: 1,
  wife: 4,
};

function normalizeSex(value) {
  const sex = String(value || '').toUpperCase();
  return sex === 'F' ? 'F' : sex === 'M' ? 'M' : '';
}

function pushIssue(collection, sectionBag, key, message) {
  collection.push(message);
  if (!sectionBag[key]) {
    sectionBag[key] = { errors: [], warnings: [] };
  }
  sectionBag[key].errors.push(message);
}

function validateState(state) {
  const catalog = new Set(Object.keys(ROLE_LABELS));
  const errors = [];
  const warnings = [];
  const bySection = { decedent: { errors: [], warnings: [] }, heirs: { errors: [], warnings: [] }, review: { errors: [], warnings: [] } };

  const estateRaw = String(state?.estateValue ?? state?.estate?.value ?? '').trim();
  const estateValue = Number(String(estateRaw || '').replace(',', '.'));
  if (!Number.isFinite(estateValue) || estateValue <= 0) {
    pushIssue(errors, bySection, 'decedent', 'Introduce un montante de herencia válido (> 0).');
    pushIssue(errors, bySection, 'review', 'Introduce un montante de herencia válido (> 0).');
  }

  const deceasedSex = normalizeSex(state?.deceased?.sex);
  if (!deceasedSex) {
    pushIssue(errors, bySection, 'decedent', 'El sexo del causante es obligatorio.');
    pushIssue(errors, bySection, 'heirs', 'Define sexo del causante primero.');
  }

  const counts = state?.heirsCounts || {};
  Object.entries(counts).forEach(([role, raw]) => {
    if (!catalog.has(role)) return;
    const count = Number.parseInt(raw, 10);
    if (!Number.isInteger(count) || count < 0) {
      pushIssue(errors, bySection, 'heirs', `"${ROLE_LABELS[role] || role}" debe ser un entero mayor o igual que 0.`);
      return;
    }

    const max = ROLE_LIMITS[role];
    if (Number.isInteger(max) && count > max) {
      pushIssue(errors, bySection, 'heirs', `"${ROLE_LABELS[role] || role}" no puede superar ${max}.`);
    }
  });

  if (deceasedSex === 'M' && (counts.husband || 0) > 0) {
    pushIssue(errors, bySection, 'heirs', 'Para causante varón, no se admite esposo.');
  }

  if (deceasedSex === 'F') {
    if ((counts.husband || 0) > 1) {
      pushIssue(errors, bySection, 'heirs', 'Solo se admite un esposo.');
    }
    if ((counts.wife || 0) > 0) {
      pushIssue(errors, bySection, 'heirs', 'Para causante mujer, no se admiten esposas.');
    }
  } else if (deceasedSex === 'M' && (counts.wife || 0) > 4) {
    pushIssue(errors, bySection, 'heirs', 'Máximo 4 esposas.');
  }

  return {
    errors,
    warnings,
    bySection,
  };
}

export { validateState };
