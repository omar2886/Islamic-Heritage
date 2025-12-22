function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function renderToast(state){
  const toasts = (state?.ui?.toasts && Array.isArray(state.ui.toasts)) ? state.ui.toasts : [];
  if (!toasts.length) return "";
  const items = toasts.map((t) => `<div class="toast" role="status">${escapeHtml(t.message)}</div>`).join("");
  return `<div class="toast-wrap">${items}</div>`;
}

export function wireToast(){
  // No DOM listeners required; lifecycle handled via pushToast timeouts.
}

export function pushToast(store, message){
  const toast = {
    id: uid(),
    message: String(message || "").trim() || "OK",
    createdAt: Date.now(),
    ttlMs: 3500,
  };

  store.setState((s) => ({
    ...s,
    ui: { ...s.ui, toasts: [...(s.ui?.toasts || []), toast] },
  }));

  window.setTimeout(() => {
    store.setState((s) => ({
      ...s,
      ui: { ...s.ui, toasts: (s.ui?.toasts || []).filter((t) => t.id !== toast.id) },
    }));
  }, toast.ttlMs);
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
