// public/ui/js/store/store.js  (REEMPLAZAR ENTERO)
import { loadState, persistState } from "./persist.js";

export function createStore(initialState){
  let state = initialState;
  const subs = new Set();

  function getState(){ return state; }

  function setState(updater, meta){
    const next = typeof updater === "function" ? updater(state) : updater;
    state = next;
    for (const fn of subs) fn(state);

    if (meta && meta.persist){
      persistState(state);
    }
  }

  function subscribe(fn){
    subs.add(fn);
    return () => subs.delete(fn);
  }

  // bootstrap persistence
  const persisted = loadState();
  if (persisted && typeof persisted === "object"){
    state = { ...state, ...persisted };
  }

  return { getState, setState, subscribe };
}
