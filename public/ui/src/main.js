import { $, setChildren, el } from "./ui/dom.js";
import { ApiClient } from "./core/apiClient.js";
import * as rolesCatalog from "./core/rolesCatalog.js";
import { createInitialState, sanitizeState } from "./domain/state.js";
import { validateHard, validateSoft } from "./domain/validate.js";
import { buildPayload } from "./domain/adapter.js";
import { renderForm } from "./ui/viewForm.js";
import { renderResult } from "./ui/viewResults.js";
import { renderDebug } from "./ui/viewDebug.js";

const mountForm = $("#mountForm");
const mountResult = $("#mountResult");
const mountDebug = $("#mountDebug");
const btnCalc = $("#btnCalc");
const btnReset = $("#btnReset");
const bannerArea = $("#bannerArea");

const api = new ApiClient({
  rolesUrl: "../api/roles.php",
  calcUrl: "../api/calc.php"
});

let state = sanitizeState(createInitialState());

function cssEscapeCompat(s) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_\-]/g, (c) => `\\${c}`);
}

function captureFocus() {
  const active = document.activeElement;
  if (!active || !(active instanceof HTMLElement)) return null;
  const key = active.getAttribute("data-focus-key");
  if (!key) return null;

  let selection = null;
  // Preserve selection for text-like inputs
  if (active instanceof HTMLInputElement) {
    try {
      if (typeof active.selectionStart === "number" && typeof active.selectionEnd === "number") {
        selection = { start: active.selectionStart, end: active.selectionEnd };
      }
    } catch (_) {}
  }

  // Also capture viewport to avoid scroll jumps when rerender replaces a focused input.
  const viewport = { x: window.scrollX || 0, y: window.scrollY || 0 };
  return { key, selection, viewport };
}

function restoreFocus(pos) {
  if (!pos || !pos.key) return;

  requestAnimationFrame(() => {
    // Prefer exact matching without CSS escaping pitfalls.
    let target = null;
    try {
      target = document.querySelector(`[data-focus-key="${cssEscapeCompat(pos.key)}"]`);
    } catch (_) {
      target = null;
    }
    if (!(target instanceof HTMLElement)) {
      const all = document.querySelectorAll("[data-focus-key]");
      for (const n of all) {
        if (n instanceof HTMLElement && n.getAttribute("data-focus-key") === pos.key) {
          target = n;
          break;
        }
      }
    }
    if (!(target instanceof HTMLElement)) return;

    // Focus should not scroll the page, but not all browsers support preventScroll.
    const before = pos.viewport ? { ...pos.viewport } : { x: window.scrollX || 0, y: window.scrollY || 0 };
    let focused = false;
    try {
      target.focus({ preventScroll: true });
      focused = true;
    } catch (_) {
      try {
        target.focus();
        focused = true;
      } catch (_) {
        focused = false;
      }
    }

    // Restore viewport if focus caused a jump.
    if (focused) {
      requestAnimationFrame(() => {
        const nowX = window.scrollX || 0;
        const nowY = window.scrollY || 0;
        if (nowX !== before.x || nowY !== before.y) {
          window.scrollTo(before.x, before.y);
        }
      });
    }

    if (target instanceof HTMLInputElement) {
      try {
        if (pos.selection) {
          target.setSelectionRange(pos.selection.start, pos.selection.end);
        } else if (typeof target.value === "string" && typeof target.setSelectionRange === "function") {
          const end = target.value.length;
          target.setSelectionRange(end, end);
        }
      } catch (_) {}
    }
  });
}

function setState(patch, opts = { preserveFocus: true }) {
  const focusPos = opts && opts.preserveFocus ? captureFocus() : null;

  const next = {
    ...state,
    ...patch,
    decedent: { ...state.decedent, ...(patch.decedent || {}) },
    estate: { ...state.estate, ...(patch.estate || {}) },
    heirs: { ...state.heirs, ...(patch.heirs || {}) },
    uiOnly: { ...state.uiOnly, ...(patch.uiOnly || {}) },
    ui: { ...state.ui, ...(patch.ui || {}) },
    runtime: { ...state.runtime, ...(patch.runtime || {}) }
  };

  state = sanitizeState(next);
  render(focusPos);
}

const actions = {
  setSex: (v) => setState({ decedent: { ...state.decedent, sex: v } }),
  setHasDeceasedSon: (v) => setState({ uiOnly: { ...state.uiOnly, hasDeceasedSon: v } }),
  setHeirBool: (roleId, v) => setState({ heirs: { ...state.heirs, [roleId]: !!v } }),
  setHeirCount: (roleId, v) => {
    const n = Number(v || 0);
    setState({ heirs: { ...state.heirs, [roleId]: n } });
  },
  setEstateValue: (v) => {
    // Keep as string while typing; adapter will coerce.
    setState({ estate: { ...state.estate, value: String(v ?? "") } });
  },
  setEstateCurrency: (v) => setState({ estate: { ...state.estate, currency: String(v || "") } }),
  setPrettyJson: (v) => setState({ ui: { ...state.ui, prettyJson: !!v } }, { preserveFocus: false }),

  setSectionOpen: (sectionId, isOpen) => {
    const nextOpen = { ...(state.ui.sectionsOpen || {}) };
    const current = !!nextOpen[sectionId];
    if (current === !!isOpen) return;
    nextOpen[sectionId] = !!isOpen;
    setState({ ui: { ...state.ui, sectionsOpen: nextOpen } }, { preserveFocus: false });
  },

  probeRoleCompat: async () => {
    await ensureRoles();
    await ensureRoleCompat(true);
  }
};

