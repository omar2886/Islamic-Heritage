import { CURRENT_SCHEMA_VERSION, loadState, saveState, clearPersistedState } from "./persist.js";
import { deriveState, normalizeRoute } from "./derive.js";
import { EXPECTED_ROLES } from "../api/contract.js";
import { ROLE_GROUPS } from "../domain/roles.js";
import { deriveHeirsFromFamily } from "../domain/family/deriveHeirs.js";

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

function makeDefaultFamily(){
  return {
    nextSeq: 2,
    order: ["P1"],
    people: {
      P1: {
        id: "P1",
        label: "Causante",
        sex: "unknown",       // "male" | "female" | "unknown"
        alive: false,         // causante normalmente fallecido
        fatherId: null,
        motherId: null,
        spouseIds: [],
      },
    },
  };
}

function makeDefaultBuilder(){
  return {
    // "roles" (legacy) | "tree" (experimental PR14)
    mode: "roles",

    // legacy sync flags
    fromWizardApplied: false,
    wizardHashApplied: null,
    wizardHashAppliedTree: null,

    // legacy model (roles)
    heirsByRole: {},

    // common output used by runCalc/results
    payloadPreview: null,

    // tree model (PR14)
    family: makeDefaultFamily(),
    decedentId: "P1",
    selectedId: "P1",
    derived: {
      heirsByRole: null,
      heirs: [],
      issues: [],
      unsupported: [],
    },
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
  const modeRaw = String(builder.mode || "roles").trim().toLowerCase();
  const mode = (modeRaw === "tree") ? "tree" : "roles";

  if (mode === "tree"){
    // sanitize family
    const f0 = builder.family && typeof builder.family === "object" ? builder.family : null;
    const fam = f0 ? structuredClone(f0) : makeDefaultFamily();

    // nextSeq large
    fam.nextSeq = clampCount(fam.nextSeq ?? 2, 2, 1000000);

    // people
    if (!fam.people || typeof fam.people !== "object") fam.people = {};
    if (!fam.order || !Array.isArray(fam.order)) fam.order = [];

    // Ensure P1 exists
    if (!fam.people.P1 || typeof fam.people.P1 !== "object"){
      fam.people.P1 = {
        id: "P1",
        label: "Causante",
        sex: "unknown",
        alive: false,
        fatherId: null,
        motherId: null,
        spouseIds: [],
      };
      if (!fam.order.includes("P1")) fam.order.unshift("P1");
    }

    // sanitize each person
    const peopleOut = {};
    for (const [id0, p0] of Object.entries(fam.people)){
      if (!p0 || typeof p0 !== "object") continue;
      const id = String(p0.id || id0 || "").trim();
      if (!id) continue;

      const sex = (p0.sex === "male" || p0.sex === "female") ? p0.sex : "unknown";
      const alive = !!p0.alive;

      const fatherId = p0.fatherId ? String(p0.fatherId).trim() : null;
      const motherId = p0.motherId ? String(p0.motherId).trim() : null;

      const spouseIds = Array.isArray(p0.spouseIds) ? p0.spouseIds.map((x) => String(x || "").trim()).filter(Boolean) : [];

      peopleOut[id] = {
        id,
        label: String(p0.label || "").trim() || id,
        sex,
        alive,
        fatherId: fatherId || null,
        motherId: motherId || null,
        spouseIds: Array.from(new Set(spouseIds)),
      };
    }

    fam.people = peopleOut;

    // sanitize order (keep existing ids only, keep stable)
    const order = Array.from(new Set((fam.order || []).map((x) => String(x || "").trim()).filter(Boolean)))
      .filter((id) => !!fam.people[id]);
    if (!order.includes("P1")) order.unshift("P1");
    fam.order = order;

    // prune invalid parent/spouse refs
    for (const p of Object.values(fam.people)){
      if (p.fatherId && !fam.people[p.fatherId]) p.fatherId = null;
      if (p.motherId && !fam.people[p.motherId]) p.motherId = null;
      p.spouseIds = (p.spouseIds || []).filter((sid) => !!fam.people[sid] && sid !== p.id);
    }

    // normalize spouse links to be bidirectional
    for (const p of Object.values(fam.people)){
      for (const sid of (p.spouseIds || [])){
        const sp = fam.people[sid];
        if (!sp) continue;
        if (!Array.isArray(sp.spouseIds)) sp.spouseIds = [];
        if (!sp.spouseIds.includes(p.id)) sp.spouseIds.push(p.id);
      }
      p.spouseIds = Array.from(new Set(p.spouseIds));
    }

    // decedentId/selectedId
    const decedentId = fam.people[String(builder.decedentId || "").trim()]
      ? String(builder.decedentId || "").trim()
      : "P1";

    const selectedId = fam.people[String(builder.selectedId || "").trim()]
      ? String(builder.selectedId || "").trim()
      : decedentId;

    // derive heirs from tree
    const derivedRaw = deriveHeirsFromFamily(fam, decedentId);
    const derivedCounts = (derivedRaw && derivedRaw.heirsByRole && typeof derivedRaw.heirsByRole === "object")
      ? derivedRaw.heirsByRole
      : {};

    // clamp to known roles/limits + enforce spouse side by decedent sex
    const heirsByRole = {};
    EXPECTED_ROLES.forEach((role) => {
      heirsByRole[role] = clampRoleCount(role, derivedCounts[role] ?? 0);
    });

    const decSex = fam.people[decedentId]?.sex || "unknown";
    if (decSex === "male"){
      heirsByRole.husband = 0;
    }else if (decSex === "female"){
      heirsByRole.wife = 0;
    }else{
      heirsByRole.husband = 0;
      heirsByRole.wife = 0;
    }

    // payload preview using ROLE_GROUPS ordering
    const payloadHeirs = [];
    for (const group of ROLE_GROUPS){
      for (const role of group.roles){
        const count = Number(heirsByRole[role] || 0);
        if (count > 0){
          payloadHeirs.push({ role, count });
        }
      }
    }

    out.builder = {
      ...makeDefaultBuilder(),
      mode: "tree",
      family: fam,
      decedentId,
      selectedId,
      heirsByRole, // exposed for compatibility/debug
      payloadPreview: { heirs: payloadHeirs },
      derived: {
        heirsByRole: derivedRaw?.heirsByRole || null,
        heirs: Array.isArray(derivedRaw?.heirs) ? derivedRaw.heirs : [],
        issues: Array.isArray(derivedRaw?.issues) ? derivedRaw.issues : [],
        unsupported: Array.isArray(derivedRaw?.unsupported) ? derivedRaw.unsupported : [],
      },
      // keep legacy flags present but irrelevant in tree mode
      fromWizardApplied: !!builder.fromWizardApplied,
      wizardHashApplied: builder.wizardHashApplied ? String(builder.wizardHashApplied) : null,
      wizardHashAppliedTree: builder.wizardHashAppliedTree ? String(builder.wizardHashAppliedTree) : null,
    };
  }else{
    // LEGACY roles builder (existing behavior)
    const heirsByRole = {};
    EXPECTED_ROLES.forEach((role) => {
      heirsByRole[role] = clampRoleCount(role, builder?.heirsByRole?.[role] ?? 0);
    });

    // enforce spouse based on wizard (legacy)
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

    const payloadHeirs = [];
    for (const group of ROLE_GROUPS){
      for (const role of group.roles){
        const count = Number(heirsByRole[role] || 0);
        if (count > 0){
          payloadHeirs.push({ role, count });
        }
      }
    }

    out.builder = {
      ...makeDefaultBuilder(),
      mode: "roles",
      fromWizardApplied: !!builder.fromWizardApplied,
      wizardHashApplied: builder.wizardHashApplied ? String(builder.wizardHashApplied) : null,
      wizardHashAppliedTree: builder.wizardHashAppliedTree ? String(builder.wizardHashAppliedTree) : null,
      heirsByRole,
      payloadPreview: { heirs: payloadHeirs },
      // keep tree fields but default
      family: makeDefaultFamily(),
      decedentId: "P1",
      selectedId: "P1",
      derived: { heirsByRole: null, heirs: [], issues: [], unsupported: [] },
    };
  }

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
