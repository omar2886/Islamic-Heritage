import { mount as mountBuilder } from './ui/builder.js';

window.__BOOT_BUILDER_STARTED__ = Date.now();

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
    await mountBuilder();
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
