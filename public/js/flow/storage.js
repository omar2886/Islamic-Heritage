import { VERSION, createInitialState, defaultHeir } from './state.js';

const STORAGE_KEY = 'heritage_flow_v1';

function normalizeHeir(entry) {
  const base = defaultHeir();
  if (!entry || typeof entry !== 'object') return base;
  return {
    ...base,
    ...entry,
    alive: entry.alive !== false,
    count: Number.isFinite(Number(entry.count)) ? Math.max(1, Number(entry.count)) : base.count,
  };
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
      deceased: { ...base.deceased, ...(parsed.deceased || {}) },
      heirs: Array.isArray(parsed.heirs) ? parsed.heirs.map(normalizeHeir) : base.heirs,
      lastResult: parsed.lastResult ?? null,
    };
  } catch (error) {
    console.warn('No se pudo cargar el estado del Flow Wizard', error);
    return createInitialState();
  }
}

function saveState(state) {
  try {
    const snapshot = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch (error) {
    console.warn('No se pudo persistir el estado del Flow Wizard', error);
  }
}

export { loadState, saveState, STORAGE_KEY };
