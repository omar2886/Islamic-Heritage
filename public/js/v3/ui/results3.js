import { postCalc } from '../../api.js';
import { loadLastOutput, loadLastPayload, saveLastOutput } from '../storage_v3.js';
import { el, clear } from '../dom.js';

function banner(kind, title, messages) {
  if (!messages || !messages.length) return null;
  const list = Array.isArray(messages) ? messages : [messages];
  const node = el('div', { className: `banner banner-${kind}` }, el('strong', {}, title));
  list.forEach((msg) => node.append(el('div', {}, msg)));
  return node;
}

function renderNoPayload(root) {
  const card = el('div', { className: 'card' },
    el('h2', {}, 'Resultados V3'),
    el('p', {}, 'No se encontró ningún payload previo.'),
    el('p', { className: 'muted' }, 'Vuelve al constructor para definir el caso y calcula nuevamente.'),
    el('div', { className: 'footer-actions' },
      el('a', { className: 'btn btn-primary', href: '?page=builder3' }, 'Ir a Builder V3')
    ),
  );
  root.replaceChildren(card);
  return root;
}

function renderSummary(payload, output) {
  const amount = payload?.amount || payload?.estate_value || payload?.estateValue || 'N/D';
  const sex = payload?.ui_meta?.sex || payload?.sex || 'N/D';
  const heirsCount = Array.isArray(payload?.heirs)
    ? payload.heirs.reduce((acc, h) => acc + (h?.count || 0), 0)
    : 0;
  const ts = output?.timestamp || output?.ts || output?.meta?.timestamp || output?.computed_at || 'N/D';

  const grid = el('div', { className: 'summary-grid' },
    el('div', { className: 'summary-item' },
      el('p', { className: 'muted small' }, 'Monto declarado'),
      el('strong', {}, String(amount)),
    ),
    el('div', { className: 'summary-item' },
      el('p', { className: 'muted small' }, 'Sexo del causante'),
      el('strong', {}, String(sex)),
    ),
    el('div', { className: 'summary-item' },
      el('p', { className: 'muted small' }, 'Nº herederos'),
      el('strong', {}, String(heirsCount)),
    ),
    el('div', { className: 'summary-item' },
      el('p', { className: 'muted small' }, 'Timestamp'),
      el('strong', {}, String(ts)),
    ),
  );

  return el('section', {}, el('h2', {}, 'Resumen'), grid);
}

function renderTable(title, entries, labels) {
  if (!entries || entries.length === 0) return null;
  const [kLabel, vLabel] = labels;
  const rows = entries.map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', {}, String(v))));
  const table = el('table', { className: 'compact data-table' },
    el('thead', {}, el('tr', {}, el('th', {}, kLabel), el('th', {}, vLabel))),
    el('tbody', {}, rows),
  );
  return el('section', {}, el('h3', {}, title), table);
}

function renderShares(output) {
  const shares = output?.shares || output?.group_shares || output?.groupShares;
  const personShares = output?.person_shares || output?.individual_shares;
  const sections = [];
  if (shares && typeof shares === 'object') {
    sections.push(renderTable('Cuotas por rol', Object.entries(shares), ['Rol', 'Cuota']));
  }
  if (personShares && typeof personShares === 'object') {
    sections.push(renderTable('Cuotas por persona', Object.entries(personShares), ['Persona', 'Cuota']));
  }
  return sections.filter(Boolean);
}

function renderAmounts(output) {
  const amounts = output?.amounts || output?.group_amounts;
  const personAmounts = output?.person_amounts;
  const sections = [];
  if (amounts && typeof amounts === 'object') {
    sections.push(renderTable('Importes por rol', Object.entries(amounts), ['Rol', 'Importe']));
  }
  if (personAmounts && typeof personAmounts === 'object') {
    sections.push(renderTable('Importes por persona', Object.entries(personAmounts), ['Persona', 'Importe']));
  }
  return sections.filter(Boolean);
}

