import { mount } from './router.js';
const page = document.body.getAttribute('data-page') || 'home';
mount(page);

// A11y: al cargar/tras cambiar vista, enfocar el primer root conocido si existe
(function focusMain(){
  function go(){
    const ids = ['builder-root','results-root','home-root'];
    for (const id of ids){
      const el = document.getElementById(id);
      if (el){ try{ el.setAttribute('tabindex','-1'); el.focus(); }catch{} break; }
    }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') go();
  else document.addEventListener('DOMContentLoaded', go);
})();
