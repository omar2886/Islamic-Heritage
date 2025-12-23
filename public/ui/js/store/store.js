// public/ui/js/store/store.js
import { EXPECTED_ROLES } from "../api/contract.js";
import { ensureTree, sanitizeTree } from "../domain/familyTree.js";

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
    // IMPORTANTE: wizard.js y builder_tree.js usan parents.father / parents.mother
    parents: { father: false, mother: false },
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
    // legacy keys (si existen)
    collapsed: collapsedLevels,
    showDisconnected: ui.showDisconnected !== false,
    peopleListCollapsed: ui.peopleListCollapsed === true,
    // CRITICO: builder_tree usa treeUi.modal (modal interno del tree builder)
    modal: ui.modal && typeof ui.modal === "object" ? ui.modal : null,
  };
}

function makeDefaultBuilder(){
  return {
    mode: "tree", // "tree" | "roles"
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
    lastRunAt: null,
  };
}

function makeDefaultUi(){
  return {
    // Ruta UI actual (router). No debe afectar al core, solo a la vista.
    route: "wizard",
    toasts: [],
    modal: null,
  };
}

function makeDefaultBoot(){
  return {
    status: "idle", // idle | checking | ready | blocked
    error: null,
    diff: null,
    rolesServer: null,
  };
}

function sanitizeBoot(raw){
  const b = (raw && typeof raw === "object") ? raw : {};
  const out = makeDefaultBoot();

  const allowed = new Set(["idle", "checking", "ready", "blocked"]);
  out.status = allowed.has(b.status) ? b.status : "idle";
  out.error = (typeof b.error === "string" && b.error) ? b.error : null;
  out.diff = (b.diff && typeof b.diff === "object") ? b.diff : null;
  out.rolesServer = (b.rolesServer && typeof b.rolesServer === "object") ? b.rolesServer : null;

  return out;
}

function safeJsonParse(s){
  try { return JSON.parse(s); } catch { return null; }
}

function sanitizeResults(raw){
  const r = (raw && typeof raw === "object") ? raw : {};
  const out = makeDefaultResults();

  const allowed = new Set(["idle", "running", "ok", "error"]);
  out.status = allowed.has(r.status) ? r.status : "idle";
  out.error = (typeof r.error === "string" && r.error) ? r.error : null;
  out.response = (r.response && typeof r.response === "object") ? r.response : null;
  out.lastRunAt = Number.isFinite(Number(r.lastRunAt)) ? Number(r.lastRunAt) : null;

  return out;
}

function sanitizeUi(raw){
  const u = (raw && typeof raw === "object") ? raw : {};
  const out = makeDefaultUi();

  const route = String(u.route || "").trim().toLowerCase();
  out.route = (route === "wizard" || route === "builder" || route === "results") ? route : "wizard";
  out.toasts = Array.isArray(u.toasts) ? u.toasts.filter((t) => t && typeof t === "object") : [];
  out.modal = (u.modal && typeof u.modal === "object") ? u.modal : null;

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

  // Parents: soporta legacy father_alive/mother_alive pero normaliza a father/mother
  if (wizardRaw.parents && typeof wizardRaw.parents === "object"){
    const p = wizardRaw.parents;
    const father =
      (p.father === true) ||
      (p.father_alive === true) ||
      (p.father_alive !== undefined ? p.father_alive !== false : false);

    const mother =
      (p.mother === true) ||
      (p.mother_alive === true) ||
      (p.mother_alive !== undefined ? p.mother_alive !== false : false);

    wizard.parents = { father: Boolean(father), mother: Boolean(mother) };
  }

  // Builder
  const builderRaw = s.builder && typeof s.builder === "object" ? s.builder : {};
  const mode = builderRaw.mode === "roles" ? "roles" : "tree";

  const tree = builderRaw.tree ? ensureTree(sanitizeTree(builderRaw.tree)) : null;

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

  // Results + UI: NO resetear a defaults, hay que conservarlos
  const results = sanitizeResults(s.results);
  const ui = sanitizeUi(s.ui);

  // Boot: estado runtime, NO debe influir en core ni en persistencia.
  const boot = sanitizeBoot(s.boot);

  return { wizard, builder, results, ui, boot };
}

export function createStore(){
  let state = sanitizeState({
    wizard: makeDefaultWizard(),
    builder: makeDefaultBuilder(),
    results: makeDefaultResults(),
    ui: makeDefaultUi(),
    boot: makeDefaultBoot(),
  });

  // Load persisted state.
  const raw = (typeof localStorage !== "undefined") ? safeJsonParse(localStorage.getItem(STORE_KEY)) : null;
  if (raw){
    state = sanitizeState(raw);
  }

  const listeners = new Set();

  function notify(){
    for (const fn of listeners) fn();
  }

  function persist(){
    if (typeof localStorage === "undefined") return;

    // No persistir modales o UI efimera
    const snapshot = {
      ...state,
      ui: {
        ...(state.ui || {}),
        modal: null,
      },
      builder: {
        ...(state.builder || {}),
        treeUi: {
          ...((state.builder || {}).treeUi || {}),
          modal: null,
        },
      },
    };

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
      // Persist por defecto; solo NO persistir cuando meta.persist === false
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
        boot: makeDefaultBoot(),
      });
      notify();
      persist();
    },
  };
}
