import { navigate, startRouter } from './router.js';
import { normalizeRoute } from './store/derive.js';
import { store } from './store/store.js';
import { fetchRolesCatalog } from './api/contract.js';
import { ROLE_CATALOG, diffRoleSets, roleLabel } from './domain/roles.js';
import { createFocusManager } from './ui/focus.js';
import { createModal } from './ui/modal.js';
import { showToast } from './ui/toast.js';

const focusManager = createFocusManager();
const modal = createModal();
let navigationEnabled = false;

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
  if (!navigationEnabled) return;
  const target = event.target.closest('[data-nav]');
  if (!target) return;
  event.preventDefault();
  navigate(target.getAttribute('data-nav') || 'wizard');
};

const handleReset = () => {
  if (!navigationEnabled) return;
  store.reset({ source: 'reset-button' });
  focusManager.reset();
  navigate('wizard', { replace: true });
  showToast('Estado reiniciado');
};

const formatRoleList = (roleIds) =>
  roleIds
    .map((id) => `${roleLabel(id)} (${id})`)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .join(', ');

const renderBlockingError = (title, messages = []) => {
  let blocker = document.querySelector('[data-guard-blocker]');

  if (!blocker) {
    blocker = document.createElement('div');
    blocker.setAttribute('data-guard-blocker', 'true');
    blocker.style.position = 'fixed';
    blocker.style.inset = '0';
    blocker.style.background = 'rgba(0,0,0,0.85)';
    blocker.style.color = '#fff';
    blocker.style.zIndex = '10000';
    blocker.style.display = 'grid';
    blocker.style.placeItems = 'center';
    blocker.style.padding = '1rem';
    const container = document.createElement('div');
    container.style.background = '#111';
    container.style.padding = '1.5rem';
    container.style.borderRadius = '14px';
    container.style.maxWidth = '680px';
    container.style.width = 'min(92vw, 680px)';
    container.style.boxShadow = '0 16px 50px rgba(0,0,0,0.35)';
    container.setAttribute('data-guard-blocker-container', 'true');
    blocker.appendChild(container);
    document.body.appendChild(blocker);
  }

  const container = blocker.querySelector('[data-guard-blocker-container]');
  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = title;
  heading.style.marginTop = '0';
  container.appendChild(heading);

  const list = document.createElement('ul');
  list.style.lineHeight = '1.6';

  const items = Array.isArray(messages) ? messages : [messages];
  items.filter(Boolean).forEach((message) => {
    const li = document.createElement('li');
    li.textContent = message;
    list.appendChild(li);
  });

  container.appendChild(list);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reintentar';
  retry.style.marginTop = '1rem';
  retry.style.padding = '0.6rem 0.9rem';
  retry.style.borderRadius = '10px';
  retry.style.border = 'none';
  retry.style.background = '#fff';
  retry.style.color = '#000';
  retry.addEventListener('click', () => window.location.reload());

  container.appendChild(retry);
  blocker.hidden = false;
};

const ensureRoleCatalog = async () => {
  try {
    const remote = await fetchRolesCatalog();
    const expected = ROLE_CATALOG.map((item) => item.id);
    const diff = diffRoleSets(remote.roles, expected);

    if (!diff.ok) {
      const issues = [];
      if (diff.missing.length > 0) {
        issues.push(`Faltan en la API: ${formatRoleList(diff.missing)}`);
      }
      if (diff.extra.length > 0) {
        issues.push(`Rol(es) desconocidos en la API: ${formatRoleList(diff.extra)}`);
      }
      renderBlockingError('Catálogo de roles incompatible', issues);
      return false;
    }

    return true;
  } catch (error) {
    renderBlockingError('No se pudo cargar el catálogo de roles', [error?.message || 'Error de red']);
    return false;
  }
};

const bootstrap = () => {
  document.addEventListener('click', handleNav);
  const resetBtn = document.querySelector('[data-action="reset"]');
  if (resetBtn) resetBtn.addEventListener('click', handleReset);

  ensureRoleCatalog().then((ok) => {
    if (!ok) return;

    navigationEnabled = true;
    const stopRouter = startRouter(store);
    const unsubscribe = store.subscribe(render, { immediate: true });

    window.addEventListener('unload', () => {
      stopRouter();
      unsubscribe();
    });
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
