export function buildPayload(state, rolesCatalog) {
  const roles = rolesCatalog.getRolesSync();
  const rejectedSet = new Set(Array.isArray(state.runtime?.roleCompat?.rejectedRoles) ? state.runtime.roleCompat.rejectedRoles : []);
  if (!Array.isArray(roles)) {
    throw new Error("Roles not loaded. Call rolesCatalog.loadRoles(apiClient) first.");
  }

  const heirs = [];
  for (const roleId of roles) {
    if (rejectedSet.has(String(roleId))) continue;
    const v = state.heirs[roleId];

    if (typeof v === "boolean") {
      if (v) heirs.push({ role: roleId, count: 1 });
      continue;
    }

    const n = Number(v);
    if (Number.isFinite(n) && n > 0) {
      heirs.push({ role: roleId, count: Math.trunc(n) });
    }
  }

  const payload = { heirs };

  const estateValue = String(state.estate.value || "").trim();
  const currency = String(state.estate.currency || "").trim();
  if (estateValue !== "") payload.estate_value = Number(estateValue);
  if (currency !== "") payload.currency = currency;

  payload.ui_meta = {
    sex: state.decedent.sex,
    source: "ui-typed-roles"
  };

  // uiOnly is not sent; it is only a UI consistency constraint.

  return payload;
}
