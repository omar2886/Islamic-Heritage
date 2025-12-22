// public/ui/js/app.js
import { createStore } from "./store/store.js";
import { renderWizard, wireWizard } from "./pages/wizard.js";
import { renderBuilder } from "./pages/builder.js";
import { renderResults } from "./pages/results.js";

import { renderModal, wireModal, closeModal } from "./ui/modal.js";
import { renderToast, wireToast } from "./ui/toast.js";

import { importWizardToTree } from "./pages/builder_tree.js";

const store = createStore();

function render(){
  const s = store.getState();

  const hash = location.hash || "#/wizard";
  const route = hash.split("?")[0];

  let pageHtml = "";
  if (route === "#/wizard"){
    pageHtml = renderWizard(s);
  } else if (route === "#/builder"){
    pageHtml = renderBuilder(s);
  } else if (route === "#/results"){
    pageHtml = renderResults(s);
  } else {
    location.hash = "#/wizard";
    return;
  }

  const root = document.getElementById("app");
  if (root){
    root.innerHTML = `
      ${renderToast(s)}
      ${renderModal(s)}
      <main class="app-main">
        ${pageHtml}
      </main>
    `;
  }

  // Wire common UI.
  wireToast(store);
  wireModal(store);

  // Wire page.
  if (route === "#/wizard"){
    wireWizard(store);
  } else if (route === "#/builder"){
    // builder.js wires internally (tree or roles) on each render
    // nothing here
  } else if (route === "#/results"){
    // results wiring is internal
  }
}

function handleHashChange(){
  render();
}

function handleModalConfirm(action){
  if (!action) return;

  if (action === "builder-tree-reset"){
    closeModal(store);
    store.setState((s)=>({
      ...s,
      builder:{
        ...(s.builder || {}),
        mode:"tree",
        tree: null,
        treeSelectedId: null,
        treeUi: { search: "", collapsedGens: [] },
        treeModal: null,
        fromWizardApplied: false,
        heirsByRole: {},
        wizardHashApplied: null,
        payloadPreview: null,
      }
    }), { persist: true });
    return;
  }

  if (action === "builder-tree-import-wizard"){
    closeModal(store);
    importWizardToTree(store);
    return;
  }
}

// Global listeners.
window.addEventListener("hashchange", handleHashChange);

// Store subscription.
store.subscribe(() => render());

// Modal confirm hook.
window.addEventListener("heritage-modal-confirm", (e) => {
  const action = e?.detail?.action || null;
  handleModalConfirm(action);
});

// Initial render.
render();
