import { runCalculation } from '../actions/calc.js';
import { roleLabel } from '../domain/roles.js';
import { navigate } from '../router.js';
import { store } from '../store/store.js';
import { createElement, ensureStylesheet } from '../ui/form.js';

const ensureStylesheets = () => {
  const pagesHref = new URL('../../css/pages.css', import.meta.url).toString();
  const componentsHref = new URL('../../css/components.css', import.meta.url).toString();
  const printHref = new URL('../../css/print.css', import.meta.url).toString();
  ensureStylesheet(pagesHref, { attr: 'data-results-style' });
  ensureStylesheet(componentsHref, { attr: 'data-results-style' });
  if (!document.querySelector('[data-results-print="true"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = printHref;
    link.media = 'print';
    link.dataset.resultsPrint = 'true';
    document.head.appendChild(link);
  }
};

const formatTimestamp = (value) => {
  if (!value) return 'Sin cálculo previo';
  try {
    const dt = new Date(value);
    return dt.toLocaleString('es-ES', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (err) {
    return 'Sin cálculo previo';
  }
};

const buildTable = () => {
  const header = createElement('thead', {}, [
    createElement('tr', {}, [
      createElement('th', { text: 'Rol' }),
      createElement('th', { text: 'Fracción' }),
      createElement('th', { text: 'Porcentaje (≈)' }),
      createElement('th', { text: 'Importe' }),
    ]),
  ]);
  const body = createElement('tbody', { dataset: { tableBody: 'shares' } });
  return { table: createElement('table', { class: 'results-table' }, [header, body]), body };
};

const buildTimeline = () => createElement('div', { class: 'results-timeline', dataset: { timeline: 'true' } });

const buildHero = () => {
  const statusChip = createElement('span', { class: 'results-chip', dataset: { status: 'idle' }, text: 'Pendiente' });
  const sumChip = createElement('span', { class: 'results-chip results-chip--muted', dataset: { chip: 'sum' }, text: 'Sumatorio 0/0' });
  const timestamp = createElement('span', { class: 'results-meta__value', dataset: { meta: 'timestamp' }, text: 'Sin cálculo previo' });

  const hero = createElement('div', { class: 'results-hero' }, [
    createElement('div', {}, [
      createElement('p', { class: 'ui-muted', text: 'Motor / API' }),
      createElement('h1', { class: 'results-hero__title', text: 'Resultados del cálculo' }),
      createElement('p', {
        class: 'results-hero__lead',
        text: 'Tabla de reparto, avisos de auditoría y explicación paso a paso. La fracción es la fuente de verdad; porcentajes e importes se muestran con redondeo.',
      }),
      createElement('div', { class: 'results-hero__meta' }, [
        createElement('div', { class: 'results-meta__item' }, [
          createElement('span', { class: 'results-meta__label', text: 'Estado' }),
          statusChip,
        ]),
        createElement('div', { class: 'results-meta__item' }, [
          createElement('span', { class: 'results-meta__label', text: 'sum_final' }),
          sumChip,
        ]),
        createElement('div', { class: 'results-meta__item' }, [
          createElement('span', { class: 'results-meta__label', text: 'Último cálculo' }),
          timestamp,
        ]),
      ]),
    ]),
    createElement('div', { class: 'ui-toolbar' }, [
      createElement(
        'button',
        { type: 'button', class: 'ui-btn ui-btn--primary', dataset: { action: 'recalculate' } },
        'Recalcular',
      ),
      createElement(
        'button',
        { type: 'button', class: 'ui-btn ui-btn--ghost', dataset: { nav: 'builder' } },
        'Editar roles',
      ),
    ]),
  ]);

  return { hero, statusChip, sumChip, timestamp };
};

const buildLayout = () => {
  const root = createElement('section', { class: 'results-shell', dataset: { view: 'results' }, 'aria-label': 'Resultados' });
  const { hero, statusChip, sumChip, timestamp } = buildHero();
  const errorBox = createElement('div', {
    class: 'results-alert',
    dataset: { alert: 'error' },
    hidden: 'hidden',
  });

  const { table, body } = buildTable();
  const tableCard = createElement('div', { class: 'results-card' }, [
    createElement('div', { class: 'results-card__header' }, [
      createElement('div', {}, [
        createElement('h3', { class: 'results-card__title', text: 'Distribución' }),
        createElement('p', { class: 'results-card__meta', text: 'Fracción como referencia · porcentajes aproximados' }),
      ]),
    ]),
    table,
    createElement('p', { class: 'results-note', text: 'Las fracciones son vinculantes. Porcentaje e importe se muestran con redondeo visual (2-4 decimales).' }),
  ]);

  const warningsCard = createElement('div', { class: 'results-card', dataset: { warnings: 'true' } }, [
    createElement('div', { class: 'results-card__header' }, [
      createElement('h3', { class: 'results-card__title', text: 'Avisos del motor' }),
    ]),
    createElement('div', { class: 'results-list', dataset: { list: 'warnings' } }),
  ]);

  const auditCard = createElement('div', { class: 'results-card', dataset: { audit: 'true' } }, [
    createElement('div', { class: 'results-card__header' }, [
      createElement('h3', { class: 'results-card__title', text: 'Auditoría' }),
      createElement('span', { class: 'results-card__meta', text: 'blocks_applied' }),
    ]),
    createElement('div', { class: 'results-list', dataset: { list: 'audit' } }),
  ]);

  const payloadCard = createElement('div', { class: 'results-card', dataset: { payload: 'true' } }, [
    createElement('div', { class: 'results-card__header' }, [
      createElement('h3', { class: 'results-card__title', text: 'Payload enviado' }),
      createElement('span', { class: 'results-card__meta', text: 'heirs' }),
    ]),
    createElement('ul', { class: 'results-payload', dataset: { list: 'payload' } }),
  ]);

  const explainCard = createElement('div', { class: 'results-card' }, [
    createElement('div', { class: 'results-card__header' }, [
      createElement('h3', { class: 'results-card__title', text: 'Explicación paso a paso' }),
      createElement('span', { class: 'results-card__meta', text: 'explain.steps' }),
    ]),
    buildTimeline(),
  ]);

  const grid = createElement('div', { class: 'results-grid' }, [
    createElement('div', { class: 'results-stack' }, [tableCard, warningsCard, auditCard, payloadCard]),
    explainCard,
  ]);

  root.appendChild(hero);
  root.appendChild(errorBox);
  root.appendChild(grid);

  return {
    root,
    statusChip,
    sumChip,
    timestamp,
    errorBox,
    tableBody: body,
    warningsList: warningsCard.querySelector('[data-list="warnings"]'),
    auditList: auditCard.querySelector('[data-list="audit"]'),
    payloadList: payloadCard.querySelector('[data-list="payload"]'),
    timeline: explainCard.querySelector('[data-timeline="true"]'),
  };
};

const renderList = (container, items, { empty = 'Sin datos', formatter } = {}) => {
  if (!container) return;
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.appendChild(createElement('p', { class: 'results-empty', text: empty }));
    return;
  }
  items.forEach((item) => {
    const text = formatter ? formatter(item) : item;
    container.appendChild(createElement('p', { class: 'results-list__item', text }));
  });
};

const renderPayload = (container, payload) => {
  if (!container) return;
  container.innerHTML = '';
  const heirs = Array.isArray(payload?.heirs) ? payload.heirs : [];
  if (heirs.length === 0) {
    container.appendChild(createElement('li', { class: 'results-empty', text: 'Sin herederos activos' }));
    return;
  }
  heirs.forEach((heir) => {
    const roleId = heir.role || '';
    const count = heir.count || 0;
    const label = roleLabel(roleId);
    container.appendChild(
      createElement('li', { class: 'results-payload__item' }, [
        createElement('strong', { text: label }),
        createElement('span', { class: 'results-muted', text: `${roleId} · ${count}x` }),
      ]),
    );
  });
};

const renderShares = (body, rows, currency) => {
  if (!body) return;
  body.innerHTML = '';
  if (!rows || rows.length === 0) {
    const empty = createElement('tr', {}, [
      createElement('td', { class: 'results-empty', colspan: '4', text: 'Aún no hay resultados para mostrar.' }),
    ]);
    body.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const amountText =
      row.amount && row.amount.label
        ? `${row.amount.label}${currency ? ` ${currency}` : ''}`
        : '—';
    const percentText = row.percentage?.label ? `≈ ${row.percentage.label}` : '—';

    body.appendChild(
      createElement('tr', {}, [
        createElement('td', {}, [
          createElement('div', { class: 'results-role' }, [
            createElement('strong', { text: row.label }),
            createElement('span', { class: 'results-muted', text: row.roleId }),
          ]),
        ]),
        createElement('td', { class: 'results-mono', text: row.fraction?.raw || row.fractionText || '—' }),
        createElement('td', { class: 'results-mono', text: percentText }),
        createElement('td', { class: 'results-mono', text: amountText }),
      ]),
    );
  });
};

const renderAudit = (container, blocks) => {
  renderList(container, blocks, {
    empty: 'Sin auditoría',
    formatter: (block) => {
      const rule = block.rule || 'Regla';
      const reason = block.reason ? ` · ${block.reason}` : '';
      const targets =
        Array.isArray(block.targets) && block.targets.length > 0
          ? ` (${block.targets.map((roleId) => roleLabel(roleId)).join(', ')})`
          : '';
      return `${rule}${reason}${targets}`;
    },
  });
};

const renderExplain = (container, steps) => {
  if (!container) return;
  container.innerHTML = '';
  if (!steps || steps.length === 0) {
    container.appendChild(createElement('p', { class: 'results-empty', text: 'Sin pasos de explicación.' }));
    return;
  }

  steps.forEach((step) => {
    const changesList = createElement('div', { class: 'results-changes' });
    if (step.changes?.length) {
      step.changes.forEach((change) => {
        const before = change.before?.raw || '—';
        const after = change.after?.raw || '—';
        const percBefore = change.percentBefore?.label ? `(${change.percentBefore.label} ≈)` : '';
        const percAfter = change.percentAfter?.label ? `(${change.percentAfter.label} ≈)` : '';
        changesList.appendChild(
          createElement('div', { class: 'results-change' }, [
            createElement('div', { class: 'results-role' }, [
              createElement('strong', { text: change.label }),
              createElement('span', { class: 'results-muted', text: change.roleId }),
            ]),
            createElement('div', { class: 'results-change__values' }, [
              createElement('span', { class: 'results-mono', text: `${before} ${percBefore}`.trim() }),
              createElement('span', { class: 'results-change__arrow', text: '→' }),
              createElement('span', { class: 'results-mono', text: `${after} ${percAfter}`.trim() }),
            ]),
          ]),
        );
      });
    } else {
      changesList.appendChild(createElement('p', { class: 'results-empty', text: 'Sin cambios directos.' }));
    }

    const summary = createElement('summary', {}, [
      createElement('span', { class: 'results-chip results-chip--muted', text: step.stage }),
      createElement('strong', { text: step.rule }),
      step.note ? createElement('span', { class: 'results-muted', text: step.note }) : null,
    ]);

    const details = createElement('details', { class: 'results-step', open: false }, [
      summary,
      changesList,
    ]);

    container.appendChild(details);
  });
};

const renderError = (container, status, ok, message) => {
  if (!container) return;
  const hasError = status === 'error' || ok === false;
  container.hidden = !hasError;
  container.innerHTML = '';
  if (!hasError) return;
  container.appendChild(
    createElement('p', {
      class: 'results-alert__text',
      text: message || 'El motor devolvió un error. Revisa los datos y vuelve a intentar.',
    }),
  );
};

const bindEvents = (root) => {
  const onClick = (event) => {
    const target = event.target.closest('[data-nav],[data-action]');
    if (!target) return;
    const { nav, action } = target.dataset;
    if (nav) {
      event.preventDefault();
      navigate(nav);
      return;
    }
    if (action === 'recalculate') {
      event.preventDefault();
      runCalculation();
    }
  };

  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
};

export function mountResultsPage({ root: providedRoot } = {}) {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector('[data-results-mounted="true"]');
  if (existing && !providedRoot) return () => {};

  ensureStylesheets();
  const layout = buildLayout();
  const host = providedRoot || document.querySelector('[data-view="results"]');
  layout.root.dataset.resultsMounted = 'true';

  if (host) {
    host.replaceWith(layout.root);
  } else {
    document.body.appendChild(layout.root);
  }

  const cleanup = bindEvents(layout.root);

  const render = (state) => {
    const { route, derived } = state;
    const isResults = route === 'results';
    layout.root.hidden = !isResults;
    if (!isResults) return;

    const view = derived?.results || {};
    const status = view.status || 'idle';
    const ok = view.ok;

    layout.statusChip.textContent =
      status === 'pending'
        ? 'Calculando...'
        : status === 'success' && ok
          ? 'OK'
          : status === 'error' || ok === false
            ? 'Error'
            : status;
    layout.statusChip.dataset.status = status;
    layout.sumChip.textContent = view.sumFinal?.raw ? `sum_final ${view.sumFinal.raw}` : 'sum_final —';
    layout.timestamp.textContent = formatTimestamp(view.lastComputedAt);

    const recalcBtn = layout.root.querySelector('[data-action="recalculate"]');
    if (recalcBtn) {
      recalcBtn.disabled = status === 'pending';
      recalcBtn.textContent = status === 'pending' ? 'Calculando...' : 'Recalcular';
    }

    renderError(layout.errorBox, status, ok, view.errorMessage);
    renderShares(layout.tableBody, view.rows, view.currency);
    renderList(layout.warningsList, view.warnings, {
      empty: 'Sin avisos',
    });
    renderAudit(layout.auditList, view.auditBlocks);
    renderPayload(layout.payloadList, view.payload);
    renderExplain(layout.timeline, view.explainSteps);
  };

  const unsubscribe = store.subscribe(render, { immediate: true });

  return () => {
    cleanup();
    unsubscribe();
  };
}
