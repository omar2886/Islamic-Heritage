// public/ui/js/app.js
import { mount } from "./render/mount.js";
import { createStore } from "./store/store.js";

import { renderWizard, wireWizard } from "./pages/wizard.js";
import { renderBuilder, wireBuilder, applyWizardSync } from "./pages/builder.js";
import { renderResults, wireResults } from "./pages/results.js";

import { renderToast } from "./ui/toast.js";
import { renderModal, wireModal } from "./ui/modal.js";

import { importWizardToTree } from "./pages/builder_tree.js";
import { captureFocus, restoreFocus } from "./ui/focus.js";

function normalizeRouteFromHash(){
  const raw = (typeof location !== "undefined" && location.hash) ? location.hash : "";
  const h = raw.startsWith("#") ? raw.slice(1) : raw;
  const p = h.startsWith("/") ? h.slice(1) : h;
  const first = (p.split(/[/?]/)[0] || "").trim();

  if (first === "builder" || first === "results" || first === "wizard") return first;
  return "wizard";
}

function renderRoute(state, route){
  if (route === "builder") return renderBuilder(state);
  if (route === "results") return renderResults(state);
  return renderWizard(state);
}

function resetToEmptyTree(store){
  store.setState((s) => ({
    ...s,
    builder: {
      ...(s.builder || {}),
      tree: null,
      treeSelectedId: null,
      fromWizardApplied: false,
      wizardHashApplied: null,
      payloadPreview: null,
    },
  }));
}

function boot(){
  const root = document.getElementById("app");
  if (!root) return;

  const store = createStore();

  function onModalConfirm(action){
    // wireModal ya hace closeModal(store) antes de emitir el evento
    if (action === "reset-case"){
      store.reset();
      location.hash = "#/wizard";
      return;
    }

    if (action === "builder-apply-wizard"){
      applyWizardSync(store);
      return;
    }

    if (action === "builder-tree-import-wizard"){
      importWizardToTree(store);
      return;
    }

    if (action === "builder-tree-reset"){
      resetToEmptyTree(store);
      return;
    }

    console.warn("Unknown modal confirm action:", action);
  }

  window.addEventListener("heritage-modal-confirm", (e) => {
    const action = e?.detail?.action;
    if (typeof action === "string" && action) onModalConfirm(action);
  });

  let lastRoute = null;

  function render(){
    const state = store.getState();
    const route = normalizeRouteFromHash();

    const focus = captureFocus();
    const html =
      renderRoute(state, route) +
      renderToast(state) +
      renderModal(state);

    mount(root, html);
    restoreFocus(focus);

    // Global UI wiring (modal buttons)
    wireModal(store);

    // Page wiring
    if (route === "wizard"){
      wireWizard(store);
    } else if (route === "builder"){
      wireBuilder(store);
    } else if (route === "results"){
      wireResults(store);
    }

    lastRoute = route;
  }

  // Ensure default route
  if (!location.hash || location.hash === "#"){
    location.hash = "#/wizard";
  }

  store.subscribe(render);
  window.addEventListener("hashchange", render);
  render();
}

// Guard para que Codex pueda hacer import en Node sin ejecutar boot()
if (typeof window !== "undefined" && typeof document !== "undefined"){
  boot();
}
