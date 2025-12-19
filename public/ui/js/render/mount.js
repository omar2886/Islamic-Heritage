export function mount(rootEl, html){
  if (!rootEl) throw new Error("mount: rootEl requerido");
  rootEl.innerHTML = html;
}
