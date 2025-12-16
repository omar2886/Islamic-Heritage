import { snapshotPersons } from './persons.js';

// Serializa a contrato del backend: heirs agrupado {role,count}, estate_value/amount y flags.
// Añadimos 'persons' para trazabilidad; si el backend lo ignora, no afecta.
export function toPayload({ sex, estateValue, counts, decedentId }) {
  const heirs = [];
  for (const [role, n] of counts.entries()) {
    const count = n|0;
    if (count > 0) heirs.push({ role, count });
  }
  const value = (estateValue == null) ? '' : String(estateValue).trim();
  const numeric = value === '' ? NaN : Number(value);
  const payload = {
    heirs,
    cli_flags: ['--explain','--audit'],
    ui_meta: { sex, decedentId },
    persons: snapshotPersons(),
  };
  if (Number.isFinite(numeric)) {
    payload.estate_value = value;
    payload.amount = value;                 // compat
  }
  return payload;
}
