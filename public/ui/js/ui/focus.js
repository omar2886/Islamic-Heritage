const escapeSelector = (value) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([\\.#:[\],])/g, '\\$1');
};

const getCandidateKey = (element, { attribute }) => {
  if (!element) return null;
  const attr = element.getAttribute(attribute);
  if (attr) return attr;
  if (element.id) return element.id;
  return null;
};

export function createFocusManager(options = {}) {
  const {
    attribute = 'data-focus-key',
    defaultSelector = '[data-focus-default], [autofocus]',
    fallbacks = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  } = options;
  const memory = new Map();

  const snapshot = (view) => {
    if (!view) return;
    const key = getCandidateKey(document.activeElement, { attribute });
    if (key) memory.set(view, key);
  };

  const restore = (view, root = document) => {
    if (!view || !root) return;
    const key = memory.get(view);
    let target = null;
    if (key) {
      const selector = `[${attribute}="${escapeSelector(key)}"], #${escapeSelector(key)}`;
      target = root.querySelector(selector);
    }
    if (!target) target = root.querySelector(defaultSelector);
    if (!target) target = root.querySelector(fallbacks);
    if (target && typeof target.focus === 'function') {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  };

  const reset = () => memory.clear();

  return { snapshot, restore, reset };
}
