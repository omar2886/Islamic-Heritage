import { LABELS_FALLBACK } from './roles_meta.js';

function normalizeSex(value) {
  const sex = String(value || '').toUpperCase();
  return sex === 'F' ? 'F' : sex === 'M' ? 'M' : '';
}

function toInt(raw) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function resolveRoleLabel(role, catalog) {
  return catalog.get(role) || LABELS_FALLBACK[role] || role;
}

function pushIssue(collection, sectionBag, key, message) {
  collection.push(message);
  if (!sectionBag[key]) {
    sectionBag[key] = { errors: [], warnings: [] };
  }
  sectionBag[key].errors.push(message);
}

function validateState(state, roles = []) {
  const roleCatalog = new Map();
  if (Array.isArray(roles)) {
    roles.forEach((entry) => {
      const code = entry?.code || entry?.id || entry?.role;
      const label = entry?.label || entry?.name || entry?.title;
      if (code) {
        roleCatalog.set(String(code), label ? String(label) : String(code));
      }
    });
  }
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
    pushIssue(errors, bySection, 'heirs', 'Define sexo del causante antes de añadir herederos.');
  }

  const counts = state?.heirsCounts || {};
  Object.entries(counts).forEach(([role, raw]) => {
    const count = toInt(raw);
    if (!Number.isInteger(count) || count < 0) {
      pushIssue(errors, bySection, 'heirs', `"${resolveRoleLabel(role, roleCatalog)}" debe ser un entero mayor o igual que 0.`);
    }
  });

  if ((counts.father || 0) > 1) {
    pushIssue(errors, bySection, 'heirs', 'Padre no puede superar 1.');
  }
  if ((counts.mother || 0) > 1) {
    pushIssue(errors, bySection, 'heirs', 'Madre no puede superar 1.');
  }

  if (deceasedSex === 'M') {
    if ((counts.wife || 0) > 4) {
      pushIssue(errors, bySection, 'heirs', 'Máximo 4 esposas.');
    }
    if ((counts.husband || 0) > 0) {
      pushIssue(errors, bySection, 'heirs', 'Para causante varón, no se admite esposo.');
    }
  }

  if (deceasedSex === 'F') {
    if ((counts.husband || 0) > 1) {
      pushIssue(errors, bySection, 'heirs', 'Solo se admite un esposo.');
    }
    if ((counts.wife || 0) > 0) {
      pushIssue(errors, bySection, 'heirs', 'Para causante mujer, no se admiten esposas.');
    }
  }

  return {
    errors,
    warnings,
    bySection,
  };
}

export { validateState };
