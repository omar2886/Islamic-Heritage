import { CURRENT_SCHEMA_VERSION, loadState, saveState, clearPersistedState } from "./persist.js";
import { deriveState, normalizeRoute } from "./derive.js";
import { EXPECTED_ROLES } from "../api/contract.js";
import { ROLE_GROUPS } from "../domain/roles.js";
import { sanitizeTree, ensureTree, deriveHeirsByRoleFromTree } from "../domain/familyTree.js";

function clone(value){
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function clampCount(value, min = 0, max = 100){
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  const safe = Math.trunc(num);
  return Math.min(max, Math.max(min, safe));
}

const ROLE_LIMITS = {
  husband: 1,
  wife: 4,
  father: 1,
  mother: 1,
  paternal_grandfather: 1,
  paternal_grandmother: 1,
  maternal_grandmother: 1,
  paternal_great_grandmother: 1,
  maternal_great_grandmother: 1,
};

function clampRoleCount(role, value){
  const max = ROLE_LIMITS[role] ?? 100;
  return clampCount(value, 0, max);
}

function makeDefaultWizard(){
  return {
    deceased_sex: null,
    estate_value: "",
    currency: "MAD",
    flags: {
      audit: true,
      explain: true,
    },
    spouse: {
      enabled: false,
      wives_count: 0,
      husband_present: false,
    },
    descendants: {
      son: 0,
      daughter: 0,
      sons_son: 0,
      sons_daughter: 0,
    },
    parents: {
      father: false,
      mother: false,
    },
  };
}

function makeDefaultBuilder(){
  return {
    mode: "tree",          // "tree" | "roles"
    tree: null,
    treeSelectedId: null,

    fromWizardApplied: false,
    heirsByRole: {},
    wizardHashApplied: null,
    payloadPreview: null,
  };
}

function makeDefaultResults(){
  return {
    status: "idle",    // idle | running | ok | error
    error: null,
    response: null,
    lastRunAt: null,
  };
}

export const DEFAULT_STATE = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  boot: {
    status: "idle",     // idle | checking | ready | blocked
    error: null,
    rolesServer: null,
    diff: null,
  },
  ui: {
    route: "wizard",
    focus: { key: null },
    toasts: [],
    modal: null,
  },
  wizard: makeDefaultWizard(),
  builder: makeDefaultBuilder(),
  results: makeDefaultResults(),
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
    boot: base.boot,
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

  const boot = safe?.boot && typeof safe.boot === "object" ? safe.boot : {};
  out.boot = {
    status: typeof boot.status === "string" ? boot.status : "idle",
    error: boot.error ?? null,
    rolesServer: Array.isArray(boot.rolesServer) ? boot.rolesServer : null,
    diff: boot.diff ?? null,
  };

  const wizard = safe?.wizard && typeof safe.wizard === "object" ? safe.wizard : {};
  const legacyEstate = wizard.estate && typeof wizard.estate === "object" ? wizard.estate : {};
  let estateValue = "";
  if (typeof wizard.estate_value === "string") estateValue = wizard.estate_value;
  else if (typeof legacyEstate.value === "string") estateValue = legacyEstate.value;
  else if (typeof legacyEstate.value === "number" && Number.isFinite(legacyEstate.value)) estateValue = String(legacyEstate.value);

  let currency = "MAD";
  if (typeof wizard.currency === "string") currency = wizard.currency;
  else if (typeof legacyEstate.currency === "string") currency = legacyEstate.currency;

  const wizardFlags = wizard.flags && typeof wizard.flags === "object" ? wizard.flags : {};
  const audit = typeof wizardFlags.audit === "boolean" ? wizardFlags.audit : true;
  const explain = typeof wizardFlags.explain === "boolean" ? wizardFlags.explain : true;

  const deceasedSex = wizard.deceased_sex === "male" || wizard.deceased_sex === "female" ? wizard.deceased_sex : null;
  const spouse = wizard.spouse && typeof wizard.spouse === "object" ? wizard.spouse : {};
  const spouseEnabled = spouse.enabled === true;
  let wivesCount = clampCount(spouse.wives_count, 0, 4);
  let husbandPresent = spouse.husband_present === true;
  if (deceasedSex !== "male") wivesCount = 0;
  if (deceasedSex !== "female") husbandPresent = false;
  if (!spouseEnabled){
    wivesCount = 0;
    husbandPresent = false;
  }

  const descendants = wizard.descendants && typeof wizard.descendants === "object" ? wizard.descendants : {};
  const parents = wizard.parents && typeof wizard.parents === "object" ? wizard.parents : {};

  out.wizard = {
    deceased_sex: deceasedSex,
    estate_value: typeof estateValue === "string" ? estateValue : "",
    currency: typeof currency === "string" ? currency : "MAD",
    flags: {
      audit,
      explain,
    },
    spouse: {
      enabled: spouseEnabled,
      wives_count: wivesCount,
      husband_present: husbandPresent,
    },
    descendants: {
      son: clampCount(descendants.son),
      daughter: clampCount(descendants.daughter),
      sons_son: clampCount(descendants.sons_son),
      sons_daughter: clampCount(descendants.sons_daughter),
    },
    parents: {
      father: parents.father === true,
      mother: parents.mother === true,
    },
  };

  // builder
  const builder = safe?.builder && typeof safe.builder === "object" ? safe.builder : {};
  let mode = "tree";
  if (builder.mode === "tree" || builder.mode === "roles"){
    mode = builder.mode;
  } else {
    const hasRoles = builder.heirsByRole && Object.values(builder.heirsByRole).some((v) => Number(v) > 0);
    mode = hasRoles ? "roles" : "tree";
  }

  const tree = ensureTree(sanitizeTree(builder.tree), out.wizard);

  let rawHeirs = {};
  if (mode === "tree"){
    rawHeirs = deriveHeirsByRoleFromTree(tree).heirsByRole;
  } else {
    rawHeirs = builder.heirsByRole || {};
  }

  const heirsByRole = {};
  EXPECTED_ROLES.forEach((role) => {
    heirsByRole[role] = clampRoleCount(role, rawHeirs?.[role] ?? 0);
  });

  if (!out.wizard?.spouse?.enabled){
    heirsByRole.husband = 0;
    heirsByRole.wife = 0;
  }
  if (out.wizard?.deceased_sex === "male"){
    heirsByRole.husband = 0;
  }else if (out.wizard?.deceased_sex === "female"){
    heirsByRole.wife = 0;
  }else{
    heirsByRole.husband = 0;
    heirsByRole.wife = 0;
  }

  const payloadPreview = {
    heirs: ROLE_GROUPS.flatMap((group) => group.roles.map((role) => ({
      role,
      count: Number(heirsByRole[role] || 0),
    })).filter((item) => item.count > 0)),
  };

  out.builder = {
    ...makeDefaultBuilder(),
    mode,
    fromWizardApplied: !!builder.fromWizardApplied,
    wizardHashApplied: builder.wizardHashApplied ? String(builder.wizardHashApplied) : null,
    heirsByRole,
    payloadPreview: payloadPreview || { heirs: [] },
    tree,
    treeSelectedId: typeof builder.treeSelectedId === "string" ? builder.treeSelectedId : null,
  };

  const results = safe?.results && typeof safe.results === "object" ? safe.results : {};
  const allowedStatuses = new Set(["idle", "running", "ok", "error"]);
  out.results = {
    status: allowedStatuses.has(results.status) ? results.status : "idle",
    error: typeof results.error === "string" ? results.error : null,
    response: results.response && typeof results.response === "object" ? results.response : null,
    lastRunAt: Number.isFinite(results.lastRunAt) ? results.lastRunAt : null,
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
