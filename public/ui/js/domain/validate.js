export function isInt(n){
  return Number.isInteger(n) && Number.isFinite(n);
}

export function normalizeCount(v){
  if (typeof v === "string" && /^[0-9]+$/.test(v)) return parseInt(v, 10);
  if (typeof v === "number" && isInt(v)) return v;
  return null;
}

export function normalizeEstateValue(raw){
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Si hay coma y no hay punto, usar coma como decimal
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");

  // Validar: 1-18 enteros + opcional . + 1-6 decimales
  if (!/^[0-9]{1,18}(\.[0-9]{1,6})?$/.test(s)) return null;
  return s;
}

export function validateRequestDraft(draft, allowedRoles){
  const errors = [];
  const heirs = Array.isArray(draft?.heirs) ? draft.heirs : null;
  if (!heirs || heirs.length === 0){
    errors.push("Lista de herederos requerida");
    return { ok: false, errors };
  }

  const roleSet = new Set(Array.isArray(allowedRoles) ? allowedRoles : []);

  for (let i = 0; i < heirs.length; i++){
    const h = heirs[i];
    if (!h || typeof h !== "object"){
      errors.push(`Heredero inválido en posición ${i}`);
      continue;
    }
    const role = String(h.role || "").trim();
    if (!role){
      errors.push(`Rol de heredero inválido en posición ${i}`);
      continue;
    }
    if (roleSet.size > 0 && !roleSet.has(role)){
      errors.push(`Rol desconocido en posición ${i}`);
    }
    const c = normalizeCount(h.count);
    if (c == null){
      errors.push(`Cantidad inválida en posición ${i}`);
      continue;
    }
    if (c < 1 || c > 100){
      errors.push(`Cantidad fuera de rango en posición ${i}`);
    }
  }

  const ev = normalizeEstateValue(draft?.estate_value);
  if (draft?.estate_value != null && ev == null){
    errors.push("estate_value inválido");
  }

  const cur = draft?.currency != null ? String(draft.currency).trim() : null;
  if (cur != null && cur !== "" && !/^[A-Z]{3}$/.test(cur)){
    errors.push("currency inválido");
  }

  return { ok: errors.length === 0, errors };
}
