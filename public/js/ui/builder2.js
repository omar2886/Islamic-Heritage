import { loadState } from '../storage_people.js';
import { validateGraph } from './graph_validate.js';
import { hydratePersons } from '../persons.js';
import { deriveHeirsFromGraph } from '../derive_heirs_from_graph.js';
import { persistPayload, loadStoredPayloads } from '../storage.js';
import { postCalc } from '../api.js';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    if (k === 'class') node.className = v;
    else if (k === 'for') node.htmlFor = v;
    else node.setAttribute(k, v);
  });
  children.flat().forEach((child) => {
    if (child === null || child === undefined) return;
    node.append(child);
  });
  return node;
}

function cleanBase(base) {
  return base ? String(base).replace(/\/+$/, '') : '';
}
function pageHref(page) {
  const base = cleanBase(window.__APP_BASE__ || '');
  const path = `index.php?page=${page}`;
  return base ? `${base}/${path}` : path;
}

function renderBanner(kind, title, lines) {
  const list = Array.isArray(lines) ? lines : [lines];
  const banner = el('div', { class: `banner ${kind}` });
  banner.append(el('strong', {}, title));
  const ul = el('ul');
  list.forEach((line) => {
    ul.append(el('li', {}, line));
  });
  banner.append(ul);
  return banner;
}

function formatPerson(p) {
  if (!p) return '(Sin causante)';
  const name = p.name || '(Sin nombre)';
  return `${name} — ${p.id}`;
}

function loadPrefill() {
  const { payload } = loadStoredPayloads();
  if (payload?.ui_meta?.source === 'builder2') {
    return {
      estate: payload.estate_value || '',
      currency: payload.currency || 'MAD',
    };
  }
  return { estate: '', currency: 'MAD' };
}

export async function mountBuilder2() {
  const root = document.getElementById('builder2-root');
  if (!root) throw new Error('No se encontró el contenedor builder2-root');
  root.replaceChildren();

  const state = loadState();
  const validation = validateGraph(state);
  const decedent = state.people.find((p) => p.id === state.decedentId) || null;

  const heading = el('header', {},
    el('h1', {}, 'Constructor V2'),
    el('p', { class: 'muted' }, 'Usa el grafo de Genealogía V2 para derivar herederos automáticamente.')
  );
  root.append(heading);

  const blocked = [];
  if (!decedent) blocked.push('Asigna un causante en Genealogía V2 para continuar.');
  if (validation.errors.length) {
    blocked.push(...validation.errors);
  }

  if (blocked.length) {
    const link = el('a', { href: pageHref('genealogy2'), class: 'btn' }, 'Ir a Genealogía V2');
    root.append(renderBanner('error', 'No se puede continuar', blocked), link);
    return;
  }

  hydratePersons(state.people);
  const heirs = deriveHeirsFromGraph(state.decedentId);

  const prefill = loadPrefill();

  const step1 = el('section', { class: 'card' },
    el('h2', {}, 'Paso 1: Datos del caso'),
    el('div', { class: 'field' }, el('label', { for: 'b2-decedent' }, 'Causante'),
      el('input', { id: 'b2-decedent', type: 'text', readonly: '', value: formatPerson(decedent) })
    ),
    el('div', { class: 'grid' },
      el('div', { class: 'field' }, el('label', { for: 'b2-estate' }, 'Valor de la herencia'),
        el('input', { id: 'b2-estate', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: prefill.estate })
      ),
      el('div', { class: 'field' }, el('label', { for: 'b2-currency' }, 'Moneda'),
        (() => {
          const sel = el('select', { id: 'b2-currency' });
          ['MAD', 'USD', 'EUR', 'GBP'].forEach((ccy) => {
            sel.append(el('option', { value: ccy, selected: ccy === (prefill.currency || 'MAD') ? '' : null }, ccy));
          });
          return sel;
        })()
      )
    )
  );

  const step2 = el('section', { class: 'card' },
    el('h2', {}, 'Paso 2: Herederos derivados'),
    heirs.length
      ? (() => {
        const tbl = el('table', { class: 'compact' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Rol'), el('th', {}, 'Cantidad'))),
          el('tbody')
        );
        heirs.forEach(({ role, count }) => {
          tbl.querySelector('tbody').append(el('tr', {}, el('td', {}, role), el('td', {}, String(count))));
        });
        return tbl;
      })()
      : el('p', { class: 'muted' }, 'No se encontraron herederos derivados desde el grafo.')
  );

  const status = el('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }, 'Listo para calcular');
  const errorBox = el('div');

  const btn = el('button', { type: 'button', class: 'btn-primary', id: 'b2-calc' }, 'Calcular');
  btn.addEventListener('click', async () => {
    errorBox.replaceChildren();
    btn.disabled = true;
    status.textContent = 'Enviando cálculo…';

    const estateInput = document.getElementById('b2-estate');
    const currencyInput = document.getElementById('b2-currency');
    const estateValue = estateInput?.value ?? '';
    const currency = currencyInput?.value || 'MAD';

    const payload = {
      heirs,
      estate_value: estateValue,
      currency,
      ui_meta: { source: 'builder2', decedentId: decedent.id, sex: decedent.sex || 'unknown' },
      cli_flags: ['--explain', '--audit'],
    };

    persistPayload(payload);

    try {
      await postCalc(payload);
      status.textContent = 'Redirigiendo a resultados…';
      window.location.href = pageHref('results2');
    } catch (e) {
      status.textContent = 'No se pudo calcular';
      const message = String(e?.message || e);
      errorBox.replaceChildren(renderBanner('error', 'Error en cálculo', message));
      btn.disabled = false;
    }
  });

  const step3 = el('section', { class: 'card' },
    el('h2', {}, 'Paso 3: Ejecutar cálculo'),
    el('p', { class: 'muted' }, 'Se enviará el payload a /api/calc.php con auditoría y explicación activadas.'),
    btn,
    status,
    errorBox
  );

  root.append(step1, step2, step3);
}
