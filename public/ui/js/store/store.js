import { EXPECTED_ROLES, ensureTree, sanitizeTree, deriveHeirsByRoleFromTree } from "../domain/familyTree.js";

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

function makeDefaultBuilder(){
  return {
    mode: "tree",          // "tree" | "roles"
    tree: null,
    treeSelectedId: null,

    treeUi: {
      search: "",
      collapsed: {},
      modal: null,
    },

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

export function createStore(){
  let state = {
    wizard: makeDefaultWizard(),
    builder: makeDefaultBuilder(),
    results: makeDefaultResults(),
    ui: makeDefaultUi(),
  };

  // Load persisted state.
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
  if (raw){
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === "object"){
      state = sanitizeState(parsed);
    }
  } else {
    state = sanitizeState(state);
  }

  const listeners = new Set();

  function getState(){
    return state;
  }

  function setState(updater, meta){
    const next = (typeof updater === "function") ? updater(state) : updater;
    state = sanitizeState(next);

    // Persist by default, unless explicitly disabled.
    const persist = !(meta && meta.persist === false);
    if (persist && typeof localStorage !== "undefined"){
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({
          wizard: state.wizard,
          builder: state.builder,
          results: state.results,
          ui: state.ui,
        }));
      } catch {}
    }

    for (const cb of listeners) cb(state);
  }

  function subscribe(cb){
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  return { getState, setState, subscribe };
}

function sanitizeState(input){
  const inObj = input && typeof input === "object" ? input : {};

  // wizard
  const defaultWizard = makeDefaultWizard();
  const w = inObj.wizard && typeof inObj.wizard === "object" ? inObj.wizard : {};
  const deceasedSex = w.deceased_sex === "male" || w.deceased_sex === "female" ? w.deceased_sex : null;

  const spouseRaw = w.spouse && typeof w.spouse === "object" ? w.spouse : {};
  let wivesCount = clampCount(spouseRaw.wives_count, 0, 4);
  let husbandPresent = spouseRaw.husband_present === true;
  if (deceasedSex !== "male") wivesCount = 0;
  if (deceasedSex !== "female") husbandPresent = false;
  if (!spouseRaw.enabled){
    wivesCount = 0;
    husbandPresent = false;
  }

  const desc = w.descendants && typeof w.descendants === "object" ? w.descendants : {};
  const parents = w.parents && typeof w.parents === "object" ? w.parents : {};

  const wizard = {
    ...defaultWizard,
    deceased_sex: deceasedSex,
    estate_value: typeof w.estate_value === "string" ? w.estate_value : defaultWizard.estate_value,
    currency: typeof w.currency === "string" ? w.currency : defaultWizard.currency,
    flags: {
      audit: w.flags?.audit !== false,
      explain: w.flags?.explain !== false,
    },
    spouse: {
      enabled: spouseRaw.enabled === true,
      wives_count: wivesCount,
      husband_present: husbandPresent,
    },
    descendants: {
      son: clampCount(desc.son),
      daughter: clampCount(desc.daughter),
      sons_son: clampCount(desc.sons_son),
      sons_daughter: clampCount(desc.sons_daughter),
      son_of_son: clampCount(desc.son_of_son),
      daughter_of_son: clampCount(desc.daughter_of_son),
    },
    parents: {
      enabled: parents.enabled === true,
      father_alive: parents.father_alive !== false,
      mother_alive: parents.mother_alive !== false,
    },
    grandparents: { enabled: w.grandparents?.enabled === true },
    siblings: { enabled: w.siblings?.enabled === true },
    uncles: { enabled: w.uncles?.enabled === true },
  };

  // builder
  const builderRaw = inObj.builder && typeof inObj.builder === "object" ? inObj.builder : {};
  const mode = builderRaw.mode === "roles" ? "roles" : "tree";

  const tree = ensureTree(sanitizeTree(builderRaw.tree));

  let rawHeirs = {};
  if (mode === "tree"){
    rawHeirs = deriveHeirsByRoleFromTree(tree).heirsByRole || {};
  } else {
    rawHeirs = builderRaw.heirsByRole && typeof builderRaw.heirsByRole === "object" ? builderRaw.heirsByRole : {};
  }

  const roleSet = new Set([...(Array.isArray(EXPECTED_ROLES) ? EXPECTED_ROLES : []), ...Object.keys(rawHeirs || {})]);
  const heirsByRole = {};
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

  const treeUi = builderRaw.treeUi && typeof builderRaw.treeUi === "object" ? builderRaw.treeUi : {};
  const rawCollapsed = treeUi.collapsed && typeof treeUi.collapsed === "object" ? treeUi.collapsed : {};
  const cleanCollapsed = {};
  for (const [key, value] of Object.entries(rawCollapsed)){
    if (value === true) cleanCollapsed[String(key)] = true;
  }
  let cleanModal = null;
  if (treeUi.modal && typeof treeUi.modal === "object"){
    const type = String(treeUi.modal.type || "");
    if (type === "edit-person"){
      const personId = typeof treeUi.modal.personId === "string" ? treeUi.modal.personId : null;
      cleanModal = personId ? { type, personId } : null;
    }else if (type === "add-child"){
      const parentId = typeof treeUi.modal.parentId === "string" ? treeUi.modal.parentId : null;
      const sex = (treeUi.modal.sex === "male" || treeUi.modal.sex === "female") ? treeUi.modal.sex : null;
      cleanModal = parentId ? { type, parentId, sex } : null;
    }else if (type === "add-spouse"){
      const personId = typeof treeUi.modal.personId === "string" ? treeUi.modal.personId : null;
      cleanModal = personId ? { type, personId } : null;
    }
  }
  const builderTreeUi = {
    search: typeof treeUi.search === "string" ? treeUi.search.slice(0, 80) : "",
    collapsed: cleanCollapsed,
    modal: cleanModal,
  };

  const builder = {
    mode,
    tree,
    heirsByRole,
    fromWizardApplied: Boolean(builderRaw.fromWizardApplied),
    wizardHashApplied: typeof builderRaw.wizardHashApplied === "string" ? builderRaw.wizardHashApplied : null,
    payloadPreview,

    treeSelectedId: typeof builderRaw.treeSelectedId === "string" ? builderRaw.treeSelectedId : null,

    treeUi: builderTreeUi,
  };

  const resultsRaw = inObj.results && typeof inObj.results === "object" ? inObj.results : {};
  const allowedStatuses = new Set(["idle", "running", "ok", "error"]);
  const results = {
    status: allowedStatuses.has(resultsRaw.status) ? resultsRaw.status : "idle",
    error: typeof resultsRaw.error === "string" ? resultsRaw.error : null,
    response: resultsRaw.response && typeof resultsRaw.response === "object" ? resultsRaw.response : null,
    lastRunAt: Number.isFinite(resultsRaw.lastRunAt) ? resultsRaw.lastRunAt : null,
  };

  const uiRaw = inObj.ui && typeof inObj.ui === "object" ? inObj.ui : {};
  const ui = {
    toasts: Array.isArray(uiRaw.toasts) ? uiRaw.toasts : [],
    modal: uiRaw.modal && typeof uiRaw.modal === "object" ? uiRaw.modal : null,
  };

  return { wizard, builder, results, ui };
}
