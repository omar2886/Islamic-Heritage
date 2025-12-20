import { CURRENT_SCHEMA_VERSION, loadState, saveState, clearPersistedState } from "./persist.js";
import { deriveState, normalizeRoute } from "./derive.js";
import { EXPECTED_ROLES } from "../api/contract.js";
import { ROLE_GROUPS } from "../domain/roles.js";

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
    estate: {
      value: "",
      currency: "MAD",
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
  const estate = wizard.estate && typeof wizard.estate === "object" ? wizard.estate : {};
  let estateValue = "";
  if (typeof estate.value === "string") estateValue = estate.value;
  else if (typeof estate.value === "number" && Number.isFinite(estate.value)) estateValue = String(estate.value);
  estateValue = String(estateValue || "").trim();

  let currency = "";
  if (typeof estate.currency === "string") currency = estate.currency;
  currency = String(currency || "").trim().toUpperCase();
  if (currency !== "" && !/^[A-Z]{3}$/.test(currency)) currency = "MAD";
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
    estate: {
      value: estateValue,
      currency,
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

  const builder = safe?.builder && typeof safe.builder === "object" ? safe.builder : {};
  const heirsByRole = {};
  EXPECTED_ROLES.forEach((role) => {
    heirsByRole[role] = clampRoleCount(role, builder?.heirsByRole?.[role] ?? 0);
  });

  if (out.wizard.deceased_sex === "male"){
    heirsByRole.husband = 0;
  } else if (out.wizard.deceased_sex === "female"){
    heirsByRole.wife = 0;
  }
  if (!out.wizard.spouse.enabled){
    heirsByRole.wife = 0;
    heirsByRole.husband = 0;
  }

  const payloadHeirs = [];
  ROLE_GROUPS.forEach((group) => {
    group.roles.forEach((role) => {
      if (!Object.prototype.hasOwnProperty.call(heirsByRole, role)) return;
      const count = heirsByRole[role];
      if (count > 0){
        payloadHeirs.push({ role, count });
      }
    });
  });

  out.builder = {
    fromWizardApplied: builder.fromWizardApplied === true,
    heirsByRole,
    wizardHashApplied: typeof builder.wizardHashApplied === "string" ? builder.wizardHashApplied : null,
    payloadPreview: payloadHeirs.length ? { heirs: payloadHeirs } : null,
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
