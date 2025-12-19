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

export function buildCalcPayload(state){
  const preview = state?.builder?.payloadPreview;
  if (!preview || !Array.isArray(preview.heirs)) return null;

  const heirs = cloneHeirs(preview.heirs);
  if (!heirs.length) return null;

  return { heirs };
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
