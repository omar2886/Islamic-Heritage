export const ROUTES = ['wizard', 'builder', 'results'];
const DEFAULT_ROUTE = ROUTES[0];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const isObject = (value) => value !== null && typeof value === 'object';

export function normalizeRoute(route) {
  const trimmed = String(route ?? '').replace(/^#?\/?/, '').toLowerCase();
  return ROUTES.includes(trimmed) ? trimmed : DEFAULT_ROUTE;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!hasOwn(b, key) || !deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

export function deriveState(baseState, defaults = {}) {
  const route = normalizeRoute(baseState.route ?? defaults.route);
  const wizard = { ...(defaults.wizard || {}), ...(baseState.wizard || {}) };
  const builder = { ...(defaults.builder || {}), ...(baseState.builder || {}) };
  const results = { ...(defaults.results || {}), ...(baseState.results || {}) };
  const ui = { ...(defaults.ui || {}), ...(baseState.ui || {}) };
  const meta = { ...(defaults.meta || {}), ...(baseState.meta || {}) };

  const trimmed = { ...baseState, wizard, builder, results, ui, meta, route };
  const hasUserData = !deepEqual(
    { wizard, builder, results },
    {
      wizard: defaults.wizard || {},
      builder: defaults.builder || {},
      results: defaults.results || {},
    },
  );

  const derived = {
    route,
    isWizard: route === 'wizard',
    isBuilder: route === 'builder',
    isResults: route === 'results',
    hasUserData,
    hasResults: !!results.payload,
    lastRoute: baseState.route,
  };

  return { ...trimmed, derived };
}
