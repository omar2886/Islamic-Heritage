import { normalizeRoute } from "./store/derive.js";

function parseHash(){
  const raw = String(location.hash || "");
  if (!raw || raw === "#") return "wizard";
  const m = raw.match(/^#\/([a-zA-Z0-9_-]+)$/);
  if (!m) return "wizard";
  return normalizeRoute(m[1]);
}

export function initRouter(store){
  function applyRoute(){
    const route = parseHash();
    store.setState((s) => ({
      ...s,
      ui: { ...s.ui, route },
    }));
  }

  window.addEventListener("hashchange", applyRoute);

  // Siempre aplica route inicial
  if (!location.hash || location.hash === "#"){
    location.hash = "#/wizard";
  }
  applyRoute();

  return () => window.removeEventListener("hashchange", applyRoute);
}

// Alias para compatibilidad con app.js
export function startRouter(store, _opts = {}){
  return initRouter(store);
}
