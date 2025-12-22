import { mount } from "./render/mount.js";
import { renderLayout } from "./ui/layout.js";
import { createStore } from "./store/store.js";
import { initRouter } from "./router.js";
import { captureFocus, restoreFocus } from "./ui/focus.js";
import { pushToast } from "./ui/toast.js";
import { openModal, closeModal } from "./ui/modal.js";
import { wireWizard } from "./pages/wizard.js";
import { wireBuilder, applyWizardSync } from "./pages/builder.js";
import { wireResults } from "./pages/results.js";
import { importWizardToTree } from "./pages/builder_tree.js";

import { fetchRoles } from "./api/client.js";
import { EXPECTED_ROLES, diffRoles } from "./api/contract.js";

const root = document.getElementById("app");
const store = createStore();

let lastFocus = { key: null };
let bootAbort = null;
let lastRoute = store.getDerived().route;

function wireUi(){
  const btnToast = document.getElementById("btn-toast");
  if (btnToast){
    btnToast.addEventListener("click", () => pushToast(store, "Toast OK"));
  }

  const btnReset = document.getElementById("btn-reset");
  if (btnReset){
    btnReset.addEventListener("click", () => {
      openModal(store, {
        title: "Nuevo caso",
        body: "Se borrará el caso guardado en este navegador y volverás al wizard.",
        confirmLabel: "Confirmar reinicio",
        confirmAction: "reset-case",
      });
    });
  }

  const btnModalClose = document.getElementById("btn-modal-close");
  if (btnModalClose){
    btnModalClose.addEventListener("click", () => closeModal(store));
  }

  const btnModalConfirm = document.getElementById("btn-modal-confirm");
  if (btnModalConfirm){
    btnModalConfirm.addEventListener("click", () => {
      const action = btnModalConfirm.getAttribute("data-confirm-action");
      handleModalConfirm(action);
    });
  }
}

function render(){
  const prevRoute = lastRoute;
  const prevScrollY = window.scrollY;
  lastFocus = captureFocus();

  const state = store.getState();
  const derived = store.getDerived();
  const sameRoute = prevRoute === derived.route;

  mount(root, renderLayout(state, derived));

  restoreFocus(lastFocus);

  wireUi();
  if (derived.route === "wizard"){
    wireWizard(store);
  }
  if (derived.route === "builder"){
    wireBuilder(store);
  }
  if (derived.route === "results"){
    wireResults(store);
  }

  if (sameRoute){
    requestAnimationFrame(() => {
      window.scrollTo(0, prevScrollY);
    });
  }

  lastRoute = derived.route;
}

async function startBootCheck(){
  if (bootAbort) bootAbort.abort();
  bootAbort = new AbortController();

  store.setState((s) => ({
    ...s,
    boot: { ...s.boot, status: "checking", error: null, diff: null, rolesServer: null },
  }), { persist: false });

  const res = await fetchRoles({ signal: bootAbort.signal });

  if (!res.ok){
    store.setState((s) => ({
      ...s,
      boot: { ...s.boot, status: "blocked", error: res.error || "No se pudo cargar roles.php", diff: null, rolesServer: null },
    }), { persist: false });
    return;
  }

  const diff = diffRoles(EXPECTED_ROLES, res.roles);
  if (!diff.ok){
    store.setState((s) => ({
      ...s,
      boot: { ...s.boot, status: "blocked", error: "Roles mismatch entre UI y servidor", diff, rolesServer: res.roles },
    }), { persist: false });
    return;
  }

  store.setState((s) => ({
    ...s,
    boot: { ...s.boot, status: "ready", error: null, diff: null, rolesServer: res.roles },
  }), { persist: false });
}

store.subscribe(() => render());

initRouter(store);
render();
startBootCheck();

function handleModalConfirm(action){
  if (!action) return;
  if (action === "reset-case"){
    closeModal(store);
    store.reset();
    location.hash = "#/wizard";
    startBootCheck();
    return;
  }
  if (action === "builder-apply-wizard"){
    closeModal(store);
    applyWizardSync(store);
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
        fromWizardApplied: false,
        wizardHashApplied: null,
      }
    }));
    return;
  }
}
