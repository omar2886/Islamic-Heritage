// public/ui/js/ui/toast.js
export function pushToast(store, message, kind = "info", ttlMs = 2600){
  const id = Math.random().toString(36).slice(2);
  const toast = {
    id,
    kind,
    message: String(message || ""),
    expiresAt: Date.now() + ttlMs,
  };

  store.setState((s) => ({
    ...s,
    ui: {
      ...(s.ui || {}),
      toasts: [ ...(s.ui?.toasts || []), toast ],
    },
  }), { persist: false });

  window.setTimeout(() => {
    store.setState((s) => ({
      ...s,
      ui: {
        ...(s.ui || {}),
        toasts: (s.ui?.toasts || []).filter((t) => t.id !== id),
      },
    }), { persist: false });
  }, ttlMs + 30);
}

export function renderToast(state){
  const toasts = state?.ui?.toasts || [];
  if (!toasts.length) return "";

  const now = Date.now();
  const alive = toasts.filter((t) => !t.expiresAt || t.expiresAt > now);
  if (!alive.length) return "";

  return `
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      ${alive.map((t) => `
        <div class="toast ${t.kind || "info"}">
          <div class="toast__msg">${escapeHtml(t.message || "")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
