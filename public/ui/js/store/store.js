import { createDefaultWizardState, deriveState, normalizeRoute } from './derive.js';
import { CURRENT_SCHEMA_VERSION, clearPersistedState, loadState, persistState } from './persist.js';

const clone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

export const DEFAULT_STATE = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  route: 'wizard',
  wizard: createDefaultWizardState(),
  builder: {
    draft: {},
    notes: '',
  },
  results: {
    payload: null,
    lastComputedAt: null,
  },
  ui: {
    modal: null,
    toast: null,
    focus: {},
  },
  meta: {
    dirty: false,
    lastTouched: null,
  },
};

const sanitizeState = (candidate) => {
  const route = normalizeRoute(candidate?.route ?? DEFAULT_STATE.route);
  return {
    ...DEFAULT_STATE,
    ...(candidate || {}),
    route,
    wizard: { ...DEFAULT_STATE.wizard, ...(candidate?.wizard || {}) },
    builder: { ...DEFAULT_STATE.builder, ...(candidate?.builder || {}) },
    results: { ...DEFAULT_STATE.results, ...(candidate?.results || {}) },
    ui: { ...DEFAULT_STATE.ui, ...(candidate?.ui || {}) },
    meta: { ...DEFAULT_STATE.meta, ...(candidate?.meta || {}) },
  };
};

function createStore() {
  let state = deriveState(loadState(DEFAULT_STATE), DEFAULT_STATE);
  const subscribers = new Set();

  const notify = (meta) => {
    subscribers.forEach((callback) => {
      try {
        callback(state, meta);
      } catch (err) {
        console.error('[store] subscriber failed', err);
      }
    });
  };

  const setState = (updater, meta = {}) => {
    const nextBase = typeof updater === 'function' ? updater(state) : updater;
    const mergedBase = sanitizeState(nextBase);
    mergedBase.meta = {
      ...mergedBase.meta,
      dirty: meta.markDirty !== false ? true : mergedBase.meta?.dirty || false,
      lastTouched: mergedBase.meta?.lastTouched ?? Date.now(),
    };
    state = deriveState(mergedBase, DEFAULT_STATE);
    persistState(state);
    notify(meta);
    return state;
  };

  const replaceRoute = (route, meta = {}) =>
    setState(
      (current) => ({
        ...current,
        route: normalizeRoute(route ?? current.route),
      }),
      { ...meta, markDirty: false, source: 'route' },
    );

  const reset = (meta = {}) => {
    clearPersistedState();
    state = deriveState(clone(DEFAULT_STATE), DEFAULT_STATE);
    notify({ ...meta, source: 'reset' });
    return state;
  };

  const subscribe = (callback, options = {}) => {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);
    if (options.immediate) {
      try {
        callback(state, { source: 'init' });
      } catch (err) {
        console.error('[store] subscriber failed', err);
      }
    }
    return () => subscribers.delete(callback);
  };

  const getState = () => state;

  return {
    getState,
    setState,
    replaceRoute,
    reset,
    subscribe,
  };
}

export const store = createStore();
