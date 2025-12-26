import { hasAnyHeirInput, hasGrandchildrenViaSon, sumSiblingCounts, sumDescendantCounts, sumAgnaticUncleCounts } from "./state.js";

function isNumericStr(s) {
  return /^[0-9]+(\.[0-9]+)?$/.test(s);
}

function isCurrency3(s) {
  return /^[A-Z]{3}$/.test(s);
}

export function validateHard(state) {
  const errors = [];

  if (state.decedent.sex !== "male" && state.decedent.sex !== "female") {
    errors.push({ path: "decedent.sex", msg: "Sexo del causante inválido." });
  }

  // Hard spouse-sex constraints are enforced in sanitizeState, but still validate UI consistency.
  if (state.decedent.sex === "male" && state.heirs.husband) {
    errors.push({ path: "heirs.husband", msg: "Para causante masculino, no procede esposo." });
  }
  if (state.decedent.sex === "female" && Number(state.heirs.wife) > 0) {
    errors.push({ path: "heirs.wife", msg: "Para causante femenino, no proceden esposas." });
  }


  // Contract coherence: if calc.php rejects some roles (normalizes them to unknown),
  // block execution when user filled them to avoid silent mismatch.
  const rejectedRoles = Array.isArray(state.runtime?.roleCompat?.rejectedRoles)
    ? state.runtime.roleCompat.rejectedRoles
    : [];
  for (const r of rejectedRoles) {
    const roleId = String(r);
    const metaVal = state.heirs[roleId];
    const n = typeof metaVal === "number" ? metaVal : Number(metaVal || 0);
    if (n > 0) {
      errors.push({
        path: `heirs.${roleId}`,
        msg: `El core ignora el role '${roleId}'. Ponlo a 0 para calcular.`
      });
    }
  }

  if (!hasAnyHeirInput(state)) {
    errors.push({ path: "heirs", msg: "Debes indicar al menos un heredero." });
  }

  if (hasGrandchildrenViaSon(state) && state.uiOnly.hasDeceasedSon !== true) {
    errors.push({
      path: "uiOnly.hasDeceasedSon",
      msg: "Si indicas nietos via hijo, marca que existe al menos un hijo fallecido."
    });
  }

  const v = String(state.estate.value || "").trim();
  const c = String(state.estate.currency || "").trim();

  if (v !== "" && !isNumericStr(v)) {
    errors.push({ path: "estate.value", msg: "Valor de herencia inválido (usa números)." });
  }
  if (c !== "" && !isCurrency3(c)) {
    errors.push({ path: "estate.currency", msg: "Moneda inválida (3 letras mayúsculas)." });
  }

  return { ok: errors.length === 0, errors };
}

export function validateSoft(state) {
  const warnings = [];

  const siblings = sumSiblingCounts(state);
  const descendants = sumDescendantCounts(state);
  const uncles = sumAgnaticUncleCounts(state);

  if (state.heirs.father && siblings > 0) {
    warnings.push({
      msg: `Padre presente: normalmente excluye hermanos. El core decidirá. (father=true y siblings>0)`
    });
  }

  if ((Number(state.heirs.son) > 0 || Number(state.heirs.sons_son) > 0) && siblings > 0) {
    warnings.push({
      msg: `Descendientes varones presentes: normalmente excluyen hermanos. El core decidirá. (descendantsMale>0 y siblings>0)`
    });
  }

  if (descendants > 0 && uncles > 0) {
    warnings.push({
      msg: `Descendientes presentes: normalmente excluyen colaterales agnáticos (tíos y rama). El core decidirá. (descendants>0 y uncles>0)`
    });
  }

  if (state.heirs.father && uncles > 0) {
    warnings.push({
      msg: `Padre presente: normalmente excluye colaterales agnáticos (tíos y rama). El core decidirá. (father=true y uncles>0)`
    });
  }

  if (Number(state.heirs.son) > 0 && hasGrandchildrenViaSon(state)) {
    warnings.push({
      msg: `Hijos varones presentes: normalmente bloquean nietos via hijo. El core decidirá. (son>0 y grandchildrenViaSon>0)`
    });
  }

  return { warnings };
}
