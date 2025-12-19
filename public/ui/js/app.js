import { navigate, startRouter } from './router.js';
import { normalizeRoute } from './store/derive.js';
import { store } from './store/store.js';
import { createFocusManager } from './ui/focus.js';
import { createModal } from './ui/modal.js';
import { showToast } from './ui/toast.js';

const focusManager = createFocusManager();
const modal = createModal();

const render = (state) => {
  const { route, derived } = state;
  document.body.dataset.route = route;
  const sections = document.querySelectorAll('[data-view]');
  sections.forEach((section) => {
    const targetRoute = normalizeRoute(section.dataset.view);
    const active = targetRoute === route;
    if (!active) focusManager.snapshot(targetRoute);
    section.hidden = !active;
    section.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (active) focusManager.restore(targetRoute, section);
  });

  document.querySelectorAll('[data-nav]').forEach((nav) => {
    const target = normalizeRoute(nav.getAttribute('data-nav'));
    const active = target === route;
    nav.classList.toggle('is-active', active);
    nav.setAttribute('aria-current', active ? 'page' : 'false');
  });

  const reset = document.querySelector('[data-action="reset"]');
  if (reset) reset.disabled = !derived?.hasUserData;
};

const handleNav = (event) => {
  const target = event.target.closest('[data-nav]');
  if (!target) return;
  event.preventDefault();
  navigate(target.getAttribute('data-nav') || 'wizard');
};

const handleReset = () => {
  store.reset({ source: 'reset-button' });
  focusManager.reset();
  navigate('wizard', { replace: true });
  showToast('Estado reiniciado');
};

const bootstrap = () => {
  document.addEventListener('click', handleNav);
  const resetBtn = document.querySelector('[data-action="reset"]');
  if (resetBtn) resetBtn.addEventListener('click', handleReset);

  const stopRouter = startRouter(store);
  const unsubscribe = store.subscribe(render, { immediate: true });

  window.addEventListener('unload', () => {
    stopRouter();
    unsubscribe();
  });

  window.__IH_UI__ = {
    store,
    navigate,
    modal,
    toast: showToast,
  };
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
