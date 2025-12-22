import { createStore } from "./store/store.js";
import { renderLayout, wireLayout } from "./layout.js";
import { startRouter } from "./router.js";
import { closeModal } from "./ui/modal.js";
import { applyWizardSync } from "./pages/builder.js";
import { importWizardToTree } from "./pages/builder_tree.js";

const store = createStore();

function mount(){
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = renderLayout(store.getState(), store.getDerived());
  wireLayout(store);
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
        treeUi: { search:"", collapsed:{}, peopleListCollapsed:false },
        fromWizardApplied: false,
        wizardHashApplied: null,
        heirsByRole: {},
        payloadPreview: null,
      }
    }));
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
