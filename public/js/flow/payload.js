function normalizeSex(value) {
  const sex = String(value || '').toUpperCase();
  return sex === 'F' ? 'F' : 'M';
}

function normalizeHeir(heir) {
  return {
    role: String(heir.role || '').trim(),
    sex: normalizeSex(heir.sex),
    count: Number.parseInt(heir.count, 10) || 0,
    alive: heir.alive !== false,
    name: String(heir.name || '').trim(),
  };
}

function buildPayload(state) {
  const deceasedSex = normalizeSex(state?.deceased?.sex || '');
  const heirs = Array.isArray(state?.heirs) ? state.heirs.map(normalizeHeir) : [];

  return {
    deceased: { sex: deceasedSex },
    heirs,
    meta: { ui: 'flow', version: 1 },
  };
}

export { buildPayload };
