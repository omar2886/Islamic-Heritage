import { createInitialState } from './state.js';

const STORAGE_KEY = 'heritage_flow_state_v1';

function normalizeHeirsCounts(map) {
  const result = {};
  if (!map || typeof map !== 'object') return result;
  Object.entries(map).forEach(([role, raw]) => {
    const count = Number.parseInt(raw, 10);
    if (!role || !Number.isFinite(count) || count < 0) return;
    result[role] = count;
  });
  return result;
}

function migrateHeirsArray(source, target) {
  if (!Array.isArray(source)) return target;
  const next = { ...target };
  source.forEach((entry) => {
    const role = entry?.role;
    const count = Number.parseInt(entry?.count, 10);
    if (!role || !Number.isFinite(count) || count <= 0) return;
    next[role] = (next[role] || 0) + count;
  });
  return next;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createInitialState();
    const base = createInitialState();

    const state = { ...base };
    state.version = typeof parsed.version === 'number' ? parsed.version : base.version;
    state.step = typeof parsed.step === 'string' ? parsed.step : base.step;

    const deceased = parsed.deceased || {};
    state.deceased = {
      ...base.deceased,
      name: typeof deceased.name === 'string' ? deceased.name : base.deceased.name,
      sex: deceased.sex === 'M' || deceased.sex === 'F' ? deceased.sex : base.deceased.sex,
      notes: typeof deceased.notes === 'string' ? deceased.notes : base.deceased.notes,
    };

    const estateValue = parsed.estate?.value ?? parsed.estateValue ?? '';
    state.estate = { value: typeof estateValue === 'string' ? estateValue : String(estateValue ?? '') };

    const migratedCounts = migrateHeirsArray(parsed.heirs, normalizeHeirsCounts(parsed.heirsCounts));
    state.heirsCounts = migratedCounts;

    state.lastPayload = parsed.lastPayload && typeof parsed.lastPayload === 'object' ? parsed.lastPayload : null;
    state.lastResponse = parsed.lastResponse && typeof parsed.lastResponse === 'object' ? parsed.lastResponse : null;
    state.lastError = typeof parsed.lastError === 'string' ? parsed.lastError : '';
    state.reached = parsed.reached && typeof parsed.reached === 'object'
      ? { ...base.reached, ...parsed.reached }
      : { ...base.reached };

    if (typeof parsed.estateValue === 'string' && !parsed.estate?.value) {
      state.estate.value = parsed.estateValue;
    }

    return state;
  } catch (err) {
    console.warn('No se pudo cargar el estado de Flow', err);
    return createInitialState();
  }
}

export function saveState(state) {
  try {
    const snapshot = JSON.stringify({
      version: state.version,
      step: state.step,
      deceased: state.deceased,
      estate: state.estate,
      heirsCounts: state.heirsCounts,
      reached: state.reached,
      lastPayload: state.lastPayload,
      lastResponse: state.lastResponse,
      lastError: state.lastError,
    });
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch (err) {
    console.warn('No se pudo persistir el estado de Flow', err);
  }
}

export function resetState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('No se pudo limpiar el estado de Flow', err);
  }
}
