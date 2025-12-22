import { CURRENT_SCHEMA_VERSION, loadState, saveState, clearPersistedState } from "./persistence.js";
import { deriveState } from "./derive.js";
import { EXPECTED_ROLES } from "../api/contract.js";
import { sanitizeTree, ensureTree, deriveHeirsByRoleFromTree } from "../domain/familyTree.js";

const DEFAULT_STATE = {
  meta: { schema: CURRENT_SCHEMA_VERSION, dirty: false, lastTouched: null },
  wizard: {
    deceased_sex: "",
    spouse: { enabled: false, count: 0 },
    ascendants: { father: { alive: false }, mother: { alive: false } },
    descendants: { sons: 0, daughters: 0 },
  },
  builder: makeDefaultBuilder(),
};

function clone(x){
  return JSON.parse(JSON.stringify(x));
}

function clampInt(n, min, max){
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function clampRoleCount(role, value){
  return clampInt(value, 0, 50);
}

function makeDefaultWizard(){
  return clone(DEFAULT_STATE.wizard);
}

function normalizeTreeUi(raw){
  const ui = (raw && typeof raw === "object") ? raw : {};
  const search = typeof ui.search === "string" ? ui.search : "";
  const collapsedRaw = (ui.collapsed && typeof ui.collapsed === "object") ? ui.collapsed : {};
  const collapsed = {};
  Object.entries(collapsedRaw).forEach(([k, v]) => { collapsed[String(k)] = v === true; });
  return { search, collapsed, peopleListCollapsed: ui.peopleListCollapsed === true };
}

function makeDefaultBuilder(){
  return {
    mode: "tree",
    tree: null,
    treeSelectedId: null,
    treeUi: { search: "", collapsed: {}, peopleListCollapsed: false },

    fromWizardApplied: false,
    heirsByRole: {},
    wizardHashApplied: null,
    payloadPreview: null,
  };
}

function sanitizeStateMeta(meta){
  const m = (meta && typeof meta === "object") ? meta : {};
  return {
    schema: CURRENT_SCHEMA_VERSION,
    dirty: m.dirty === true,
    lastTouched: typeof m.lastTouched === "number" ? m.lastTouched : null,
  };
}

function sanitizeWizard(w){
  const out = makeDefaultWizard();
  if (!w || typeof w !== "object") return out;

  out.deceased_sex = (w.deceased_sex === "male" || w.deceased_sex === "female") ? w.deceased_sex : "";

  out.spouse.enabled = w.spouse?.enabled === true;
  out.spouse.count = clampInt(w.spouse?.count ?? 0, 0, 4);

  out.ascendants.father.alive = w.ascendants?.father?.alive === true;
  out.ascendants.mother.alive = w.ascendants?.mother?.alive === true;

  out.descendants.sons = clampInt(w.descendants?.sons ?? 0, 0, 20);
  out.descendants.daughters = clampInt(w.descendants?.daughters ?? 0, 0, 20);

  return out;
}

function sanitize(state){
  const s = (state && typeof state === "object") ? state : DEFAULT_STATE;
  const out = clone(DEFAULT_STATE);

  out.meta = sanitizeStateMeta(s.meta);
  out.wizard = sanitizeWizard(s.wizard);

  const builder = (s.builder && typeof s.builder === "object") ? s.builder : makeDefaultBuilder();

  let mode = "tree";
  if (builder.mode === "tree" || builder.mode === "roles"){
    mode = builder.mode;
  } else {
    const hasRoles = builder.heirsByRole && Object.values(builder.heirsByRole).some((v) => Number(v) > 0);
    mode = hasRoles ? "roles" : "tree";
  }

  const tree = ensureTree(sanitizeTree(builder.tree), null);

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

  // Solo aplicar clamps wizard cuando mode=roles. En mode=tree, el árbol manda.
  if (mode === "roles"){
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
  }

  const payloadPreview = {
    heirs: Object.entries(heirsByRole)
      .filter(([, n]) => Number(n) > 0)
      .map(([role, count]) => ({ role, count: Number(count) })),
  };

  out.builder = {
    ...makeDefaultBuilder(),
    ...builder,
    mode,
    tree,
    treeSelectedId: typeof builder.treeSelectedId === "string" ? builder.treeSelectedId : null,
    treeUi: normalizeTreeUi(builder.treeUi),
    heirsByRole,
    payloadPreview,
    fromWizardApplied: builder.fromWizardApplied === true,
    wizardHashApplied: typeof builder.wizardHashApplied === "string" ? builder.wizardHashApplied : null,
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
