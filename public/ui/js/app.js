// public/ui/js/app.js
import { createStore } from "./store/store.js";
import { openModal, closeModal } from "./ui/modal.js";
import { startRouter } from "./router.js";
import { renderWizard } from "./pages/wizard.js";
import { renderBuilder } from "./pages/builder.js";
import { renderResults } from "./pages/results.js";
import { renderBuilderTree, bindBuilderTreeEvents, importWizardToTree } from "./pages/builder_tree.js";

const store = createStore();

function mount(){
  const root = document.getElementById("app");
  if (!root) return;

  const state = store.getState();
  const hash = location.hash || "#/wizard";

  let html = "";
  if (hash.startsWith("#/wizard")){
    html = renderWizard(state);
  }else if (hash.startsWith("#/builder")){
    html = renderBuilder(state);
  }else if (hash.startsWith("#/results")){
    html = renderResults(state);
  }else{
    html = renderWizard(state);
  }

  root.innerHTML = html;

  if (hash.startsWith("#/builder") && (state.builder?.mode || "tree") === "tree"){
    bindBuilderTreeEvents(store);
  }
}

function applyWizardSync(store){
  // existing behavior if any, keep as is (no changes here)
  // currently handled in other modules
}

function onModalConfirm(action){
  if (action === "reset-case"){
    closeModal(store);
    store.reset();
    location.hash = "#/wizard";
    return;
  }
  if (action === "builder-apply-wizard"){
    closeModal(store);
    applyWizardSync(store);
    return;
  }
  if (action === "builder-tree-import-wizard"){
    closeModal(store);
    importWizardToTree(store);
    return;
  }
  if (action === "builder-tree-reset"){
    closeModal(store);
    store.setState((s)=>({
      ...s,
      builder:{
        ...s.builder,
        mode:"tree",
        tree: null,
        treeSelectedId: null,
        treeUi: { search:"", collapsedLevels:{}, showDisconnected:true, peopleListCollapsed:false, modal:null },
        fromWizardApplied: false,
        wizardHashApplied: null,
        heirsByRole: {},
        payloadPreview: null
      }
    }), { persist: true });
    return;
  }
}

function boot(){
  mount();

  store.subscribe(() => {
    mount();
  });

  startRouter(store, {
    onModalConfirm,
  });
}

boot();
