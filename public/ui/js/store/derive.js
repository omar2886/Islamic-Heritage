import { ROLE_CATALOG, ROLE_SECTIONS, ROLE_SET } from '../domain/roles.js';
import { evaluateHardRules } from '../domain/rules-hard.js';
import { evaluateSoftWarnings } from '../domain/rules-soft.js';

export const ROUTES = ['wizard', 'builder', 'results'];
const DEFAULT_ROUTE = ROUTES[0];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const isObject = (value) => value !== null && typeof value === 'object';

export const WIZARD_STEPS = ['intro', 'roles', 'summary'];

const BASE_WIZARD_SECTIONS = ROLE_SECTIONS.reduce(
  (acc, section) => ({
    ...acc,
    [section.id]: ['couple', 'ascendants', 'descendants'].includes(section.id),
  }),
  {},
);

export const DEFAULT_WIZARD_SECTIONS = Object.freeze(BASE_WIZARD_SECTIONS);

export const createDefaultWizardState = () => ({
  step: 'intro',
  selections: {},
  sections: { ...DEFAULT_WIZARD_SECTIONS },
  lastTouchedRole: null,
});

export function normalizeRoute(route) {
  const trimmed = String(route ?? '').replace(/^#?\/?/, '').toLowerCase();
  return ROUTES.includes(trimmed) ? trimmed : DEFAULT_ROUTE;
}

const normalizeWizardStep = (value) => (WIZARD_STEPS.includes(value) ? value : 'intro');

const normalizeSections = (rawSections = {}, defaults = {}) => {
  const merged = {
    ...DEFAULT_WIZARD_SECTIONS,
    ...(defaults.sections || {}),
    ...(rawSections || {}),
  };
  return ROLE_SECTIONS.reduce((acc, section) => {
    acc[section.id] = !!merged[section.id];
    return acc;
  }, {});
};

const normalizeSelections = (rawSelections = {}, enabledSections = {}) => {
  const allowedSections = new Set(
    ROLE_SECTIONS.filter((section) => enabledSections[section.id]).map((section) => section.id),
  );
  const normalized = {};

  Object.entries(rawSelections || {}).forEach(([roleId, value]) => {
    if (!ROLE_SET.has(roleId)) return;
    const roleMeta = ROLE_CATALOG.find((item) => item.id === roleId);
    if (!roleMeta || !allowedSections.has(roleMeta.section)) return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    normalized[roleId] = Math.min(parsed, 100);
  });

  return normalized;
};

function deriveWizard(baseWizard, defaults = {}) {
  const sections = normalizeSections(baseWizard.sections, defaults);
  const selections = normalizeSelections(baseWizard.selections, sections);
  const lastTouchedRole = typeof baseWizard.lastTouchedRole === 'string' ? baseWizard.lastTouchedRole : null;

  const { cleanedSelections, hardBlocks, disabledRoles } = evaluateHardRules({
    selections,
    sections,
    lastTouchedRole,
  });

  const enabledRoles = ROLE_CATALOG.filter(
    (role) => sections[role.section] && !disabledRoles.has(role.id),
  ).map((role) => role.id);

  const softWarnings = evaluateSoftWarnings({
    selections: cleanedSelections,
    enabledRoles,
    sections,
  });

  return {
    wizard: {
      step: normalizeWizardStep(baseWizard.step),
      sections,
      selections: cleanedSelections,
      lastTouchedRole,
    },
    derivedWizard: {
      enabledRoles,
      hardBlocks,
      disabledRoles: Array.from(disabledRoles),
      softWarnings,
    },
  };
}

const buildPayloadPreview = (selections = {}, enabledRoles = []) => {
  const enabledSet = new Set(enabledRoles || []);
  const heirs = Object.entries(selections || {})
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .filter(([roleId]) => enabledSet.size === 0 || enabledSet.has(roleId))
    .map(([role, count]) => ({ role, count }))
    .filter((entry) => entry.count > 0);

  return {
    heirs,
  };
};

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
  const wizardBase = { ...(defaults.wizard || {}), ...(baseState.wizard || {}) };
  const { wizard, derivedWizard } = deriveWizard(wizardBase, defaults.wizard || {});
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
    enabledRoles: derivedWizard.enabledRoles,
    hardBlocks: derivedWizard.hardBlocks,
    disabledRoles: derivedWizard.disabledRoles,
    softWarnings: derivedWizard.softWarnings,
    payloadPreview: buildPayloadPreview(wizard.selections, derivedWizard.enabledRoles),
  };

  return { ...trimmed, derived };
}
