window.__BOOT_BUILDER_STARTED__ = true;

const baseUrl = new URL('.', import.meta.url);
const loadModule = () => import(new URL('./ui/builder.js', baseUrl));

function focusFirstRoot(){
  const ids = ['builder-root', 'results-root', 'home-root'];
  for (const id of ids){
    const el = document.getElementById(id);
    if (el){
      try {
        el.setAttribute('tabindex', '-1');
        el.focus();
      } catch {
        /* ignore focus issues */
      }
      break;
    }
  }
}

async function init(){
  try {
    const mod = await loadModule();
    if (typeof mod.mount === 'function') {
      await mod.mount();
    }
    window.__BOOT_BUILDER_MOUNTED__ = true;
  } catch (e) {
    console.error(e);
    window.__BOOT_BUILDER_ERROR__ = String(e?.stack || e);
    throw e;
  }
  focusFirstRoot();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ void init(); }, { once: true });
}else{
  void init();
}
