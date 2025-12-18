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
  const ev = String(state?.estate?.value ?? '').trim();
  const evNumber = Number.parseFloat(ev);

  if (!ev || Number.isNaN(evNumber) || evNumber <= 0) {
    throw new Error('El montante de la herencia es obligatorio y debe ser mayor que cero.');
  }

  return {
    deceased: { sex: deceasedSex },
    heirs,
    estate_value: ev,
    amount: ev,
    meta: { ui: 'flow', version: 1 },
  };
}

export { buildPayload };
