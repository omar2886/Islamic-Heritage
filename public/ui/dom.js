export function $(sel, root = document) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

export function setText(el, text) {
  el.textContent = String(text ?? "");
}

export function setHidden(el, hidden) {
  el.hidden = !!hidden;
}

export function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function safeStringify(value, pretty = true) {
  try {
    return pretty ? prettyJson(value) : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
