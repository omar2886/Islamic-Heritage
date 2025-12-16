import { mount as mountBuilder } from './ui/builder.js';

function focusFirstRoot(){
  const ids = ['builder-root', 'results-root', 'home-root'];
  for (const id of ids){
    const el = document.getElementById(id);
    if (el){
      try {
        el.setAttribute('tabindex', '-1');
        el.focus();
      } catch (e) {
        console.warn('No se pudo enfocar', id, e);
      }
      break;
    }
  }
}

async function init(){
  await mountBuilder();
  focusFirstRoot();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ void init(); }, { once: true });
}else{
  void init();
}
