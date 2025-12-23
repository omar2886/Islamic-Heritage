// public/ui/js/store/store.js

const STORE_KEY = "heritage_ui_state_v2";

function clampCount(x, min, max){
  const n = Number(x);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function makeDefaultWizard(){
  return {
    deceased_sex: null, // male | female | null
    estate_value: "",
    currency: "MAD",
    flags: {
      audit: true,
      explain: true,
    },
    parents: {
      father: false,
      mother: false,
    },
    spouse: {
      enabled: false,
      husband_present: false,
      wives_count: 0,
    },
    descendants: {
      son: 0,
      daughter: 0,
      sons_son: 0,
      sons_daughter: 0,
      son_of_son: 0,
      daughter_of_son: 0,
    },
    siblings: {
      full_brother: 0,
      full_sister: 0,
      consanguine_brother: 0,
      consanguine_sister: 0,
      uterine_brother: 0,
      uterine_sister: 0,
    },
    uncles: {
      paternal_uncle: 0,
      paternal_uncle_son: 0,
      paternal_uncles_daughter: 0,
      paternal_uncle_sons_daughter: 0,
      consanguine_paternal_uncle: 0,
      consanguine_paternal_uncle_son: 0,
      consanguine_paternal_uncles_daughter: 0,
      consanguine_paternal_uncle_sons_daughter: 0,
    },
    grandparents: {
      paternal_grandfather: false,
      paternal_grandmother: false,
      maternal_grandmother: false,
      paternal_great_grandmother: 0,
      maternal_great_grandmother: 0,
    },
  };
}

function makeDefaultBuilder(){
  return {
    mode: "tree", // tree | roles
    tree: null,
    treeSelectedId: null,
    treeUi: { search: "", collapsedLevels: {}, showDisconnected: true, peopleListCollapsed: false, modal: null },

    fromWizardApplied: false,
    heirsByRole: {},
    wizardHashApplied: null,
    payloadPreview: null,
  };
}

function makeDefaultResults(){
  return {
    status: "idle", // idle | running | ok | error
    error: null,
    response: null,
    lastPayload: null,
    lastRunAt: null,
    finishedAt: null,
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

function makePersistSnapshot(state){
  const s = state && typeof state === "object" ? state : {};
  const wizard = s.wizard && typeof s.wizard === "object" ? s.wizard : {};

  const builderRaw = s.builder && typeof s.builder === "object" ? s.builder : {};
  const treeUiRaw = builderRaw.treeUi && typeof builderRaw.treeUi === "object" ? builderRaw.treeUi : {};
  const builder = {
    ...builderRaw,
    treeUi: { ...treeUiRaw, modal: null },
  };

  const results = s.results && typeof s.results === "object" ? s.results : {};

  // Persistimos solo datos de caso. NO persistimos ui.route, boot, modales ni toasts.
  return {
    wizard,
    builder,
    results,
    ui: { toasts: [] },
  };
}

function sanitizeResults(raw){
  const r = (raw && typeof raw === "object") ? raw : {};
  const out = makeDefaultResults();
  out.status = (r.status === "running" || r.status === "ok" || r.status === "error") ? r.status : "idle";
  out.error = typeof r.error === "string" ? r.error : null;
  out.response = r.response ?? null;
  out.lastPayload = r.lastPayload ?? null;
  out.lastRunAt = Number.isFinite(Number(r.lastRunAt)) ? Number(r.lastRunAt) : null;
  out.finishedAt = Number.isFinite(Number(r.finishedAt)) ? Number(r.finishedAt) : null;
  return out;
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

  if (wizardRaw.parents && typeof wizardRaw.parents === "object"){
    wizard.parents = {
      father: wizardRaw.parents.father === true,
      mother: wizardRaw.parents.mother === true,
    };
  }

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

  if (wizardRaw.siblings && typeof wizardRaw.siblings === "object"){
    wizard.siblings = {
      full_brother: clampCount(wizardRaw.siblings.full_brother, 0, 50),
      full_sister: clampCount(wizardRaw.siblings.full_sister, 0, 50),
      consanguine_brother: clampCount(wizardRaw.siblings.consanguine_brother, 0, 50),
      consanguine_sister: clampCount(wizardRaw.siblings.consanguine_sister, 0, 50),
      uterine_brother: clampCount(wizardRaw.siblings.uterine_brother, 0, 50),
      uterine_sister: clampCount(wizardRaw.siblings.uterine_sister, 0, 50),
    };
  }

  if (wizardRaw.uncles && typeof wizardRaw.uncles === "object"){
    wizard.uncles = {
      paternal_uncle: clampCount(wizardRaw.uncles.paternal_uncle, 0, 50),
      paternal_uncle_son: clampCount(wizardRaw.uncles.paternal_uncle_son, 0, 50),
      paternal_uncles_daughter: clampCount(wizardRaw.uncles.paternal_uncles_daughter, 0, 50),
      paternal_uncle_sons_daughter: clampCount(wizardRaw.uncles.paternal_uncle_sons_daughter, 0, 50),

      consanguine_paternal_uncle: clampCount(wizardRaw.uncles.consanguine_paternal_uncle, 0, 50),
      consanguine_paternal_uncle_son: clampCount(wizardRaw.uncles.consanguine_paternal_uncle_son, 0, 50),
      consanguine_paternal_uncles_daughter: clampCount(wizardRaw.uncles.consanguine_paternal_uncles_daughter, 0, 50),
      consanguine_paternal_uncle_sons_daughter: clampCount(wizardRaw.uncles.consanguine_paternal_uncle_sons_daughter, 0, 50),
    };
  }

  if (wizardRaw.grandparents && typeof wizardRaw.grandparents === "object"){
    wizard.grandparents = {
      paternal_grandfather: wizardRaw.grandparents.paternal_grandfather === true,
      paternal_grandmother: wizardRaw.grandparents.paternal_grandmother === true,
      maternal_grandmother: wizardRaw.grandparents.maternal_grandmother === true,
      paternal_great_grandmother: clampCount(wizardRaw.grandparents.paternal_great_grandmother, 0, 50),
      maternal_great_grandmother: clampCount(wizardRaw.grandparents.maternal_great_grandmother, 0, 50),
    };
  }

  // Builder
  const builderRaw = s.builder && typeof s.builder === "object" ? s.builder : {};
  const builder = makeDefaultBuilder();
  builder.mode = (builderRaw.mode === "roles") ? "roles" : "tree";
  builder.tree = builderRaw.tree ?? null;
  builder.treeSelectedId = typeof builderRaw.treeSelectedId === "string" ? builderRaw.treeSelectedId : null;

  if (builderRaw.treeUi && typeof builderRaw.treeUi === "object"){
    builder.treeUi = {
      search: typeof builderRaw.treeUi.search === "string" ? builderRaw.treeUi.search : "",
      collapsedLevels: (builderRaw.treeUi.collapsedLevels && typeof builderRaw.treeUi.collapsedLevels === "object") ? builderRaw.treeUi.collapsedLevels : {},
      showDisconnected: builderRaw.treeUi.showDisconnected !== false,
      peopleListCollapsed: builderRaw.treeUi.peopleListCollapsed === true,
      modal: null,
    };
  }

  builder.fromWizardApplied = builderRaw.fromWizardApplied === true;
  builder.heirsByRole = (builderRaw.heirsByRole && typeof builderRaw.heirsByRole === "object") ? builderRaw.heirsByRole : {};
  builder.wizardHashApplied = typeof builderRaw.wizardHashApplied === "string" ? builderRaw.wizardHashApplied : null;
  builder.payloadPreview = (builderRaw.payloadPreview && typeof builderRaw.payloadPreview === "object") ? builderRaw.payloadPreview : null;

  // Results
  const results = sanitizeResults(s.results);

  // UI
  const uiRaw = s.ui && typeof s.ui === "object" ? s.ui : {};
  const ui = makeDefaultUi();
  ui.toasts = Array.isArray(uiRaw.toasts) ? uiRaw.toasts.slice(0, 5) : [];
  ui.modal = null;

  return { wizard, builder, results, ui };
}

export function createStore(initial = null){
  let state = sanitizeState(initial);

  const listeners = new Set();

  function notify(){
    for (const fn of listeners) fn(state);
  }

  // Load persisted state
  const raw = (typeof localStorage !== "undefined") ? safeJsonParse(localStorage.getItem(STORE_KEY)) : null;
  if (raw){
    state = sanitizeState(raw);
  }

  function persist(){
    if (typeof localStorage === "undefined") return;
    const snapshot = makePersistSnapshot(state);
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
  }

  return {
    getState(){
      return state;
    },
    setState(updater, meta = {}){
      const next = typeof updater === "function" ? updater(state) : updater;
      state = sanitizeState({ ...state, ...next });
      notify();
      if (meta.persist !== false) persist();
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
      persist();
      notify();
    },
  };
}
