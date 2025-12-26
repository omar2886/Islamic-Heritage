export function $(sel, root = document) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = String(v);
    else if (k === "html") node.innerHTML = String(v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === false || v === null || v === undefined) continue;
    else node.setAttribute(k, String(v));
  }
  for (const ch of (Array.isArray(children) ? children : [children])) {
    if (ch === null || ch === undefined) continue;
    node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
  }
  return node;
}

export function setChildren(node, children) {
  node.textContent = "";
  for (const ch of children) node.appendChild(ch);
}

export function safeJson(v, pretty = true) {
  try {
    return pretty ? JSON.stringify(v, null, 2) : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? Math.trunc(n) : 0;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}
