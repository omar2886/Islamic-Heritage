window.__BOOT_FLOW_STARTED__ = true;
window.__BOOT_FLOW_MOUNTED__ = false;

async function init() {
  const moduleUrl = new URL('./flow/flow.js', import.meta.url);
  const mod = await import(moduleUrl.href);
  if (typeof mod.mount === 'function') {
    await mod.mount();
  }
  window.__BOOT_FLOW_MOUNTED__ = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void init(); }, { once: true });
} else {
  void init();
}
