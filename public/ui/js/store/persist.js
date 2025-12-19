const STORAGE_KEY = 'ih:ui:state';
export const CURRENT_SCHEMA_VERSION = 1;

const clone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const safeParse = (value) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.warn('[persist] parse error', err);
    return null;
  }
};

const hasStorage = () => {
  try {
    return typeof localStorage !== 'undefined';
  } catch (err) {
    console.warn('[persist] localStorage unavailable', err);
    return false;
  }
};

const stripDerived = (state) => {
  if (!state || typeof state !== 'object') return {};
  const { derived, ...rest } = state;
  return rest;
};

export function migrateState(rawState, defaults) {
  if (!rawState || typeof rawState !== 'object') return clone(defaults);
  const version = Number(rawState.schemaVersion) || 0;
  let migrated = {
    ...clone(defaults),
    ...stripDerived(rawState),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  if (version < CURRENT_SCHEMA_VERSION) {
    migrated.meta = {
      ...(defaults.meta || {}),
      ...(rawState.meta || {}),
      migratedFrom: version || null,
    };
  } else if (version > CURRENT_SCHEMA_VERSION) {
    migrated = clone(defaults);
  }
  return migrated;
}

export function loadState(defaults) {
  if (!hasStorage()) return clone(defaults);
  const saved = safeParse(localStorage.getItem(STORAGE_KEY));
  return migrateState(saved, defaults);
}

export function persistState(state) {
  if (!hasStorage()) return;
  const payload = stripDerived(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[persist] unable to save state', err);
  }
}

export function clearPersistedState() {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[persist] unable to clear state', err);
  }
}
