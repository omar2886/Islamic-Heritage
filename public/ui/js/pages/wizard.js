import { ROLE_CATALOG, ROLE_SECTIONS, roleLabel } from '../domain/roles.js';
import { navigate } from '../router.js';
import { store } from '../store/store.js';
import { WIZARD_STEPS } from '../store/derive.js';
import { showToast } from '../ui/toast.js';
import { runCalculation } from '../actions/calc.js';

const STEP_LABELS = {
  intro: 'Introducción',
  roles: 'Roles',
  summary: 'Resumen',
};

const createElement = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (key === 'class') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.entries(value || {}).forEach(([dataKey, dataValue]) => {
        el.dataset[dataKey] = dataValue;
      });
    } else if (key === 'text') {
      el.textContent = value;
    } else {
      el.setAttribute(key, value);
    }
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === null || child === undefined) return;
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  });
  return el;
};

const ensureStylesheet = () => {
  const existing = document.querySelector('[data-wizard-style="true"]');
  if (existing) return existing;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../css/pages.css', import.meta.url).toString();
  link.dataset.wizardStyle = 'true';
  document.head.appendChild(link);
  return link;
};

const formatCount = (count) => (typeof count === 'number' ? count : 0);

const buildStepNav = () => {
  const list = createElement('div', { class: 'wizard-steps' });
  WIZARD_STEPS.forEach((step) => {
    const button = createElement('button', {
      type: 'button',
      class: 'wizard-step-btn',
      dataset: { stepTarget: step },
      'aria-label': `Ir a ${STEP_LABELS[step] || step}`,
    });
    button.appendChild(createElement('span', { class: 'wizard-step-label', text: STEP_LABELS[step] }));
    list.appendChild(button);
  });
  return list;
};

const buildSectionToggles = () => {
  const container = createElement('div', { class: 'wizard-section-switches' });
  ROLE_SECTIONS.forEach((section) => {
    const id = `section-${section.id}`;
    const wrapper = createElement('label', { class: 'wizard-switch', for: id });
    const input = createElement('input', {
      type: 'checkbox',
      id,
      dataset: { sectionId: section.id },
    });
    const title = createElement('span', { class: 'wizard-switch__label', text: section.label });
    wrapper.appendChild(input);
    wrapper.appendChild(title);
    container.appendChild(wrapper);
  });
  return container;
};

const buildRoleGrid = () => {
  const grid = createElement('div', { class: 'wizard-roles-grid' });
  ROLE_SECTIONS.forEach((section) => {
    const card = createElement('section', {
      class: 'wizard-section-card',
      dataset: { sectionId: section.id },
    });
    card.appendChild(createElement('header', { class: 'wizard-section-card__header' }, [
      createElement('h3', { text: section.label }),
      createElement('p', { class: 'wizard-section-card__hint', text: `Sección ${section.id}` }),
    ]));

    const list = createElement('div', { class: 'wizard-roles-list' });
    ROLE_CATALOG.filter((role) => role.section === section.id).forEach((role) => {
      const roleId = `role-${role.id}`;
      const item = createElement('div', {
        class: 'wizard-role',
        dataset: { roleId: role.id },
      });
      const label = createElement('label', { for: roleId });
      label.appendChild(createElement('div', { class: 'wizard-role__title' }, [
        createElement('span', { text: role.label }),
        createElement('small', { class: 'wizard-role__id', text: role.id }),
      ]));
      const input = createElement('input', {
        id: roleId,
        type: 'number',
        min: '0',
        step: '1',
        inputmode: 'numeric',
        dataset: { roleId: role.id },
        class: 'wizard-role__input',
        placeholder: '0',
      });
      label.appendChild(input);
      item.appendChild(label);
      list.appendChild(item);
    });

    card.appendChild(list);
    grid.appendChild(card);
  });
  return grid;
};

const buildList = (titleText, dataKey) => {
  const wrapper = createElement('section', { class: 'wizard-list' });
  wrapper.appendChild(createElement('h4', { text: titleText }));
  const list = createElement('ul', { class: 'wizard-list__items', dataset: { target: dataKey } });
  wrapper.appendChild(list);
  return wrapper;
};

const buildSummary = () => {
  const container = createElement('div', { class: 'wizard-summary' });
  container.appendChild(buildList('Roles seleccionados', 'selected'));
  container.appendChild(buildList('Roles habilitados', 'enabled'));
  container.appendChild(buildList('Avisos', 'warnings'));
  container.appendChild(buildList('Bloqueos duros', 'blocks'));
  return container;
};

