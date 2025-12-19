export function validateState(state, rolesCatalog = []) {
  const errors = [];
  const warnings = [];
  const counts = state.heirsCounts || {};
  const sex = state.deceased?.sex;

  const estateValue = state.estate?.value;
  if (!estateValue || Number(estateValue) <= 0) {
    errors.push('El valor de la herencia es obligatorio y debe ser mayor que cero');
  }

  Object.entries(counts).forEach(([role, raw]) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`Conteo inválido para ${role}`);
    }
  });

  if (sex === 'M') {
    if ((counts.husband ?? 0) !== 0) errors.push('husband no es válido para causante masculino');
  }
  if (sex === 'F') {
    if ((counts.wife ?? 0) !== 0) errors.push('wife no es válida para causante femenina');
  }

  if (counts.wife > 4) errors.push('wife excede el máximo permitido (4)');
  if (counts.husband > 1) errors.push('husband excede el máximo permitido (1)');
  if (counts.father > 1) errors.push('father excede el máximo permitido (1)');
  if (counts.mother > 1) errors.push('mother excede el máximo permitido (1)');

  if (Array.isArray(rolesCatalog) && rolesCatalog.length > 0) {
    const allowed = new Set(
      rolesCatalog.map((item) => (typeof item === 'string' ? item : item?.role || item?.code || item?.id)).filter(Boolean)
    );
    Object.keys(counts).forEach((role) => {
      if (!allowed.has(role)) {
        errors.push(`Rol desconocido: ${role}`);
      }
    });
  }

  return { errors, warnings };
}
