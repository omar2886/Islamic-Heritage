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

function init(){
  focusFirstRoot();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init, { once: true });
}else{
  init();
}
