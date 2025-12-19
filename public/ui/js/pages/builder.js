import { ROLE_CATALOG, ROLE_SECTIONS, roleLabel } from '../domain/roles.js';
import { navigate } from '../router.js';
import { store } from '../store/store.js';
import { clampNumber, createElement, ensureStylesheet, formatJson } from '../ui/form.js';
import { showToast } from '../ui/toast.js';

const ensureStylesheets = () => {
  const pagesHref = new URL('../../css/pages.css', import.meta.url).toString();
  const componentsHref = new URL('../../css/components.css', import.meta.url).toString();
  ensureStylesheet(pagesHref, { attr: 'data-builder-style' });
  ensureStylesheet(componentsHref, { attr: 'data-builder-style' });
};

const buildSectionCard = (section) => {
  const header = createElement('div', { class: 'builder-section__header' });
  const title = createElement('h3', { class: 'builder-section__title' }, [
    createElement('span', { text: section.label }),
    createElement('span', { class: 'ui-badge', text: section.id }),
  ]);
  const actions = createElement('div', { class: 'builder-section__actions' });

  const collapseBtn = createElement(
    'button',
    {
      type: 'button',
      class: 'ui-btn ui-btn--ghost',
      dataset: { collapseSection: section.id },
      'aria-label': `Plegar sección ${section.label}`,
    },
    'Plegar',
  );

  const toggle = createElement('label', { class: 'ui-pill' });
  const input = createElement('input', {
    type: 'checkbox',
    dataset: { sectionToggle: section.id },
  });
  toggle.appendChild(input);
  toggle.appendChild(createElement('span', { text: 'Activa' }));

  actions.appendChild(collapseBtn);
  actions.appendChild(toggle);

  header.appendChild(title);
  header.appendChild(actions);

  const body = createElement('div', { class: 'builder-section__body', dataset: { roleList: section.id } });

  return {
    card: createElement(
      'section',
      { class: 'builder-section', dataset: { sectionId: section.id } },
      [header, body],
    ),
    body,
    toggle,
  };
};

