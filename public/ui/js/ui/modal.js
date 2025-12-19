export function openModal(store, modal){
  store.setState((s) => ({
    ...s,
    ui: { ...s.ui, modal: modal || null },
  }));
}

export function closeModal(store){
  store.setState((s) => ({
    ...s,
    ui: { ...s.ui, modal: null },
  }));
}