const createLayout = () => {
  const root = createElement('section', {
    class: 'wizard-shell',
    dataset: { view: 'wizard' },
    'aria-label': 'Asistente guiado',
  });

  const hero = createElement('div', { class: 'wizard-hero' }, [
    createElement('p', { class: 'wizard-kicker', text: 'Caso guiado' }),
    createElement('h1', { text: 'Asistente de roles' }),
    createElement('p', {
      class: 'wizard-lead',
      text: 'Activa las secciones relevantes, indica quiénes participan y revisa el resumen antes de continuar.',
    }),
  ]);

  const stepsNav = buildStepNav();
  const sectionToggles = buildSectionToggles();
  const roleGrid = buildRoleGrid();
  const summary = buildSummary();

  const introStep = createElement('div', { class: 'wizard-step', dataset: { step: 'intro' } }, [
    createElement('p', {
      text: 'Responderemos con roles consistentes y filtraremos combinaciones imposibles automáticamente.',
    }),
    createElement('div', { class: 'wizard-actions' }, [
      createElement('button', {
        type: 'button',
        class: 'wizard-btn wizard-btn--primary',
        dataset: { stepTarget: 'roles' },
      }, 'Comenzar'),
    ]),
  ]);

  const rolesStep = createElement('div', { class: 'wizard-step', dataset: { step: 'roles' } }, [
    createElement('h2', { text: 'Selecciona roles' }),
    createElement('p', {
      class: 'wizard-hint',
      text: 'Activa secciones y establece cantidades. Limpiamos automáticamente valores inconsistentes.',
    }),
    sectionToggles,
    roleGrid,
    createElement('div', { class: 'wizard-messages', dataset: { messages: 'hard' } }),
    createElement('div', { class: 'wizard-messages wizard-messages--soft', dataset: { messages: 'soft' } }),
    createElement('div', { class: 'wizard-actions' }, [
      createElement('button', {
        type: 'button',
        class: 'wizard-btn',
        dataset: { stepTarget: 'intro' },
      }, 'Volver'),
      createElement('button', {
        type: 'button',
        class: 'wizard-btn wizard-btn--primary',
        dataset: { stepTarget: 'summary' },
      }, 'Ir al resumen'),
    ]),
  ]);

  const summaryStep = createElement('div', { class: 'wizard-step', dataset: { step: 'summary' } }, [
    createElement('h2', { text: 'Resumen del caso' }),
    createElement('p', {
      class: 'wizard-hint',
      text: 'Revisa los roles habilitados y los avisos antes de enviar al motor.',
    }),
    summary,
    createElement('div', { class: 'wizard-actions' }, [
      createElement('button', {
        type: 'button',
        class: 'wizard-btn',
        dataset: { stepTarget: 'roles' },
      }, 'Editar roles'),
      createElement('button', {
        type: 'button',
        class: 'wizard-btn wizard-btn--primary',
        dataset: { action: 'finish' },
      }, 'Finalizar'),
    ]),
  ]);

  const stepsWrapper = createElement('div', { class: 'wizard-steps-wrapper' }, [
    introStep,
    rolesStep,
    summaryStep,
  ]);

  root.appendChild(hero);
  root.appendChild(stepsNav);
  root.appendChild(stepsWrapper);
  return {
    root,
    stepsNav,
    stepsWrapper,
    sectionToggles,
    roleGrid,
    summary,
  };
};

const renderList = (listEl, items, formatter) => {
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!items || items.length === 0) {
    listEl.appendChild(createElement('li', { class: 'wizard-list__empty', text: 'Sin datos' }));
    return;
  }
  items.forEach((item) => {
    listEl.appendChild(createElement('li', { text: formatter(item) }));
  });
};

const renderMessages = (target, messages = []) => {
  if (!target) return;
  target.innerHTML = '';
  messages.forEach((entry) => {
    const text =
      typeof entry === 'string'
        ? entry
        : entry?.message || entry?.reason || entry?.code || 'Aviso';
    target.appendChild(createElement('p', { class: 'wizard-message', text }));
  });
};

const applyStepVisibility = (root, activeStep) => {
  root.querySelectorAll('[data-step]').forEach((stepEl) => {
    const current = stepEl.dataset.step;
    const isActive = current === activeStep;
    stepEl.classList.toggle('is-active', isActive);
    stepEl.hidden = !isActive;
  });

  root.querySelectorAll('[data-step-target]').forEach((button) => {
    const target = button.dataset.stepTarget;
    button.classList.toggle('is-active', target === activeStep);
    button.setAttribute('aria-current', target === activeStep ? 'step' : 'false');
  });
};

