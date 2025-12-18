window.__BOOT_GENEALOGY_STARTED__ = true;

const baseUrl = new URL('.', import.meta.url);
const loadModule = () => import(new URL('./ui/genealogy.js', baseUrl));

function focusGenealogy(){
  const el = document.getElementById('genealogy-root');
  if (!el) return;
  try {
    el.setAttribute('tabindex','-1');
    el.focus();
  } catch {
    /* ignore focus issues */
  }
}

async function init(){
  try {
    const mod = await loadModule();
    if (typeof mod.mount === 'function') {
      await mod.mount();
    }
    window.__BOOT_GENEALOGY_MOUNTED__ = true;
  } catch (e) {
    console.error(e);
    window.__BOOT_GENEALOGY_ERROR__ = String(e?.stack || e);
    throw e;
  }
  focusGenealogy();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ void init(); }, { once: true });
}else{
  void init();
}
