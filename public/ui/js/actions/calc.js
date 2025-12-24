import { postCalc } from "../api/client.js";
import { sanitizeTree, ensureTree } from "../domain/familyTree.js";
import { deriveHeirsFromTree } from "../domain/treeRoles.js";

const ROLE_ALIASES = Object.freeze({
  wives: "wife",
  husbands: "husband",
});

function canonicalRoleId(roleId){
  const raw = (roleId === null || roleId === undefined) ? "" : String(roleId);
  const key = raw.trim();
  if (!key) return null;
  return ROLE_ALIASES[key] || key;
}

function cloneHeirs(list){
  const out = [];
  for (const h of list || []){
    if (!h || typeof h !== "object") continue;
    const role = canonicalRoleId(h.role);
    const count = Number(h.count);
    if (!role) continue;
    if (!Number.isFinite(count) || count <= 0) continue;
    out.push({ role, count: Math.trunc(count) });
  }
  return out;
}

function normalizeSex(sex){
  const s = String(sex || "").trim().toLowerCase();
  if (s === "male" || s === "female") return s;
  return null;
}

function normalizeDecedentId(id){
  // API exige max 32
  const s = String(id || "").trim();
  if (!s) return "";
  return s.slice(0, 32);
}

function normalizeCurrency(currency){
  const c = String(currency || "").trim().toUpperCase();
  if (!c) return { error: "Moneda vacía" };
  if (!/^[A-Z]{3}$/.test(c)) return { error: "Moneda inválida (usa 3 letras, ej. MAD)" };
  return { value: c };
}

function normalizeEstateValue(value){
  const raw = String(value ?? "").trim();
  if (!raw) return { value: null }; // opcional

  const cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return { error: "Valor de la herencia inválido" };

  let normalized = cleaned;
  if (normalized.includes(".") && normalized.includes(",")){
    normalized = normalized.replace(/,/g, "");
  } else if (!normalized.includes(".") && normalized.includes(",")){
    normalized = normalized.replace(/,/g, ".");
  }

  if (!/^[-+]?\d*(\.\d+)?$/.test(normalized)) return { error: "Valor de la herencia inválido" };

  const num = Number(normalized);
  if (!Number.isFinite(num)) return { error: "Valor de la herencia inválido" };
  if (num < 0) return { error: "Valor de la herencia no puede ser negativo" };
  if (num > 1e15) return { error: "Valor de la herencia fuera de rango" };

  return { value: num };
}

function buildUiMetaFromState(state){
  const wizard = state?.wizard || {};
  const builder = state?.builder || {};
  const mode = builder?.mode === "tree" ? "tree" : "roles";

  let sex = normalizeSex(wizard.deceased_sex);
  let decedentId = "";

  if (mode === "tree"){
    const tree = ensureTree(sanitizeTree(builder.tree));
    const did = tree?.deceasedId;
    const d = did ? tree?.people?.[did] : null;
    sex = normalizeSex(d?.sex);
    decedentId = normalizeDecedentId(did);
  }

  const source = mode === "tree" ? "tree" : "roles";
  const ui_meta = { source };

  if (sex) ui_meta.sex = sex;
  if (decedentId) ui_meta.decedentId = decedentId;

  return ui_meta;
}

function buildCalcPayload(state){
  const builder = state?.builder || {};
  const mode = builder?.mode === "tree" ? "tree" : "roles";

  let heirs = [];

  if (mode === "tree"){
    const derived = deriveHeirsFromTree(builder.tree);
    if (!derived || derived.ok !== true){
      const msg = Array.isArray(derived?.warnings) && derived.warnings.length ? derived.warnings[0] : "Arbol invalido para derivar roles";
      return { ok: false, error: msg };
    }
    heirs = cloneHeirs(derived.heirs);
    if (!heirs.length){
      return { ok: false, error: "El arbol no produce ningun rol soportado. Revisa Derivacion (panel derecho)." };
    }
  } else {
    const preview = builder.payloadPreview;
    if (!preview || !Array.isArray(preview.heirs)) return { ok: false, error: "Completa builder primero" };
    heirs = cloneHeirs(preview.heirs);
    if (!heirs.length) return { ok: false, error: "Agrega al menos un heredero" };
  }

  const wizard = state?.wizard || {};

  const estateResult = normalizeEstateValue(wizard.estate_value);
  if (estateResult.error) return { ok: false, error: estateResult.error };

  const currencyResult = normalizeCurrency(wizard.currency || "MAD");
  if (currencyResult.error) return { ok: false, error: currencyResult.error };

  const wizardFlags = wizard.flags || {};
  const cli_flags = [];
  if (wizardFlags.explain !== false) cli_flags.push("--explain");
  if (wizardFlags.audit !== false) cli_flags.push("--audit");

  const payload = {
    heirs,
    currency: currencyResult.value,
    cli_flags,
    ui_meta: buildUiMetaFromState(state),
  };

  // estate_value opcional
  if (estateResult.value !== null) payload.estate_value = estateResult.value;

  return { ok: true, payload };
}

export async function runCalc(store){
  const state = store.getState();
  const built = buildCalcPayload(state);
  const startedAt = Date.now();

  if (!built.ok){
    store.setState((s) => ({
      ...s,
      results: {
        ...s.results,
        status: "error",
        error: built.error || "No se pudo construir el payload",
        response: null,
        lastRunAt: startedAt,
      },
    }));
    return;
  }

  store.setState((s) => ({
    ...s,
    results: {
      ...s.results,
      status: "running",
      error: null,
      response: null,
      lastRunAt: startedAt,
      lastPayload: built.payload,
    },
  }));

  const res = await postCalc(built.payload);
  const finishedAt = Date.now();

  if (res.ok){
    const data = res.data;
    if (data && data.ok === false){
      store.setState((s) => ({
        ...s,
        results: {
          ...s.results,
          status: "error",
          error: data.error || "Error del core",
          response: data,
          finishedAt,
        },
      }));
      return;
    }

    store.setState((s) => ({
      ...s,
      results: {
        ...s.results,
        status: "ok",
        error: null,
        response: data,
        finishedAt,
      },
    }));
    return;
  }

  store.setState((s) => ({
    ...s,
    results: {
      ...s.results,
      status: "error",
      error: res.error || "Error de red",
      response: null,
      finishedAt,
    },
  }));
}
