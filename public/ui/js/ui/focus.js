export function captureFocus(){
  const el = document.activeElement;
  if (!el) return { key: null };

  const key =
    (el.getAttribute && el.getAttribute("data-focus-key")) ||
    (el.id ? `id:${el.id}` : null);

  return { key: key || null };
}

export function restoreFocus(info){
  const key = info && info.key ? String(info.key) : null;
  if (!key) return;

  if (key.startsWith("id:")){
    const id = key.slice(3);
    const target = document.getElementById(id);
    if (target && typeof target.focus === "function") target.focus();
    return;
  }

  const target = document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  if (target && typeof target.focus === "function") target.focus();
}
