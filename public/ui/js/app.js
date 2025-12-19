import { mount } from "./render/mount.js";
import { renderLayout } from "./ui/layout.js";
import { createStore } from "./store/store.js";
import { initRouter } from "./router.js";
import { captureFocus, restoreFocus } from "./ui/focus.js";
import { pushToast } from "./ui/toast.js";
import { closeModal } from "./ui/modal.js";

const root = document.getElementById("app");
const store = createStore();

function render(){
  const focusInfo = captureFocus();

  const state = store.getState();
  const derived = store.getDerived();

  mount(root, renderLayout(state, derived));

  restoreFocus(state.ui.focus && state.ui.focus.key ? state.ui.focus : focusInfo);

  const btnToast = document.getElementById("btn-toast");
  if (btnToast){
    btnToast.addEventListener("click", () => pushToast(store, "Toast OK"));
  }

  const btnReset = document.getElementById("btn-reset");
  if (btnReset){
    btnReset.addEventListener("click", () => {
      store.reset();
      location.hash = "#/wizard";
    });
  }

  const btnModalClose = document.getElementById("btn-modal-close");
  if (btnModalClose){
    btnModalClose.addEventListener("click", () => closeModal(store));
  }

  store.setState((s) => ({
    ...s,
    ui: { ...s.ui, focus: focusInfo },
  }), { persist: true });
}

store.subscribe(() => render());

initRouter(store);
render();