function renderBanners(errors, warnings) {
  const banners = [];

  if (errors && errors.length) {
    const lines = errors.map((e) => `${e.path}: ${e.msg}`);
    banners.push(
      el("div", { class: "banner error" }, [
        el("div", { text: "Errores:" }),
        el("pre", { class: "mono", text: lines.join("\n") })
      ])
    );
  }

  if (warnings && warnings.length) {
    const lines = warnings.map((w) => `${w.path}: ${w.msg}`);
    banners.push(
      el("div", { class: "banner warn" }, [
        el("div", { text: "Avisos:" }),
        el("pre", { class: "mono", text: lines.join("\n") })
      ])
    );
  }

  setChildren(bannerArea, banners);
}

async function ensureRoles() {
  const roles = await rolesCatalog.loadRoles(api);
  if (!state.runtime.rolesLoaded) setState({ runtime: { rolesLoaded: true } }, { preserveFocus: false });

  // Start probe in background (best effort)
  if (!state.runtime.roleCompat && !state.runtime.roleCompatLoading) {
    ensureRoleCompat(false).catch(() => {});
  }

  return roles;
}

async function ensureRoleCompat(force = false) {
  const roles = rolesCatalog.getRolesSync();
  if (!roles || !roles.length) return null;

  if (!force) {
    if (state.runtime.roleCompat) return state.runtime.roleCompat;
    if (state.runtime.roleCompatLoading) return null;
  }

  setState(
    {
      runtime: {
        roleCompatLoading: true,
        roleCompatError: null,
        ...(force ? { roleCompat: null } : {})
      }
    },
    { preserveFocus: false }
  );

  try {
    const rc = await rolesCatalog.probeCalcRoleAcceptance(api, roles);
    setState({ runtime: { roleCompat: rc, roleCompatLoading: false } }, { preserveFocus: false });
    return rc;
  } catch (e) {
    setState(
      { runtime: { roleCompatLoading: false, roleCompatError: e && e.message ? e.message : String(e) } },
      { preserveFocus: false }
    );
    return null;
  }
}

function buildSnapshot(adapterBuiltPayload, fetchSentPayload, coreNormalizedInput) {
  const diff = {};

  const built = JSON.stringify(adapterBuiltPayload || null);
  const sent = JSON.stringify(fetchSentPayload || null);
  const echoed = JSON.stringify(coreNormalizedInput || null);

  if (built !== sent) diff.built_vs_sent = true;
  if (sent !== echoed) diff.sent_vs_core = true;

  return {
    meta: { at: new Date().toISOString() },
    adapterBuiltPayload,
    fetchSentPayload,
    coreNormalizedInput,
    diff: Object.keys(diff).length ? diff : null
  };
}

async function onCalc() {
  renderBanners([], []);
  setState({ runtime: { isLoading: true, lastError: null } }, { preserveFocus: false });

  try {
    const roles = await ensureRoles();

    const errors = validateHard(state, roles);
    const warnings = validateSoft(state, roles);
    renderBanners(errors, warnings);

    if (errors.length) {
      setState({ runtime: { isLoading: false } }, { preserveFocus: false });
      return;
    }

    const built = buildPayload(state, rolesCatalog);

    // Invariant: never send roles not present in roles.php
    const rolesSet = new Set(roles);
    for (const h of built.heirs || []) {
      if (!rolesSet.has(h.role)) throw new Error(`Payload role not in roles.php: ${h.role}`);
    }

    // Capture the exact object sent into fetch (apiClient clones payload)
    const sent = structuredClone(built);

    const resp = await api.postCalc(sent);

    // Snapshot: built vs sent vs core input
    const coreInput = resp && resp.output && resp.output.input ? resp.output.input : null;
    setState(
      {
        runtime: {
          isLoading: false,
          lastPayload: built,
          lastResponse: resp,
          lastError: null,
          snapshot: buildSnapshot(built, sent, coreInput)
        }
      },
      { preserveFocus: false }
    );

    renderResult(mountResult, state);
} catch (e) {
    const msg = e && e.message ? e.message : String(e);
    setState({ runtime: { isLoading: false, lastError: msg } }, { preserveFocus: false });
    renderBanners([{ path: "calc", msg: e && e.message ? e.message : String(e) }], []);
  }
}

function onReset() {
  state = sanitizeState(createInitialState());
  render(null);
}

function render(focusPos) {
  // roles may be null until loaded
  const roles = rolesCatalog.getRolesSync();

  renderForm(mountForm, state, actions);
  renderDebug(mountDebug, state, roles, actions);

  // Keep result if present
  if (!state.runtime.lastResponse) {
    setChildren(mountResult, [el("div", { class: "hint", text: "Sin cálculo todavía." })]);
  }

  // errors/warnings live update for form edits
  const errors = validateHard(state, roles || []);
  const warnings = validateSoft(state, roles || []);
  renderBanners(errors, warnings);

  restoreFocus(focusPos);
}

// Wiring
btnCalc.addEventListener("click", onCalc);
btnReset.addEventListener("click", onReset);

render(null);
ensureRoles().catch(() => {});
