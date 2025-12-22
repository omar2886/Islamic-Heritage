// public/ui/js/store/store.js
import { EXPECTED_ROLES, ensureTree, sanitizeTree } from "../domain/familyTree.js";

const STORE_KEY = "heritage_builder_state_v3";

function clampCount(value, min = 0, max = 100){
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  const safe = Math.trunc(num);
  return Math.min(max, Math.max(min, safe));
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
    spouse: { enabled: false, husband_present: false, wives_count: 0 },
    descendants: { son: 0, daughter: 0, sons_son: 0, sons_daughter: 0, son_of_son: 0, daughter_of_son: 0 },
    parents: { enabled: false, father_alive: true, mother_alive: true },
    grandparents: { enabled: false },
    siblings: { enabled: false },
    uncles: { enabled: false },
  };
}

function normalizeTreeUi(raw){
  const ui = (raw && typeof raw === "object") ? raw : {};

  const collapsedLevels = {};
  const source =
    (ui.collapsedLevels && typeof ui.collapsedLevels === "object") ? ui.collapsedLevels :
    (ui.collapsed && typeof ui.collapsed === "object") ? ui.collapsed :
    {};

  Object.entries(source).forEach(([k, v]) => {
    if (v === true) collapsedLevels[k] = true;
  });

  return {
    search: typeof ui.search === "string" ? ui.search : "",
    collapsedLevels,
    // keep legacy keys for older UI code (if any)
    collapsed: collapsedLevels,
    showDisconnected: ui.showDisconnected !== false,
    peopleListCollapsed: ui.peopleListCollapsed === true,
  };
}

function makeDefaultBuilder(){
  return {
    mode: "tree",          // "tree" | "roles"
    tree: null,
    treeSelectedId: null,
    treeUi: { search: "", collapsedLevels: {}, showDisconnected: true, peopleListCollapsed: false },

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

function makeDefaultUi(){
  return {
    toasts: [],
    modal: null,
  };
}

function safeJsonParse(s){
  try { return JSON.parse(s); } catch { return null; }
}

function sanitizeState(input){
  const s = input && typeof input === "object" ? input : {};

  // Wizard
  const wizardRaw = s.wizard && typeof s.wizard === "object" ? s.wizard : {};
  const wizard = makeDefaultWizard();
  wizard.deceased_sex = (wizardRaw.deceased_sex === "male" || wizardRaw.deceased_sex === "female") ? wizardRaw.deceased_sex : null;
  wizard.estate_value = typeof wizardRaw.estate_value === "string" ? wizardRaw.estate_value : "";
  wizard.currency = typeof wizardRaw.currency === "string" ? wizardRaw.currency : "MAD";
  wizard.flags.audit = wizardRaw.flags?.audit !== false;
  wizard.flags.explain = wizardRaw.flags?.explain !== false;

  // Keep old wizard keys as is (backward compatibility for now)
  if (wizardRaw.spouse && typeof wizardRaw.spouse === "object"){
    wizard.spouse = {
      enabled: wizardRaw.spouse.enabled === true,
      husband_present: wizardRaw.spouse.husband_present === true,
      wives_count: clampCount(wizardRaw.spouse.wives_count, 0, 4),
    };
  }
  if (wizardRaw.descendants && typeof wizardRaw.descendants === "object"){
    wizard.descendants = {
      son: clampCount(wizardRaw.descendants.son, 0, 50),
      daughter: clampCount(wizardRaw.descendants.daughter, 0, 50),
      sons_son: clampCount(wizardRaw.descendants.sons_son, 0, 50),
      sons_daughter: clampCount(wizardRaw.descendants.sons_daughter, 0, 50),
      son_of_son: clampCount(wizardRaw.descendants.son_of_son, 0, 50),
      daughter_of_son: clampCount(wizardRaw.descendants.daughter_of_son, 0, 50),
    };
  }
  if (wizardRaw.parents && typeof wizardRaw.parents === "object"){
    wizard.parents = {
      enabled: wizardRaw.parents.enabled === true,
      father_alive: wizardRaw.parents.father_alive !== false,
      mother_alive: wizardRaw.parents.mother_alive !== false,
    };
  }

  // Builder
  const builderRaw = s.builder && typeof s.builder === "object" ? s.builder : {};
  const mode = builderRaw.mode === "roles" ? "roles" : "tree";

  const tree = builderRaw.tree ? ensureTree(sanitizeTree(builderRaw.tree), wizard) : null;

  const heirsByRole = {};
  const rawHeirs = builderRaw.heirsByRole && typeof builderRaw.heirsByRole === "object" ? builderRaw.heirsByRole : {};
  const roleSet = new Set(EXPECTED_ROLES);
  for (const role of roleSet){
    heirsByRole[role] = clampCount(rawHeirs[role] || 0, 0, 999);
  }

  // Wizard constraints apply only in roles mode.
  if (mode === "roles"){
    if (!wizard?.spouse?.enabled){
      heirsByRole.husband = 0;
      heirsByRole.wife = 0;
      heirsByRole.wives = 0;
    }
    if (wizard?.deceased_sex === "female"){
      heirsByRole.wives = 0;
      heirsByRole.wife = 0;
    }
    if (wizard?.deceased_sex === "male"){
      heirsByRole.husband = 0;
    }
  }

  const payloadPreview = {
    heirs: Array.from(roleSet)
      .filter((role) => heirsByRole[role] > 0)
      .map((role) => ({ role, count: heirsByRole[role] })),
  };

  const treeUi = normalizeTreeUi(builderRaw.treeUi);

  const builder = {
    mode,
    tree,
    heirsByRole,
    fromWizardApplied: Boolean(builderRaw.fromWizardApplied),
    wizardHashApplied: typeof builderRaw.wizardHashApplied === "string" ? builderRaw.wizardHashApplied : null,
    payloadPreview,

    treeSelectedId: typeof builderRaw.treeSelectedId === "string" ? builderRaw.treeSelectedId : null,
    treeUi,
  };

  // Results + UI
  const results = makeDefaultResults();
  const ui = makeDefaultUi();

  return { wizard, builder, results, ui };
}

export function createStore(){
  let state = {
    wizard: makeDefaultWizard(),
    builder: makeDefaultBuilder(),
    results: makeDefaultResults(),
    ui: makeDefaultUi(),
  };

  // Load persisted state.
  const raw = typeof localStorage !== "undefined" ?
    safeJsonParse(localStorage.getItem(STORE_KEY)) : null;
  if (raw){
    state = sanitizeState(raw);
  }

  const listeners = new Set();

  function notify(){
    for (const fn of listeners) fn();
  }

  function persist(){
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  return {
    getState(){
      return state;
    },
    setState(updater, meta = {}){
      const next = typeof updater === "function" ? updater(state) : updater;
      state = sanitizeState({ ...state, ...next });
      notify();
      if (meta.persist) persist();
    },
    subscribe(fn){
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset(){
      state = sanitizeState({
        wizard: makeDefaultWizard(),
        builder: makeDefaultBuilder(),
        results: makeDefaultResults(),
        ui: makeDefaultUi(),
      });
      notify();
      persist();
    },
  };
}
