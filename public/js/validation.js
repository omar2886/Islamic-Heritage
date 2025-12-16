// Validaciones UI: corrige y emite avisos/errores.
export function validate({ sex, counts, estateValue }) {
  const c = new Map(counts); // copia
  const warnings = [];
  const errors = [];

  const value = String(estateValue ?? '').trim();
  let normalizedEstateValue = null;
  const numericValue = value === '' ? NaN : Number(value);
  if (value === '') {
    errors.push('Ingresa un monto para la herencia.');
  } else if (!Number.isFinite(numericValue)) {
    errors.push('El monto de la herencia debe ser un número válido.');
  } else {
    normalizedEstateValue = value;
  }

  const v = role => c.get(role) || 0;
  const set = (role, n) => c.set(role, Math.max(0, n|0));

  // 1) Cónyuges
  const husbands = v('husband');
  const wives = v('wife');
  if (sex === 'male') {
    if (husbands > 0) { warnings.push('Sexo=varón ⇒ husband=0.'); set('husband', 0); }
    if (wives > 4) { warnings.push('Varón ⇒ máximo 4 wives. Se limita.'); set('wife', 4); }
  } else if (sex === 'female') {
    if (wives > 0) { warnings.push('Sexo=mujer ⇒ wife=0.'); set('wife', 0); }
    if (husbands > 1) { warnings.push('Mujer ⇒ máximo 1 husband. Se limita.'); set('husband', 1); }
  } else { // unknown
    if ((husbands + wives) > 1) {
      warnings.push('Sexo desconocido ⇒ máximo 1 cónyuge total. Se normaliza conservando el último no-cero.');
      if (wives > 0) set('husband', 0); else set('wife', 0);
    }
    if (wives > 4) { warnings.push('Límite técnico: wives ≤ 4.'); set('wife', 4); }
    if (husbands > 1) { warnings.push('Límite técnico: husband ≤ 1.'); set('husband', 1); }
  }

  // 2) Padre vivo ⇒ bloquea abuelos paternos + todos los hermanos
  if (v('father') > 0) {
    ['paternal_grandfather','paternal_grandmother'].forEach(r=>{
      if (v(r) > 0) warnings.push(`Padre vivo ⇒ excluye ${r}.`);
      set(r, 0);
    });
    ['full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister'].forEach(r=>{
      if (v(r) > 0) warnings.push(`Padre vivo ⇒ excluye ${r}.`);
      set(r, 0);
    });
  }

  // 3) Madre viva ⇒ bloquea abuela materna
  if (v('mother') > 0) {
    if (v('maternal_grandmother') > 0) warnings.push('Madre viva ⇒ excluye maternal_grandmother.');
    set('maternal_grandmother', 0);
  }

  // 4) Al menos un heredero con count > 0
  const any = Array.from(c.values()).some(x => (x|0) > 0);
  if (!any) errors.push('Debe haber al menos un heredero con count > 0.');

  return { counts: c, warnings, errors, estateValue: normalizedEstateValue };
}
