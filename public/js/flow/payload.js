function normalizeSex(value) {
  const sex = String(value || '').toUpperCase();
  return sex === 'F' ? 'F' : 'M';
}

function buildPayload(state) {
  const deceasedSex = normalizeSex(state?.deceased?.sex || '');
  const counts = state?.heirsCounts || {};
  const ev = String(state?.estate?.value ?? '').trim();
  const evNumber = Number.parseFloat(ev);

  if (!ev || Number.isNaN(evNumber) || evNumber <= 0) {
    throw new Error('El montante de la herencia es obligatorio y debe ser mayor que cero.');
  }

  const spouseKey = deceasedSex === 'F' ? 'husband' : 'wife';

  const heirs = Object.entries(counts)
    .filter(([role, n]) => {
      if (role === 'husband' && spouseKey !== 'husband') return false;
      if (role === 'wife' && spouseKey !== 'wife') return false;
      return Number.parseInt(n, 10) > 0;
    })
    .map(([role, n]) => ({ role, count: Number.parseInt(n, 10) || 0 }));

  return {
    deceased: { sex: deceasedSex },
    heirs,
    estate_value: ev,
    amount: ev,
    meta: { ui: 'flow', version: 1 },
  };
}

export { buildPayload };
