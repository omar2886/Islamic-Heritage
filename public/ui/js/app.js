import { mount } from "./render/mount.js";
import { renderLayout } from "./ui/layout.js";
import { createStore } from "./store/store.js";
import { initRouter } from "./router.js";
import { captureFocus, restoreFocus } from "./ui/focus.js";
import { pushToast } from "./ui/toast.js";
import { closeModal } from "./ui/modal.js";
import { wireWizard } from "./pages/wizard.js";
import { wireBuilder } from "./pages/builder.js";
import { wireResults } from "./pages/results.js";

import { fetchRoles } from "./api/client.js";
import { EXPECTED_ROLES, diffRoles } from "./api/contract.js";

const root = document.getElementById("app");
const store = createStore();

let lastFocus = { key: null };
let bootAbort = null;

function wireUi(){
  const btnToast = document.getElementById("btn-toast");
  if (btnToast){
    btnToast.addEventListener("click", () => pushToast(store, "Toast OK"));
  }

  const btnReset = document.getElementById("btn-reset");
  if (btnReset){
    btnReset.addEventListener("click", () => {
      store.reset();
      location.hash = "#/wizard";
      startBootCheck();
    });
  }

  const btnModalClose = document.getElementById("btn-modal-close");
  if (btnModalClose){
    btnModalClose.addEventListener("click", () => closeModal(store));
  }
}

function render(){
  lastFocus = captureFocus();

  const state = store.getState();
  const derived = store.getDerived();

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
