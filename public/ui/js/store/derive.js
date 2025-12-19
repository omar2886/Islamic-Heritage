import { ROLE_CATALOG, ROLE_SECTIONS, ROLE_SET, roleLabel } from '../domain/roles.js';
import { evaluateHardRules } from '../domain/rules-hard.js';
import { evaluateSoftWarnings } from '../domain/rules-soft.js';

export const ROUTES = ['wizard', 'builder', 'results'];
const DEFAULT_ROUTE = ROUTES[0];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const isObject = (value) => value !== null && typeof value === 'object';

export const WIZARD_STEPS = ['intro', 'roles', 'summary'];

const FRACTION_REGEX = /^(-?\d+)\s*\/\s*([1-9]\d*)$/;

const parseFraction = (value) => {
  const raw = typeof value === 'string' ? value.trim() : null;
  if (!raw) return null;
  const match = raw.match(FRACTION_REGEX);
  if (!match) return null;
  const numerator = Number.parseInt(match[1], 10);
  const denominator = Number.parseInt(match[2], 10);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return {
    raw,
    numerator,
    denominator,
    value: numerator / denominator,
  };
};

const fractionToPercent = (fraction) => {
  if (!fraction) return null;
  const percent = (fraction.numerator / fraction.denominator) * 100;
  const decimals = Math.abs(percent) >= 1 ? 2 : 4;
  return {
    value: percent,
    label: `${percent.toFixed(decimals)}%`,
    decimals,
  };
};

const parseAmount = (value) => {
  if (value === null || value === undefined) return null;
  const numeric =
    typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(numeric)) {
    return { raw: String(value) };
  }
  const decimals = Math.abs(numeric) >= 1 ? 2 : 4;
  return {
    raw: String(value),
    value: numeric,
    label: numeric.toFixed(decimals),
    decimals,
  };
};

const normalizeStringList = (list) =>
  Array.isArray(list)
    ? list
        .map((entry) => (typeof entry === 'string' ? entry : entry?.message || entry?.reason))
        .filter(Boolean)
    : [];

const normalizeAuditBlocks = (blocks) => {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block, index) => {
      const rule = block?.rule_id || block?.rule || block?.code || `block-${index + 1}`;
      const reason = block?.reason || block?.message || block?.note || null;
      const targets = Array.isArray(block?.targets) ? block.targets : [];
      return {
        rule: String(rule),
        reason: reason ? String(reason) : null,
        targets,
      };
    })
    .filter(Boolean);
};

const normalizeExplainSteps = (steps) => {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((step, index) => {
      const stage = typeof step?.stage === 'string' ? step.stage.toLowerCase() : 'general';
      const rule = typeof step?.rule === 'string' ? step.rule : `step-${index + 1}`;
      const note = typeof step?.note === 'string' ? step.note : null;
      const rawChanges = isObject(step?.changes) ? step.changes : {};
      const changes = Object.entries(rawChanges).map(([roleId, change]) => {
        const before = parseFraction(change?.before ?? change?.from ?? null);
        const after = parseFraction(change?.after ?? change?.to ?? null);
        return {
          roleId,
          label: roleLabel(roleId),
          before,
          after,
          percentBefore: fractionToPercent(before),
          percentAfter: fractionToPercent(after),
        };
      });
      return {
        id: `${stage}-${rule}-${index}`,
        stage,
        rule,
        note,
        changes,
        byPerson: isObject(step?.byPerson) ? step.byPerson : {},
        targets: Array.isArray(step?.targets) ? step.targets : [],
      };
    })
    .filter(Boolean);
};

const buildResultRows = (output) => {
  const groupShares = isObject(output?.group_shares) ? output.group_shares : {};
  const amounts = isObject(output?.amounts_by_role) ? output.amounts_by_role : null;
  const rows = Object.entries(groupShares).map(([roleId, share]) => {
    const fraction = parseFraction(share);
    const percentage = fractionToPercent(fraction);
    const amount = amounts && Object.prototype.hasOwnProperty.call(amounts, roleId)
      ? parseAmount(amounts[roleId])
      : null;
    return {
      roleId,
      label: roleLabel(roleId),
      fraction,
      fractionText: typeof share === 'string' ? share : String(share ?? ''),
      percentage,
      amount,
    };
  });
  rows.sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return rows;
};

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

const deriveResults = (results) => {
  const status = ['idle', 'pending', 'success', 'error', 'aborted'].includes(results?.status)
    ? results.status
    : 'idle';
  const lastResponse = isObject(results?.lastResponse) ? results.lastResponse : null;
  const output = isObject(lastResponse?.output) ? lastResponse.output : null;
  const ok = lastResponse?.ok === true;
  const warnings = normalizeStringList(output?.warnings || lastResponse?.warnings);
  const auditBlocks = normalizeAuditBlocks(output?.audit?.blocks_applied);
  const explainSteps = normalizeExplainSteps(output?.explain?.steps);
  const rows = buildResultRows(output);
  const sumFinal = parseFraction(output?.sum_final);
  const payload = results?.payload ?? null;
  const errorMessage =
    typeof results?.error === 'string'
      ? results.error
      : typeof lastResponse?.error === 'string'
        ? lastResponse.error
        : null;
  const currency = typeof output?.currency === 'string' ? output.currency : null;
  const hasResults = rows.length > 0 || !!output || status === 'error';

  return {
    status,
    ok,
    warnings,
    auditBlocks,
    explainSteps,
    rows,
    sumFinal,
    payload,
    currency,
    errorMessage,
    lastComputedAt: results?.lastComputedAt ?? null,
    hasResults,
  };
};

export function deriveState(baseState, defaults = {}) {
  const route = normalizeRoute(baseState.route ?? defaults.route);
  const wizardBase = { ...(defaults.wizard || {}), ...(baseState.wizard || {}) };
  const { wizard, derivedWizard } = deriveWizard(wizardBase, defaults.wizard || {});
  const builder = { ...(defaults.builder || {}), ...(baseState.builder || {}) };
  const results = { ...(defaults.results || {}), ...(baseState.results || {}) };
  const ui = { ...(defaults.ui || {}), ...(baseState.ui || {}) };
  const meta = { ...(defaults.meta || {}), ...(baseState.meta || {}) };
  const derivedResults = deriveResults(results);

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
    hasResults: derivedResults.hasResults,
    results: derivedResults,
    lastRoute: baseState.route,
    enabledRoles: derivedWizard.enabledRoles,
    hardBlocks: derivedWizard.hardBlocks,
    disabledRoles: derivedWizard.disabledRoles,
    softWarnings: derivedWizard.softWarnings,
    payloadPreview: buildPayloadPreview(wizard.selections, derivedWizard.enabledRoles),
  };

  return { ...trimmed, derived };
}
