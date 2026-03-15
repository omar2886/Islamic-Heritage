import { clampInt } from "../ui/dom.js";
import { UI_SECTIONS } from "./roleMap.js";

// UI typed state: heirs keys map 1:1 to roleIds from roles.php.
// IMPORTANT: only uiOnly.hasDeceasedSon is outside the catalog.

const ROLE_IDS = [
  "consanguine_brother",
  "consanguine_paternal_uncle",
  "consanguine_paternal_uncle_son",
  "consanguine_paternal_uncle_sons_daughter",
  "consanguine_paternal_uncles_daughter",
  "consanguine_sister",
  "daughter",
  "father",
  "full_brother",
  "full_sister",
  "husband",
  "maternal_grandmother",
  "maternal_great_grandmother",
  "mother",
  "paternal_grandfather",
  "paternal_grandmother",
  "paternal_great_grandmother",
  "paternal_uncle",
  "paternal_uncle_son",
  "paternal_uncle_sons_daughter",
  "paternal_uncles_daughter",
  "son",
  "sons_daughter",
  "sons_son",
  "uterine_brother",
  "uterine_sister",
  "wife"
];

function buildDefaultSectionsOpen() {
  const next = {};
  for (const s of UI_SECTIONS) {
    next[s.id] = !!s.defaultOpen;
  }
  return next;
}

const BOOL_ROLES = new Set([
  "father",
  "mother",
  "husband",
  "paternal_grandfather",
  "paternal_grandmother",
  "maternal_grandmother",
  "paternal_great_grandmother",
  "maternal_great_grandmother"
]);

export function createInitialState() {
  const heirs = {};
  for (const r of ROLE_IDS) {
    heirs[r] = BOOL_ROLES.has(r) ? false : 0;
  }

  return {
    decedent: { sex: "male" },

    heirs,

    uiOnly: { hasDeceasedSon: false },

    estate: { value: "", currency: "" },

    ui: {
      prettyJson: false,
      fiqhSchool: "maliki",
      sectionsOpen: buildDefaultSectionsOpen()
    },

    runtime: {
      rolesLoaded: false,
      isLoading: false,
      lastPayload: null,
      lastResponse: null,
      lastError: null,
      snapshot: null,
      roleCompat: null,
      roleCompatLoading: false,
      roleCompatError: null
    }
  };
}

export function sanitizeState(state) {
  const next = structuredClone(state);

  // Normalize sex
  if (next.decedent.sex !== "male" && next.decedent.sex !== "female") {
    next.decedent.sex = "male";
  }

  // Coerce heirs values
  for (const r of ROLE_IDS) {
    const v = next.heirs[r];

    if (BOOL_ROLES.has(r)) {
      next.heirs[r] = Boolean(v);
      continue;
    }

    // numeric count
    const max = r === "wife" ? 4 : 99;
    next.heirs[r] = clampInt(v, 0, max);
  }

  // Hard sex rules (do not hide, only enforce values)
  if (next.decedent.sex === "male") {
    next.heirs.husband = false;
  } else {
    next.heirs.wife = 0;
  }

  // ui
  next.ui.prettyJson = Boolean(next.ui.prettyJson);
  const school = String(next.ui.fiqhSchool || "maliki").toLowerCase();
  next.ui.fiqhSchool = school === "hanafi" || school === "shafii" || school === "hanbali" ? school : "maliki";
  if (!next.ui.sectionsOpen || typeof next.ui.sectionsOpen !== "object") {
    next.ui.sectionsOpen = buildDefaultSectionsOpen();
  }
  for (const s of UI_SECTIONS) {
    next.ui.sectionsOpen[s.id] = Boolean(next.ui.sectionsOpen[s.id]);
  }

  // runtime is managed elsewhere, but keep booleans sane
  next.runtime.rolesLoaded = Boolean(next.runtime.rolesLoaded);
  next.runtime.isLoading = Boolean(next.runtime.isLoading);
  next.runtime.roleCompatLoading = Boolean(next.runtime.roleCompatLoading);
  next.runtime.roleCompatError = next.runtime.roleCompatError ? String(next.runtime.roleCompatError) : null;

  if (next.runtime.roleCompat && typeof next.runtime.roleCompat === "object") {
    const rc = next.runtime.roleCompat;
    rc.probedAt = rc.probedAt ? String(rc.probedAt) : null;
    rc.acceptedRoles = Array.isArray(rc.acceptedRoles) ? rc.acceptedRoles.map(String) : [];
    rc.rejectedRoles = Array.isArray(rc.rejectedRoles) ? rc.rejectedRoles.map(String) : [];
    rc.normalized = Array.isArray(rc.normalized) ? rc.normalized.map((x) => ({ from: String(x.from), to: String(x.to) })) : [];
  } else {
    next.runtime.roleCompat = null;
  }

  return next;

}

export function hasAnyHeirInput(state) {
  for (const r of ROLE_IDS) {
    const v = state.heirs[r];
    if (typeof v === "boolean") {
      if (v) return true;
    } else if (Number(v) > 0) {
      return true;
    }
  }
  return false;
}

export function sumSiblingCounts(state) {
  const keys = [
    "full_brother",
    "full_sister",
    "consanguine_brother",
    "consanguine_sister",
    "uterine_brother",
    "uterine_sister"
  ];
  let n = 0;
  for (const k of keys) n += Number(state.heirs[k] || 0);
  return n;
}

export function sumDescendantCounts(state) {
  const keys = ["son", "daughter", "sons_son", "sons_daughter"];
  let n = 0;
  for (const k of keys) n += Number(state.heirs[k] || 0);
  return n;
}

export function sumAgnaticUncleCounts(state) {
  const keys = [
    "paternal_uncle",
    "consanguine_paternal_uncle",
    "paternal_uncle_son",
    "consanguine_paternal_uncle_son",
    "paternal_uncles_daughter",
    "consanguine_paternal_uncles_daughter",
    "paternal_uncle_sons_daughter",
    "consanguine_paternal_uncle_sons_daughter"
  ];
  let n = 0;
  for (const k of keys) n += Number(state.heirs[k] || 0);
  return n;
}

export function hasGrandchildrenViaSon(state) {
  return Number(state.heirs.sons_son || 0) + Number(state.heirs.sons_daughter || 0) > 0;
}

export function getRoleIds() {
  return ROLE_IDS.slice();
}

export function isBoolRole(roleId) {
  return BOOL_ROLES.has(String(roleId));
}
