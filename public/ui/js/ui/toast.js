function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
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
    ui: { ...s.ui, toasts: [...s.ui.toasts, toast] },
  }));

  window.setTimeout(() => {
    store.setState((s) => ({
      ...s,
      ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== toast.id) },
    }));
  }, toast.ttlMs);
}
