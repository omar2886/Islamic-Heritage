import { normalizeRoute } from './store/derive.js';

const formatHash = (route) => `#/${normalizeRoute(route)}`;

const parseHash = (hash) => {
  if (!hash) return null;
  const trimmed = String(hash).replace(/^#/, '');
  const parts = trimmed.split('/');
  const candidate = parts.find(Boolean);
  return candidate ? normalizeRoute(candidate) : null;
};

export function startRouter(store) {
  if (!store || typeof store.replaceRoute !== 'function') {
    throw new Error('[router] store with replaceRoute is required');
  }
  const apply = () => {
    const parsed = parseHash(window.location.hash);
    const route = normalizeRoute(parsed || store.getState().route);
    const current = store.getState().route;
    const targetHash = formatHash(route);
    if (!window.location.hash || window.location.hash !== targetHash) {
      window.location.replace(targetHash);
    }
    if (route !== current) store.replaceRoute(route, { source: 'router' });
  };
  window.addEventListener('hashchange', apply);
  apply();
  return () => window.removeEventListener('hashchange', apply);
}

export function navigate(route, { replace = false } = {}) {
  const targetHash = formatHash(route);
  if (replace) {
    window.location.replace(targetHash);
  } else if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }
}
