function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

export function openModal(store, modal){
  store.setState((s) => ({
    ...s,
    ui: { ...s.ui, modal: modal || null },
  }), { persist: false });
}

export function closeModal(store){
  store.setState((s) => ({
    ...s,
    ui: { ...s.ui, modal: null },
  }), { persist: false });
}

export function renderModal(state){
  const modal = state?.ui?.modal;
  if (!modal) return "";
  const title = escapeHtml(modal.title || "Modal");
  const body = escapeHtml(modal.body || "");
  const confirmAction = typeof modal.confirmAction === "string" ? modal.confirmAction : null;
  const confirmLabel = escapeHtml(modal.confirmLabel || "Confirmar");
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal card card-pad">
        <div class="row" style="justify-content:space-between; align-items:flex-start; gap:10px;">
          <strong>${title}</strong>
          <button class="btn" type="button" id="btn-modal-close">Cerrar</button>
        </div>
        <p style="color:var(--muted); margin:10px 0 0; line-height:1.4;">${body}</p>
        ${confirmAction ? `
          <div class="row" style="justify-content:flex-end; flex-wrap:wrap; margin-top:12px;">
            <button class="btn" type="button" id="btn-modal-confirm" data-confirm-action="${escapeHtml(confirmAction)}">${confirmLabel}</button>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

export function wireModal(store){
  const btnClose = document.getElementById("btn-modal-close");
  if (btnClose){
    btnClose.addEventListener("click", () => closeModal(store));
  }

  const btnConfirm = document.getElementById("btn-modal-confirm");
  if (btnConfirm){
    btnConfirm.addEventListener("click", () => {
      const action = btnConfirm.getAttribute("data-confirm-action");
      const evt = new CustomEvent("heritage-modal-confirm", { detail: { action } });
      window.dispatchEvent(evt);
    });
  }
}