function renderExplain(output) {
  const blocks = [];
  if (typeof output?.explain === 'string') blocks.push(output.explain);
  if (Array.isArray(output?.explain)) blocks.push(...output.explain);
  if (Array.isArray(output?.traces)) blocks.push(...output.traces);
  if (!blocks.length) return null;

  return el('section', {},
    el('h3', {}, 'Explicación'),
    el('div', { className: 'prose' }, blocks.map((line) => el('pre', { className: 'explain-pre' }, typeof line === 'string' ? line : JSON.stringify(line, null, 2)))),
  );
}

function downloadJson(payload, output) {
  try {
    const blob = new Blob([JSON.stringify({ payload, output }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'heritage_v3_result.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    // ignore download errors
  }
}

export async function mount() {
  const root = document.getElementById('results3-root');
  if (!root) {
    throw new Error('No se encontró el contenedor results3-root');
  }

  clear(root);

  const payload = loadLastPayload();
  if (!payload) {
    return renderNoPayload(root);
  }

  const state = {
    payload,
    output: loadLastOutput(),
    loading: false,
    error: null,
  };

  const statusEl = el('p', { className: 'muted small', role: 'status', 'aria-live': 'polite' });
  const body = el('div', { className: 'results3-body' });

  const btnEdit = el('a', { className: 'btn', href: '?page=genealogy3' }, 'Editar caso');
  const btnRecalc = el('button', { className: 'btn btn-primary', type: 'button' }, 'Recalcular');
  const btnDownload = el('button', { className: 'btn btn-ghost', type: 'button' }, 'Descargar JSON (payload + output)');

  btnRecalc.addEventListener('click', async () => {
    if (state.loading) return;
    state.loading = true;
    state.error = null;
    statusEl.textContent = 'Calculando…';
    btnRecalc.disabled = true;
    try {
      const { status, ok, json, text } = await postCalc(payload, { meta: true });
      if (!ok) {
        state.error = { status, text: text || 'Error inesperado del servidor.' };
        statusEl.textContent = 'Error en el cálculo.';
        return;
      }
      if (!json) {
        state.error = { status, text: text || 'Respuesta no-JSON del backend.' };
        statusEl.textContent = 'Error en el cálculo.';
        return;
      }
      state.output = json?.output || json || null;
      if (state.output) saveLastOutput(state.output);
      statusEl.textContent = 'Cálculo actualizado.';
    } catch (err) {
      state.error = { message: err?.message || 'Error al recalcular.' };
      statusEl.textContent = 'Error en el cálculo.';
    } finally {
      state.loading = false;
      btnRecalc.disabled = false;
      renderBody();
    }
  });

  btnDownload.addEventListener('click', () => downloadJson(payload, state.output));

  const header = el('div', { className: 'page-head' },
    el('div', {},
      el('h1', {}, 'Resultados V3'),
      el('p', { className: 'muted' }, 'Último cálculo guardado sin diagnóstico.'),
    ),
    el('div', { className: 'page-actions' }, btnEdit, btnRecalc, btnDownload),
  );

  root.append(header, statusEl, body);

  function renderBody() {
    clear(body);
    if (state.error) {
      const { status, text, message } = state.error;
      const errorText = status ? `HTTP ${status}\n${text || ''}` : (message || 'No se pudo calcular.');
      const alert = banner('error', 'Error al calcular', errorText);
      if (alert) body.append(alert);
      return;
    }

    if (!state.output) {
      body.append(el('div', { className: 'banner banner-warn' },
        el('strong', {}, 'Sin resultados aún'),
        el('div', {}, 'Pulsa “Recalcular” para obtener el resultado más reciente.'),
      ));
      return;
    }

    const summary = renderSummary(payload, state.output);
    if (summary) body.append(summary);

    const shareSections = renderShares(state.output);
    shareSections.forEach((sect) => body.append(sect));

    const amountSections = renderAmounts(state.output);
    amountSections.forEach((sect) => body.append(sect));

    const explain = renderExplain(state.output);
    if (explain) body.append(explain);
  }

  if (state.output) {
    statusEl.textContent = 'Usando último cálculo guardado.';
  } else {
    statusEl.textContent = 'Listo para recalcular.';
  }
  renderBody();
  return root;
}
