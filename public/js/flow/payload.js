function normalizeSex(value) {
  const sex = String(value || '').toUpperCase();
  return sex === 'F' ? 'F' : sex === 'M' ? 'M' : '';
}

function buildPayload(state) {
  const deceasedSex = normalizeSex(state?.deceased?.sex || '');
  const counts = state?.heirsCounts || {};
  const ev = String(state?.estate?.value ?? '').trim();
  const amount = Number(ev.replace(',', '.'));

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El montante de herencia debe ser mayor que 0.');
  }

  const heirs = [];
  Object.entries(counts).forEach(([role, raw]) => {
    const count = Number.parseInt(raw, 10);
    if (!Number.isFinite(count) || count <= 0) return;
    if (deceasedSex === 'M' && role === 'husband') return;
    if (deceasedSex === 'F' && role === 'wife') return;
    heirs.push({ role, count, alive: true });
  });

  return {
    deceased: { sex: deceasedSex },
    heirs,
    estate_value: ev,
    amount: ev,
    meta: { ui: 'flow', version: 4 },
  };
}

export { buildPayload };
