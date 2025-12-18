import { mount } from './flow/flow.js';

window.__BOOT_FLOW_STARTED__ = true;
window.__BOOT_FLOW_MOUNTED__ = false;

function start() {
  const root = document.getElementById('flow-root') || document.getElementById('flowApp');
  mount(root).finally(() => {
    window.__BOOT_FLOW_MOUNTED__ = true;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => start(), { once: true });
} else {
  start();
}
