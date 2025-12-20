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

function normalizeEstateValue(raw){
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // remove spaces
  s = s.replace(/\s+/g, "");

  // If both separators exist, assume comma is thousands separator and remove it.
  if (s.includes(".") && s.includes(",")){
    s = s.replace(/,/g, "");
  } else if (!s.includes(".") && s.includes(",")){
    // If only comma exists, treat it as decimal separator.
    s = s.replace(/,/g, ".");
  }

  return s;
}

function normalizeCurrency(raw){
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

export function buildCalcPayload(state){
  const preview = state?.builder?.payloadPreview;
  if (!preview || !Array.isArray(preview.heirs)) return null;

  const heirs = cloneHeirs(preview.heirs);
  if (!heirs.length) return null;

  const payload = { heirs };

  const estateRaw = state?.wizard?.estate?.value ?? null;
  const currencyRaw = state?.wizard?.estate?.currency ?? null;

  const estateValue = normalizeEstateValue(estateRaw);
  const currency = normalizeCurrency(currencyRaw);

  if (estateValue){
    payload.estate_value = estateValue;
  }
  if (currency){
    payload.currency = currency;
  }

  const sex = state?.wizard?.deceased_sex === "male" || state?.wizard?.deceased_sex === "female"
    ? state.wizard.deceased_sex
    : "unknown";

  payload.ui_meta = {
    sex,
    source: "ui-vanilla",
  };

  payload.cli_flags = ["--audit", "--explain"];

  return payload;
}

export async function runCalc(store){
  const startedAt = Date.now();
  const payload = buildCalcPayload(store.getState());

  if (!payload){
    store.setState((s) => ({
      ...s,
      results: {
        ...s.results,
        status: "error",
        error: "Completa builder primero",
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

  const res = await postCalc(payload);
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
