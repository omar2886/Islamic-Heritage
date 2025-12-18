export function buildPayload(state) {
  const estateValue = String(state.estate?.value ?? '').trim();
  const heirsCounts = state.heirsCounts || {};
  const heirs = Object.entries(heirsCounts)
    .filter(([, count]) => Number.parseInt(count, 10) > 0)
    .map(([role, count]) => ({ role, count: Number.parseInt(count, 10) }));

  return {
    estate_value: estateValue,
    amount: estateValue,
    heirs,
    meta: { ui: 'flow', v: 1 }
  };
}
