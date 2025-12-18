import { VERSION, createInitialState } from './state.js';

const STORAGE_KEY = 'heritage_flow_state_v4';

function normalizeHeirsCounts(input = {}) {
  const result = {};
  Object.entries(input || {}).forEach(([role, raw]) => {
    const parsed = Number.parseInt(raw, 10);
    if (!role) return;
    if (!Number.isFinite(parsed) || parsed < 0) return;
    result[role] = parsed;
  });
  return result;
}

function migrateHeirsArray(source, target) {
  if (!Array.isArray(source)) return target;
  const result = { ...target };
  source.forEach((entry) => {
    const role = entry?.role;
    const count = Number.parseInt(entry?.count, 10);
    if (!role || !Number.isFinite(count) || count <= 0) return;
    result[role] = (result[role] || 0) + count;
  });
  return result;
}

function safeResponse(parsed) {
  if (parsed && typeof parsed === 'object') return parsed;
  return null;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createInitialState();

    const base = createInitialState();
    const merged = { ...base };

    merged.step = typeof parsed.step === 'string' ? parsed.step : base.step;
    merged.screening = { ...base.screening, ...(parsed.screening || {}) };
    merged.deceased = { ...base.deceased, ...(parsed.deceased || {}) };
    const estateValue = parsed.estate?.value ?? parsed.estateValue ?? base.estate.value;
    merged.estate = { ...base.estate, ...(parsed.estate || {}), value: typeof estateValue === 'string' ? estateValue : String(estateValue ?? '') };

    const normalizedCounts = normalizeHeirsCounts(parsed.heirsCounts);
    merged.heirsCounts = migrateHeirsArray(parsed.heirs, normalizedCounts);

    const maybeResponse = parsed.lastResponse ?? parsed.lastResult ?? parsed.lastResultRaw;
    merged.lastResponse = safeResponse(maybeResponse);
    merged.lastPayload = parsed.lastPayload && typeof parsed.lastPayload === 'object' ? parsed.lastPayload : null;
    merged.lastError = typeof parsed.lastError === 'string' ? parsed.lastError : '';

    merged.version = VERSION;

    return merged;
  } catch (error) {
    console.warn('No se pudo cargar el estado del Flow Wizard', error);
    return createInitialState();
  }
}

function saveState(state) {
  try {
    const snapshot = JSON.stringify({ ...state });
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
