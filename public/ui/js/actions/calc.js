// public/ui/js/actions/calc.js  (REEMPLAZAR ENTERO)
import { apiPostJson } from "../api/client.js";
import { deriveHeirsByRoleFromTree } from "../domain/deriveHeirsFromTree.js";

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export async function runCalculation(store){
  const state = store.getState();
  const wizard = state?.wizard || {};
  const builder = state?.builder || {};
  const mode = builder?.mode || "tree";
  const tree = builder?.tree || null;

  const estateValue = num(wizard.estate_value);
  const currency = wizard.currency || "MAD";

  if (!Number.isFinite(estateValue) || estateValue <= 0){
    store.setState((s) => ({
      ...s,
      results: {
        ...(s.results || {}),
        error: "Valor de la herencia requerido.",
        response: null,
      },
    }));
    return;
  }

  let heirs = [];
  let derivation = null;

  if (mode === "tree"){
    derivation = deriveHeirsByRoleFromTree(tree);
    heirs = derivation.heirs || [];
  } else {
    // fallback: si existiese un modo alternativo, usar payloadPreview
    heirs = builder?.payloadPreview?.heirs || [];
  }

  if (!Array.isArray(heirs) || heirs.length === 0){
    store.setState((s) => ({
      ...s,
      results: {
        ...(s.results || {}),
        error: "No hay herederos derivados. Construye o importa el árbol.",
        response: null,
      },
    }));
    return;
  }

  // Payload esperado por calc.php: mantener la forma conservadora
  const payload = {
    estate_value: estateValue,
    currency,
    heirs,
    // evidencia opcional para UI: NO usarlo en core si no lo acepta, pero lo enviamos solo si el server tolera campos extra.
    // Si tu backend es estricto, comenta las siguientes 2 líneas.
    _ui_mode: mode,
    _ui_source: "tree",
  };

  store.setState((s) => ({
    ...s,
    results: { ...(s.results || {}), loading: true, error: null, response: null, lastPayload: payload, derivation },
  }));

  try {
    const res = await apiPostJson("../api/calc.php", payload);
    store.setState((s) => ({
      ...s,
      results: { ...(s.results || {}), loading: false, error: null, response: res, lastPayload: payload, derivation },
    }));
  } catch (err){
    const msg = err?.message ? String(err.message) : "Error al calcular.";
    store.setState((s) => ({
      ...s,
      results: { ...(s.results || {}), loading: false, error: msg, response: null, lastPayload: payload, derivation },
    }));
  }
}