const bindEvents = (root) => {
  const onClick = (event) => {
    const target = event.target.closest('[data-step-target],[data-nav],[data-action]');
    if (!target) return;
    event.preventDefault();
    const stepTarget = target.dataset.stepTarget;
    const navTarget = target.dataset.nav;
    const action = target.dataset.action;
    if (stepTarget) {
      store.setState((current) => ({
        ...current,
        wizard: { ...current.wizard, step: stepTarget },
      }));
    }
    if (navTarget) navigate(navTarget);
    if (action === 'finish') {
      runCalculation();
    }
  };

  const onToggle = (event) => {
    const input = event.target.closest('input[type="checkbox"][data-section-id]');
    if (!input) return;
    const { sectionId } = input.dataset;
    const checked = input.checked;
    store.setState((current) => ({
      ...current,
      wizard: {
        ...current.wizard,
        sections: { ...current.wizard.sections, [sectionId]: checked },
      },
    }));
  };

  const onInput = (event) => {
    const input = event.target.closest('input[data-role-id]');
    if (!input) return;
    const { roleId } = input.dataset;
    const value = Number.parseInt(input.value, 10);
    store.setState((current) => {
      const nextSelections = { ...current.wizard.selections };
      if (!Number.isInteger(value) || value <= 0) {
        delete nextSelections[roleId];
      } else {
        nextSelections[roleId] = value;
      }
      return {
        ...current,
        wizard: {
          ...current.wizard,
          selections: nextSelections,
          lastTouchedRole: roleId,
        },
      };
    });
  };

  root.addEventListener('click', onClick);
  root.addEventListener('change', onToggle);
  root.addEventListener('input', onInput);

  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onToggle);
    root.removeEventListener('input', onInput);
  };
};

export function mountWizardPage({ root: providedRoot } = {}) {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector('[data-wizard-mounted="true"]');
  if (existing && !providedRoot) {
    return () => {};
  }
  ensureStylesheet();

  const { root, summary } = createLayout();
  root.dataset.wizardMounted = 'true';
  const host = providedRoot || document.querySelector('[data-view="wizard"]');
  if (host) {
    host.replaceWith(root);
  } else {
    document.body.appendChild(root);
  }

  const cleanupEvents = bindEvents(root);
  let lastHardBlocksSignature = '';

  const render = (state) => {
    const { route, wizard, derived } = state;
    const isWizardRoute = route === 'wizard';
    root.hidden = !isWizardRoute;
    if (!isWizardRoute) return;

    const { sections, selections, step } = wizard;
    const enabledSet = new Set(derived.enabledRoles || []);
    const disabledSet = new Set(derived.disabledRoles || []);

    applyStepVisibility(root, step);

    root.querySelectorAll('input[data-section-id]').forEach((checkbox) => {
      const { sectionId } = checkbox.dataset;
      checkbox.checked = !!sections[sectionId];
    });

    root.querySelectorAll('[data-section-id]').forEach((card) => {
      const { sectionId } = card.dataset;
      const active = !!sections[sectionId];
      card.classList.toggle('is-disabled', !active);
    });

    root.querySelectorAll('input[data-role-id]').forEach((input) => {
      const { roleId } = input.dataset;
      const selected = selections[roleId];
      const roleMeta = ROLE_CATALOG.find((item) => item.id === roleId);
      const sectionActive = roleMeta ? !!sections[roleMeta.section] : true;
      const disabledByRule = disabledSet.has(roleId) || !enabledSet.has(roleId);
      input.disabled = !sectionActive || disabledByRule;
      input.value = selected ?? '';
      input.parentElement?.classList.toggle('is-disabled', input.disabled);
    });

    const hardMessagesContainer = root.querySelector('[data-messages="hard"]');
    const softMessagesContainer = root.querySelector('[data-messages="soft"]');

    renderMessages(hardMessagesContainer, derived.hardBlocks || []);
    renderMessages(softMessagesContainer, derived.softWarnings || []);

    const selectedList = summary.querySelector('[data-target="selected"]');
    const enabledList = summary.querySelector('[data-target="enabled"]');
    const warningsList = summary.querySelector('[data-target="warnings"]');
    const hardList = summary.querySelector('[data-target="blocks"]');

    const selectionPairs = Object.entries(selections || {});
    renderList(selectedList, selectionPairs, ([roleId, count]) => {
      const label = roleLabel(roleId);
      return `${label} – ${formatCount(count)}x`;
    });
    renderList(
      enabledList,
      (derived.enabledRoles || []).map((roleId) => ({ roleId, label: roleLabel(roleId) })),
      ({ roleId, label }) => `${label} (${roleId})`,
    );
    renderList(
      warningsList,
      derived.softWarnings || [],
      (warning) => warning.message || warning.code || 'Aviso',
    );
    renderList(
      hardList,
      derived.hardBlocks || [],
      (block) => block.message || block.code || 'Bloqueo',
    );

    const hardSignature = JSON.stringify(derived.hardBlocks || []);
    if (hardSignature !== lastHardBlocksSignature && derived.hardBlocks?.length) {
      showToast('Aplicamos un filtro lógico para mantener el caso coherente.', { type: 'warning' });
    }
    lastHardBlocksSignature = hardSignature;
  };

  const unsubscribe = store.subscribe(render, { immediate: true });

  return () => {
    cleanupEvents();
    unsubscribe();
  };
}
