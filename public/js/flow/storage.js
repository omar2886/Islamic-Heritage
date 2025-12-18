import { VERSION, createInitialHeirsCounts, createInitialState } from './state.js';

const STORAGE_KEY = 'heritage_flow_v2';

function normalizeHeirsCounts(input = {}) {
  const base = createInitialHeirsCounts();
  return Object.entries(base).reduce((acc, [role, defaultValue]) => {
    const raw = input[role];
    const parsed = Number.parseInt(raw, 10);
    const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
    return { ...acc, [role]: safe };
  }, {});
}

function fromLegacyList(list) {
  if (!Array.isArray(list)) return list || {};
  return list.reduce((acc, entry) => {
    if (!entry || typeof entry !== 'object') return acc;
    const role = entry.role;
    const count = Number.parseInt(entry.count, 10) || 0;
    if (!role) return acc;
    const prev = acc[role] || 0;
    return { ...acc, [role]: prev + count };
  }, {});
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createInitialState();
    if (parsed.version !== VERSION) return createInitialState();

    const base = createInitialState();
    return {
      ...base,
      ...parsed,
      step: parsed.step && typeof parsed.step === 'string' ? parsed.step : base.step,
      estateValue: parsed.estateValue ?? parsed.estate?.value ?? base.estateValue,
      screening: { ...base.screening, ...(parsed.screening || {}) },
      deceased: { ...base.deceased, ...(parsed.deceased || {}) },
      estate: { ...base.estate, ...(parsed.estate || {}) },
      heirsCounts: normalizeHeirsCounts(parsed.heirsCounts || fromLegacyList(parsed.heirs)),
      lastResult: parsed.lastResult ?? null,
      lastResultRaw: parsed.lastResultRaw ?? null,
      lastPayload: parsed.lastPayload ?? null,
      lastResponse: parsed.lastResponse ?? null,
      lastError: parsed.lastError ?? '',
    };
  } catch (error) {
    console.warn('No se pudo cargar el estado del Flow Wizard', error);
    return createInitialState();
  }
}

function saveState(state) {
  try {
    const safeResult = (() => {
      if (!state.lastResult) return null;
      try {
        const serialized = JSON.stringify(state.lastResult);
        return serialized && serialized.length > 50000 ? null : state.lastResult;
      } catch (error) {
        console.warn('No se pudo serializar lastResult', error);
        return null;
      }
    })();

    const snapshot = JSON.stringify({ ...state, lastResult: safeResult, heirs: undefined });
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch (error) {
    console.warn('No se pudo persistir el estado del Flow Wizard', error);
  }
}

function resetCase() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('No se pudo limpiar el estado del Flow Wizard', error);
  }
  return createInitialState();
}

export { loadState, saveState, STORAGE_KEY, resetCase };
