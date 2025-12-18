import { mount } from './ui/builder3.js';

function focusRoot(root) {
  if (!root) return;
  if (!root.hasAttribute('tabindex')) {
    root.setAttribute('tabindex', '-1');
  }
  root.focus();
}

async function init() {
  const root = await mount();
  focusRoot(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void init(); }, { once: true });
} else {
  void init();
}
