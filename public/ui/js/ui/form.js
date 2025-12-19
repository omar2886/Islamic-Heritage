export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (key === 'class') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.entries(value || {}).forEach(([dataKey, dataValue]) => {
        el.dataset[dataKey] = dataValue;
      });
    } else if (key === 'text') {
      el.textContent = value;
    } else {
      el.setAttribute(key, value);
    }
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === null || child === undefined) return;
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  });
  return el;
}

export function clampNumber(raw, { min = 0, max = 100 } = {}) {
  if (typeof raw === 'string' && raw.trim() === '') return min;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return min;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

export function ensureStylesheet(href, { attr = 'data-ui-style' } = {}) {
  if (typeof document === 'undefined') return null;
  const selector = `[${attr}="${href}"]`;
  const existing = document.querySelector(selector);
  if (existing) return existing;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute(attr, href);
  document.head.appendChild(link);
  return link;
}

export function formatJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return '';
  }
}