const buildLayout = () => {
  const root = createElement('section', {
    class: 'builder-shell',
    dataset: { view: 'builder' },
    'aria-label': 'Family Structure Builder',
  });

  const hero = createElement('div', { class: 'builder-hero' }, [
    createElement('div', {}, [
      createElement('p', { class: 'ui-muted', text: 'Roles y conteos' }),
      createElement('h1', { class: 'builder-hero__title', text: 'Family Structure Builder' }),
      createElement('p', {
        class: 'builder-hero__lead',
        text: 'Ajusta los roles habilitados, define cuántas personas hay en cada categoría y revisa el payload antes de calcular.',
      }),
    ]),
    createElement('div', { class: 'ui-toolbar' }, [
      createElement(
        'button',
        { type: 'button', class: 'ui-btn', dataset: { nav: 'wizard' } },
        'Volver al asistente',
      ),
      createElement(
        'button',
        { type: 'button', class: 'ui-btn ui-btn--ghost', dataset: { action: 'clear-heirs' } },
        'Vaciar conteos',
      ),
    ]),
  ]);

  const sectionsContainer = createElement('div', { class: 'builder-sections', dataset: { sections: 'true' } });
  const sectionCards = ROLE_SECTIONS.map((section) => buildSectionCard(section));
  sectionCards.forEach(({ card }) => sectionsContainer.appendChild(card));

  const selectionList = createElement('ul', { class: 'ui-list', dataset: { selectionList: 'heirs' } });
  const hardContainer = createElement('div', { class: 'ui-alert', dataset: { messages: 'hard' } });
  const softContainer = createElement('div', { class: 'ui-alert ui-alert--soft', dataset: { messages: 'soft' } });

  const statusCard = createElement('div', { class: 'ui-card' }, [
    createElement('div', { class: 'ui-card__header' }, [
      createElement('h3', { class: 'ui-card__title', text: 'Estado y avisos' }),
      createElement('span', { class: 'ui-card__meta', text: 'Guardarraíles activos' }),
    ]),
    createElement('div', { class: 'ui-card__meta', text: 'Roles seleccionados' }),
    selectionList,
    createElement('div', { class: 'ui-divider' }),
    createElement('div', { class: 'ui-card__meta', text: 'Bloqueos duros' }),
    hardContainer,
    createElement('div', { class: 'ui-divider' }),
    createElement('div', { class: 'ui-card__meta', text: 'Avisos suaves' }),
    softContainer,
  ]);

  const previewCode = createElement('pre', { class: 'ui-code', dataset: { preview: 'json' } });
  const previewMeta = createElement('div', { class: 'builder-preview__meta' }, [
    createElement('span', { class: 'ui-badge', dataset: { previewCount: 'heirs' } }),
    createElement('span', { class: 'ui-badge', dataset: { previewStatus: 'ready' } }),
  ]);

  const previewCard = createElement('div', { class: 'ui-card builder-preview' }, [
    createElement('div', { class: 'ui-card__header' }, [
      createElement('h3', { class: 'ui-card__title', text: 'Payload preview' }),
      createElement('span', { class: 'ui-card__meta', text: 'Listo para POST' }),
    ]),
    createElement('details', { open: true }, [
      createElement('summary', {}, [
        createElement('span', { text: 'Ver JSON' }),
        previewMeta,
      ]),
      createElement('div', { class: 'ui-divider' }),
      previewCode,
    ]),
    createElement('div', { class: 'ui-divider' }),
    createElement('div', { class: 'ui-toolbar' }, [
      createElement(
        'button',
        {
          type: 'button',
          class: 'ui-btn ui-btn--primary',
          dataset: { action: 'calculate' },
        },
        'Calcular',
      ),
      createElement(
        'button',
        {
          type: 'button',
          class: 'ui-btn ui-btn--ghost',
          dataset: { action: 'copy-payload' },
        },
        'Copiar JSON',
      ),
    ]),
  ]);

  const sidebar = createElement('div', { class: 'builder-sidebar' }, [statusCard, previewCard]);

  const layout = createElement('div', { class: 'builder-layout' }, [sectionsContainer, sidebar]);

  root.appendChild(hero);
  root.appendChild(layout);

  return {
    root,
    sectionsContainer,
    sectionCards,
    selectionList,
    hardContainer,
    softContainer,
    previewCode,
    previewMeta,
    previewCard,
  };
};

const renderMessages = (target, messages = [], options = {}) => {
  if (!target) return;
  const { empty = 'Sin mensajes' } = options;
  target.innerHTML = '';
  const list = Array.isArray(messages) ? messages : [];
  if (list.length === 0) {
    target.appendChild(createElement('p', { class: 'ui-muted', text: empty }));
    return;
  }
  list.forEach((entry) => {
    const text =
      typeof entry === 'string' ? entry : entry?.message || entry?.reason || entry?.code || 'Aviso';
    target.appendChild(createElement('p', { class: 'builder-message', text }));
  });
};

const renderSelection = (target, pairs = []) => {
  if (!target) return;
  target.innerHTML = '';
  if (!pairs || pairs.length === 0) {
    target.appendChild(createElement('li', { class: 'builder-empty', text: 'Sin herederos activos' }));
    return;
  }
  pairs.forEach(([roleId, count]) => {
    target.appendChild(
      createElement('li', { class: 'ui-list__item' }, [
        createElement('div', { class: 'builder-role__meta' }, [
          createElement('strong', { text: roleLabel(roleId) }),
          createElement('span', { class: 'builder-role__id', text: `${roleId} · ${count}x` }),
        ]),
      ]),
    );
  });
};

const buildPayloadText = (payload) => (payload ? formatJson(payload) : '');

const clampCount = (value) => clampNumber(value, { min: 0, max: 100 });

