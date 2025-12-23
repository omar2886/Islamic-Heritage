// public/ui/js/store/store.js
const STORE_KEY = "heritage_ui_state_v3";

function clampCount(v, min, max){
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function makeDefaultWizard(){
  return {
    deceased_sex: null, // male | female | null
    estate_value: "",
    currency: "MAD",
    flags: { audit: true, explain: true },

    spouse: { enabled: false, husband_present: false, wives_count: 0 },

    descendants: {
      son: 0,
      daughter: 0,
      sons_son: 0,
      sons_daughter: 0,
    },

    parents: { father: false, mother: false },

    grandparents: {
      paternal_grandfather: false,
      paternal_grandmother: false,
      maternal_grandmother: false,
    },

    siblings: {
      full_brother: 0,
      full_sister: 0,
      paternal_brother: 0,
      paternal_sister: 0,
      maternal_brother: 0,
      maternal_sister: 0,
    },

    other: {
      father_of_father: false,
      mother_of_father: false,
      mother_of_mother: false,
    },
  };
}

function normalizeTreeUi(raw){
  const d = {
    search: "",
    collapsedLevels: {},
    showDisconnected: true,
    peopleListCollapsed: false,
    modal: null,
    selectedId: null,
  };

  if (!raw || typeof raw !== "object") return d;

  d.search = typeof raw.search === "string" ? raw.search : "";
  d.collapsedLevels = (raw.collapsedLevels && typeof raw.collapsedLevels === "object") ? raw.collapsedLevels : {};
  d.showDisconnected = raw.showDisconnected !== false;
  d.peopleListCollapsed = raw.peopleListCollapsed === true;
  d.modal = (raw.modal && typeof raw.modal === "object") ? raw.modal : null;
  d.selectedId = typeof raw.selectedId === "string" ? raw.selectedId : null;

  return d;
}

function makeDefaultBuilder(){
  return {
    mode: "tree", // tree | roles
    tree: null,

    fromWizardApplied: false,
    heirsByRole: {},
    wizardHashApplied: null,
    payloadPreview: null,

    treeUi: normalizeTreeUi(null),
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

function sanitizeState(input){
  const s = input && typeof input === "object" ? input : {};

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
    };
  }

  if (wizardRaw.parents && typeof wizardRaw.parents === "object"){
    wizard.parents = {
      father: wizardRaw.parents.father === true,
      mother: wizardRaw.parents.mother === true,
    };
  }

  if (wizardRaw.grandparents && typeof wizardRaw.grandparents === "object"){
    wizard.grandparents = {
      paternal_grandfather: wizardRaw.grandparents.paternal_grandfather === true,
      paternal_grandmother: wizardRaw.grandparents.paternal_grandmother === true,
      maternal_grandmother: wizardRaw.grandparents.maternal_grandmother === true,
    };
  }

  if (wizardRaw.siblings && typeof wizardRaw.siblings === "object"){
    wizard.siblings = {
      full_brother: clampCount(wizardRaw.siblings.full_brother, 0, 50),
      full_sister: clampCount(wizardRaw.siblings.full_sister, 0, 50),
      paternal_brother: clampCount(wizardRaw.siblings.paternal_brother, 0, 50),
      paternal_sister: clampCount(wizardRaw.siblings.paternal_sister, 0, 50),
      maternal_brother: clampCount(wizardRaw.siblings.maternal_brother, 0, 50),
      maternal_sister: clampCount(wizardRaw.siblings.maternal_sister, 0, 50),
    };
  }

  if (wizardRaw.other && typeof wizardRaw.other === "object"){
    wizard.other = {
      father_of_father: wizardRaw.other.father_of_father === true,
      mother_of_father: wizardRaw.other.mother_of_father === true,
      mother_of_mother: wizardRaw.other.mother_of_mother === true,
    };
  }

  const builderRaw = s.builder && typeof s.builder === "object" ? s.builder : {};
  const mode = builderRaw.mode === "roles" ? "roles" : "tree";
  const tree = (builderRaw.tree && typeof builderRaw.tree === "object") ? builderRaw.tree : null;

  const heirsByRole = (builderRaw.heirsByRole && typeof builderRaw.heirsByRole === "object") ? builderRaw.heirsByRole : {};
  const roleSet = new Set(Object.keys(heirsByRole || {}));
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
    treeUi,
  };

  const results = sanitizeResults(s.results);
  const ui = sanitizeUi(s.ui);
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

  const raw = (typeof localStorage !== "undefined") ? safeJsonParse(localStorage.getItem(STORE_KEY)) : null;
  if (raw){
    const restored = sanitizeState(raw);
    state = {
      ...restored,
      ui: {
        ...restored.ui,
        route: restored.ui.route || "wizard",
      },
    };
  }

  const listeners = new Set();

  function notify(){
    for (const fn of listeners) fn();
  }

  function makePersistSnapshot(s){
    return {
      wizard: s.wizard,
      builder: s.builder,
      results: s.results,
      ui: {
        toasts: s.ui?.toasts || [],
        modal: s.ui?.modal || null,
      },
    };
  }

  function persist(){
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORE_KEY, JSON.stringify(makePersistSnapshot(state)));
  }

  return {
    getState(){
      return state;
    },
    setState(updater, meta = {}){
      const next = (typeof updater === "function") ? updater(state) : updater;
      const sanitized = sanitizeState(next);

      const keepRoute = (state?.ui?.route && typeof state.ui.route === "string") ? state.ui.route : "wizard";
      sanitized.ui.route = (sanitized.ui.route && typeof sanitized.ui.route === "string") ? sanitized.ui.route : keepRoute;

      state = sanitized;

      if (meta.persist !== false) persist();
      notify();
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
      persist();
      notify();
    },
  };
}
