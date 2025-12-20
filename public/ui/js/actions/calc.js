import { postCalc } from "../api/client.js";

function cloneHeirs(list){
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      role: item?.role ?? null,
      count: item?.count ?? null,
    }))
    .filter((item) => item.role && item.count !== null);
}

function normalizeEstateValue(input){
  let raw = String(input ?? "").trim();
  if (raw === "") return { value: null, error: null };

  // remove spaces
  raw = raw.replace(/\s+/g, "");

  // If both separators exist, assume comma is thousands separator and remove it.
  if (raw.includes(".") && raw.includes(",")){
    raw = raw.replace(/,/g, "");
  } else if (!raw.includes(".") && raw.includes(",")){
    // If only comma exists, treat it as decimal separator.
    raw = raw.replace(/,/g, ".");
  }

  if (!/^[0-9]{1,18}(\.[0-9]{1,6})?$/.test(raw)){
    return { value: null, error: "Patrimonio inválido. Usa un número con hasta 6 decimales." };
  }

  return { value: raw, error: null };
}

function normalizeCurrency(input){
  const raw = String(input ?? "").trim().toUpperCase();
  if (raw === "") return { value: null, error: null };
  if (!/^[A-Z]{3}$/.test(raw)){
    return { value: null, error: "Moneda inválida. Usa 3 letras, ej. MAD, EUR, USD." };
  }
  return { value: raw, error: null };
}

export function buildCalcPayload(state){
  const preview = state?.builder?.payloadPreview;
  if (!preview || !Array.isArray(preview.heirs)) return { ok: false, error: "Completa builder primero" };

  const heirs = cloneHeirs(preview.heirs);
  if (!heirs.length) return { ok: false, error: "Agrega al menos un heredero" };

  const estateResult = normalizeEstateValue(state?.wizard?.estate_value);
  if (estateResult.error) return { ok: false, error: estateResult.error };

  const currencyResult = normalizeCurrency(state?.wizard?.currency);
  if (currencyResult.error) return { ok: false, error: currencyResult.error };

  const wizardFlags = state?.wizard?.flags || {};
  const audit = typeof wizardFlags.audit === "boolean" ? wizardFlags.audit : true;
  const explain = typeof wizardFlags.explain === "boolean" ? wizardFlags.explain : true;
  if (!audit && !explain){
    return { ok: false, error: "Activa Audit o Explain, al menos uno." };
  }

  const payload = { heirs };

  if (estateResult.value !== null){
    payload.estate_value = estateResult.value;
  }
  if (currencyResult.value !== null){
    payload.currency = currencyResult.value;
  }

  const sex = state?.wizard?.deceased_sex === "male" || state?.wizard?.deceased_sex === "female"
    ? state.wizard.deceased_sex
    : "unknown";

  payload.ui_meta = {
    sex,
    source: "ui-vanilla",
  };

  const cliFlags = [];
  if (audit) cliFlags.push("--audit");
  if (explain) cliFlags.push("--explain");
  payload.cli_flags = cliFlags;

  return { ok: true, payload };
}

export async function runCalc(store){
  const startedAt = Date.now();
  const built = buildCalcPayload(store.getState());

  if (!built.ok){
    store.setState((s) => ({
      ...s,
      results: {
        ...s.results,
        status: "error",
        error: built.error || "Completa builder primero",
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
          error: data.error || "calc.php devolvió error",
          response: data,
          lastRunAt: finishedAt,
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
        response: data ?? null,
        lastRunAt: finishedAt,
      },
    }));
    return;
  }

  store.setState((s) => ({
    ...s,
    results: {
      ...s.results,
      status: "error",
      error: res.error || "Error al calcular",
      response: res.debug ? { debug: res.debug } : null,
      lastRunAt: finishedAt,
    },
  }));
}