export function mountBuilderPage({ root: providedRoot } = {}) {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector('[data-builder-mounted="true"]');
  if (existing && !providedRoot) return () => {};

  ensureStylesheets();

  const {
    root,
    sectionCards,
    selectionList,
    hardContainer,
    softContainer,
    previewCode,
    previewMeta,
  } = buildLayout();

  root.dataset.builderMounted = 'true';
  const host = providedRoot || document.querySelector('[data-view="builder"]');
  if (host) {
    host.replaceWith(root);
  } else {
    document.body.appendChild(root);
  }

  const collapsedSections = new Set();
  let lastState = store.getState();

  const updateRoleCount = (roleId, value) => {
    const nextValue = clampCount(value);
    store.setState((current) => {
      const enabledSet = new Set(current?.derived?.enabledRoles || []);
      if (!enabledSet.has(roleId)) return current;
      const selections = { ...current.wizard.selections };
      const draft = { ...current.builder.draft };
      if (!Number.isInteger(nextValue) || nextValue <= 0) {
        delete selections[roleId];
        delete draft[roleId];
      } else {
        selections[roleId] = nextValue;
        draft[roleId] = nextValue;
      }
      return {
        ...current,
        wizard: { ...current.wizard, selections, lastTouchedRole: roleId },
        builder: { ...current.builder, draft },
      };
    });
  };

  const handleSectionToggle = (sectionId, enabled) => {
    const rolesInSection = ROLE_CATALOG.filter((role) => role.section === sectionId).map(
      (role) => role.id,
    );
    store.setState((current) => {
      const sections = { ...current.wizard.sections, [sectionId]: enabled };
      const selections = { ...current.wizard.selections };
      const draft = { ...current.builder.draft };
      if (!enabled) {
        rolesInSection.forEach((roleId) => {
          delete selections[roleId];
          delete draft[roleId];
        });
      }
      return {
        ...current,
        wizard: { ...current.wizard, sections },
        builder: { ...current.builder, draft },
      };
    });
  };

  const handleAction = (action) => {
    if (action === 'clear-heirs') {
      store.setState((current) => ({
        ...current,
        wizard: { ...current.wizard, selections: {}, lastTouchedRole: null },
        builder: { ...current.builder, draft: {} },
      }));
      showToast('Conteos reiniciados');
    }
    if (action === 'calculate') {
      const hasHardBlocks = lastState?.derived?.hardBlocks?.length > 0;
      const heirsCount = lastState?.derived?.payloadPreview?.heirs?.length || 0;
      if (hasHardBlocks || heirsCount === 0) return;
      showToast('Payload listo para enviar al motor.', { type: 'success' });
    }
    if (action === 'copy-payload') {
      const payload = lastState?.derived?.payloadPreview;
      if (!payload) return;
      const text = buildPayloadText(payload);
      if (!navigator?.clipboard?.writeText) {
        showToast('El portapapeles no está disponible en este navegador.', { type: 'warning' });
        return;
      }
      navigator.clipboard?.writeText?.(text).then(
        () => showToast('Payload copiado al portapapeles.'),
        () => showToast('No se pudo copiar el payload.', { type: 'error' }),
      );
    }
  };

  const bindEvents = () => {
    const onClick = (event) => {
      const target = event.target.closest(
        '[data-nav],[data-counter-op],[data-collapse-section],[data-action]',
      );
      if (!target) return;
      const { nav, counterOp, collapseSection, action } = target.dataset;
      if (nav) {
        event.preventDefault();
        navigate(nav);
        return;
      }
      if (collapseSection) {
        event.preventDefault();
        if (collapsedSections.has(collapseSection)) {
          collapsedSections.delete(collapseSection);
        } else {
          collapsedSections.add(collapseSection);
        }
        render(lastState);
        return;
      }
      if (counterOp) {
        event.preventDefault();
        const { roleId } = target.dataset;
        if (!roleId) return;
        const delta = counterOp === 'inc' ? 1 : -1;
        const current = clampCount(lastState?.wizard?.selections?.[roleId] || 0);
        updateRoleCount(roleId, current + delta);
        return;
      }
      if (action) {
        event.preventDefault();
        handleAction(action);
      }
    };

    const onChange = (event) => {
      const sectionToggle = event.target.closest('input[type="checkbox"][data-section-toggle]');
      if (sectionToggle) {
        const { sectionToggle: sectionId } = sectionToggle.dataset;
        handleSectionToggle(sectionId, sectionToggle.checked);
      }
    };

    const onInput = (event) => {
      const input = event.target.closest('input[data-role-id]');
      if (!input) return;
      const { roleId } = input.dataset;
      updateRoleCount(roleId, clampCount(input.value));
    };

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);

    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.removeEventListener('input', onInput);
    };
  };

  const render = (state) => {
    lastState = state;
    const { route, wizard, derived, builder } = state;
    const isBuilderRoute = route === 'builder';
    root.hidden = !isBuilderRoute;
    if (!isBuilderRoute) return;

    const enabledSet = new Set(derived.enabledRoles || []);

    sectionCards.forEach(({ card, body, toggle }) => {
      const sectionId = card.dataset.sectionId;
      const enabled = !!wizard.sections[sectionId];
      const collapsed = collapsedSections.has(sectionId);

      card.classList.toggle('is-disabled', !enabled);
      card.classList.toggle('is-collapsed', collapsed);
      toggle.querySelector('input').checked = enabled;
      toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');

      body.innerHTML = '';
      const roles = ROLE_CATALOG.filter(
        (role) => role.section === sectionId && enabledSet.has(role.id),
      );

      if (!enabled) {
        body.appendChild(
          createElement('p', {
            class: 'builder-empty',
            text: 'Activa la sección para ver los roles disponibles.',
          }),
        );
        return;
      }

      if (roles.length === 0) {
        body.appendChild(
          createElement('p', {
            class: 'builder-empty',
            text: 'Sin roles disponibles por los guardarraíles actuales.',
          }),
        );
        return;
      }

      roles.forEach((role) => {
        const count =
          clampCount(wizard?.selections?.[role.id] ?? builder?.draft?.[role.id] ?? 0) || '';
        body.appendChild(
          createElement('div', { class: 'builder-role', dataset: { roleId: role.id } }, [
            createElement('div', { class: 'builder-role__meta' }, [
              createElement('strong', { text: role.label }),
              createElement('span', { class: 'builder-role__id', text: role.id }),
            ]),
            createElement('div', { class: 'ui-counter' }, [
              createElement(
                'button',
                {
                  type: 'button',
                  class: 'ui-counter__btn',
                  dataset: { counterOp: 'dec', roleId: role.id },
                  'aria-label': `Restar ${role.label}`,
                },
                '−',
              ),
              createElement('input', {
                type: 'number',
                class: 'ui-counter__input',
                min: '0',
                max: '100',
                step: '1',
                inputmode: 'numeric',
                value: count,
                dataset: { roleId: role.id },
                'aria-label': `${role.label} (${role.id})`,
              }),
              createElement(
                'button',
                {
                  type: 'button',
                  class: 'ui-counter__btn',
                  dataset: { counterOp: 'inc', roleId: role.id },
                  'aria-label': `Sumar ${role.label}`,
                },
                '+',
              ),
            ]),
          ]),
        );
      });
    });

    const selectionPairs = Object.entries(wizard.selections || {})
      .filter(([, count]) => Number.isFinite(count) && count > 0)
      .filter(([roleId]) => enabledSet.has(roleId));
    renderSelection(selectionList, selectionPairs);
    renderMessages(hardContainer, derived.hardBlocks || []);
    renderMessages(softContainer, derived.softWarnings || [], { empty: 'Sin avisos' });

    const payload = derived.payloadPreview || { heirs: [] };
    previewCode.textContent = buildPayloadText(payload);
    const heirCount = payload.heirs?.length || 0;
    const hasHardBlocks = (derived.hardBlocks || []).length > 0;
    const countBadge = previewMeta.querySelector('[data-preview-count="heirs"]');
    const statusBadge = previewMeta.querySelector('[data-preview-status="ready"]');
    if (countBadge) countBadge.textContent = `${heirCount} heredero(s)`;
    if (statusBadge) {
      statusBadge.textContent = hasHardBlocks
        ? 'Faltan ajustes'
        : heirCount > 0
          ? 'Listo'
          : 'Incompleto';
    }

    const calculateBtn = root.querySelector('[data-action="calculate"]');
    if (calculateBtn) {
      calculateBtn.disabled = hasHardBlocks || heirCount === 0;
    }
  };

  const cleanup = bindEvents();
  const unsubscribe = store.subscribe(render, { immediate: true });

  return () => {
    cleanup();
    unsubscribe();
  };
}
