import { mount as mountGenealogy } from './ui/genealogy.js';

function focusGenealogy(){
  const el = document.getElementById('genealogy-root');
  if (!el) return;
  try {
    el.setAttribute('tabindex','-1');
    el.focus();
  } catch (e) {
    console.warn('No se pudo enfocar genealogía', e);
  }
}

async function init(){
  mountGenealogy();
  focusGenealogy();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ void init(); }, { once: true });
}else{
  void init();
}
