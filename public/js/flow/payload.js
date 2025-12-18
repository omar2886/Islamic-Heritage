function normalizeSex(value) {
  const sex = String(value || '').toUpperCase();
  return sex === 'F' ? 'F' : 'M';
}

function buildPayload(state) {
  const deceasedSex = normalizeSex(state?.deceased?.sex || '');
  const counts = state?.heirsCounts || {};
  const ev = String(state?.estateValue ?? state?.estate?.value ?? '').trim().replace(',', '.');

  const spouseKey = deceasedSex === 'F' ? 'husband' : 'wife';

  const heirs = Object.entries(counts)
    .filter(([role, n]) => {
      if (role === 'husband' && spouseKey !== 'husband') return false;
      if (role === 'wife' && spouseKey !== 'wife') return false;
      return Number.parseInt(n, 10) > 0;
    })
    .map(([role, n]) => ({ role, count: Number.parseInt(n, 10) || 0 }))
    .filter((entry) => entry.count > 0);

  return {
    deceased: { sex: deceasedSex },
    estate_value: ev,
    amount: ev,
    heirs,
    meta: { ui: 'flow', version: 1 },
  };
}

export { buildPayload };
