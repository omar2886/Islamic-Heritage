import { CURRENT_SCHEMA_VERSION, loadState, saveState, clearPersistedState } from "./persist.js";
import { deriveState, normalizeRoute } from "./derive.js";

function clone(value){
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULT_STATE = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  ui: {
    route: "wizard",
    focus: { key: null },
    toasts: [],
    modal: null,
  },
  wizard: {},
  builder: {},
  results: {},
  meta: {
    dirty: false,
    lastTouched: null,
  },
};

function sanitize(candidate){
  const base = clone(DEFAULT_STATE);
  const safe = (candidate && typeof candidate === "object") ? candidate : {};
  const route = normalizeRoute(safe?.ui?.route ?? base.ui.route);

  const out = {
    ...base,
    ...safe,
    ui: {
      ...base.ui,
      ...(safe.ui || {}),
      route,
      toasts: Array.isArray(safe?.ui?.toasts) ? safe.ui.toasts : [],
      focus: (safe?.ui?.focus && typeof safe.ui.focus === "object") ? safe.ui.focus : { key: null },
      modal: safe?.ui?.modal ?? null,
    },
    meta: {
      ...base.meta,
      ...(safe.meta || {}),
      dirty: false,
      lastTouched: null,
    },
  };

  return out;
}

export function createStore(){
  const persisted = loadState();
  let state = sanitize(persisted || DEFAULT_STATE);
  let derived = deriveState(state);

  const subs = new Set();

  function getState(){ return state; }
  function getDerived(){ return derived; }

  function setState(updater, meta = {}){
    const prev = state;
    const next = typeof updater === "function" ? updater(prev) : updater;
    state = sanitize(next);

    derived = deriveState(state);

    const touched = meta && meta.persist === false ? false : true;
    if (touched){
      const toPersist = clone(state);
      toPersist.meta = { ...toPersist.meta, dirty: false, lastTouched: null };
      saveState(toPersist);
    }

    subs.forEach((fn) => fn({ state, derived, prev }));
  }

  function subscribe(fn){
    subs.add(fn);
    return () => subs.delete(fn);
  }

  function reset(){
    clearPersistedState();
    setState(DEFAULT_STATE, { persist: false });
  }

  return { getState, getDerived, setState, subscribe, reset };
}
