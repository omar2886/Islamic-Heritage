import { Persons, hydratePersons } from '../../persons.js';
import { deriveCountsGraph, applyHierarchyScreening } from '../../derive.js';
import { validate } from '../../validation.js';
import { toPayload } from '../../serializer.js';
import { postCalc } from '../api.js';
import { loadCase, saveLastPayload, saveLastOutput } from '../storage_v3.js';
import { validateWholeGraph } from '../guardrails.js';
import { el, clear } from '../dom.js';

const ROLE_LABELS = {
  husband: 'Esposo',
  wife: 'Esposa',
  son: 'Hijo varón',
  daughter: 'Hija',
  father: 'Padre',
  mother: 'Madre',
  paternal_grandfather: 'Abuelo paterno',
  paternal_grandmother: 'Abuela paterna',
  maternal_grandmother: 'Abuela materna',
  full_brother: 'Hermano pleno',
  full_sister: 'Hermana plena',
  consanguine_brother: 'Hermano consanguíneo',
  consanguine_sister: 'Hermana consanguínea',
  uterine_brother: 'Hermano uterino',
  uterine_sister: 'Hermana uterina',
};

function labeledCount([role, count]) {
  const label = ROLE_LABELS[role] || role;
  return `${label}: ${count}`;
}

function renderCountsList(container, counts) {
  clear(container);
  const entries = Array.from(counts.entries()).filter(([, n]) => (n | 0) > 0);
  if (!entries.length) {
    container.append(el('div', { className: 'muted' }, 'Sin herederos vivos derivados.'));
    return;
  }
  const list = el('ul', { className: 'list-compact' });
  entries.forEach((pair) => list.append(el('li', {}, labeledCount(pair))));
  container.append(list);
}

function renderBanner(container, kind, title, items) {
  const list = Array.isArray(items) ? items : (items ? [items] : []);
  container.replaceChildren();
  if (!list.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.className = `banner ${kind}`;
  container.append(el('strong', {}, title));
  const ul = el('ul');
  list.forEach((msg) => ul.append(el('li', {}, msg)));
  container.append(ul);
}

export async function mount() {
  const root = document.getElementById('builder3-root');
  if (!root) {
    throw new Error('No se encontró el contenedor builder3-root');
  }

  clear(root);

  const saved = loadCase();
  if (saved?.personsSnapshot) {
    hydratePersons(saved.personsSnapshot);
  }
  const decedentId = saved?.decedentId || null;

  const layout = el('div', { className: 'v3-layout' });
  root.append(layout);

  if (!decedentId || !Persons.byId.get(decedentId)) {
    layout.append(
      el('div', { className: 'card' },
        el('h2', {}, 'Builder V3'),
        el('p', {}, 'Debes definir un causante en Genealogía V3 antes de continuar.'),
        el('a', { className: 'btn btn-primary', href: '?page=genealogy3' }, 'Ir a Genealogía V3')
      )
    );
    return root;
  }

  const decedent = Persons.byId.get(decedentId);
  const sex = decedent?.sex || 'unknown';
  const { errors: graphErrors } = validateWholeGraph(Persons.list);
  const counts0 = deriveCountsGraph(decedentId);
  const { counts: counts1, warnings: screeningWarnings } = applyHierarchyScreening(counts0);

  const hero = el('div', { className: 'card' },
    el('h2', {}, 'Builder V3'),
    el('p', {}, `Paso 1) Causante: ${decedent.name || decedent.id} · Sexo: ${sex || 'N/D'}`),
    el('p', {}, 'Paso 2) Validar árbol'),
    el('p', {}, 'Paso 3) Herederos derivados automáticamente'),
    el('p', {}, 'Paso 4) Ingresar monto y calcular')
  );

  const graphBanner = el('div');
  renderBanner(graphBanner, 'error', 'Errores en el grafo', graphErrors);

  const countsCard = el('div', { className: 'card' },
    el('h3', {}, 'Herederos derivados'),
    el('p', { className: 'muted' }, 'Los counts se derivan del grafo y no son editables en esta versión.'),
    el('div', { id: 'counts-preview' })
  );

  const warningsBanner = el('div');
  renderBanner(warningsBanner, 'warn', 'Avisos', screeningWarnings);

  const validationBanner = el('div');
  const errorBanner = el('div');

  const estateInput = el('input', {
    type: 'text',
    id: 'estate-input',
    placeholder: 'Monto total de la herencia',
    className: 'input',
  });

  const actions = el('div', { className: 'actions' },
    el('button', {
      className: 'btn btn-primary',
      type: 'button',
      disabled: graphErrors.length > 0,
      onclick: () => handleCalc(),
    }, 'Calcular')
  );

  layout.append(hero, graphBanner, countsCard, warningsBanner,
    el('div', { className: 'card' },
      el('h3', {}, 'Monto de la herencia'),
      estateInput,
      el('p', { className: 'muted' }, 'Ingresa el valor total para calcular la distribución.'),
      actions,
      validationBanner,
      errorBanner,
    )
  );

  renderCountsList(countsCard.querySelector('#counts-preview'), counts1);

  function handleCalc() {
    renderBanner(validationBanner, 'warn', 'Avisos', []);
    renderBanner(errorBanner, 'error', 'Errores', []);

    const { counts, warnings, errors, estateValue } = validate({ sex, counts: counts1, estateValue: estateInput.value });
    const allWarnings = [
      ...(Array.isArray(screeningWarnings) ? screeningWarnings : []),
      ...(Array.isArray(warnings) ? warnings : []),
    ];
    if (allWarnings.length) {
      renderBanner(validationBanner, 'warn', 'Avisos', allWarnings);
    }
    if (errors.length) {
      renderBanner(errorBanner, 'error', 'Errores', errors);
      return;
    }

    const payload = toPayload({ sex, estateValue, counts, decedentId });
    saveLastPayload(payload);

    const btn = actions.querySelector('button');
    if (btn) btn.disabled = true;

    postCalc(payload)
      .then((json) => {
        if (json && json.output) {
          saveLastOutput(json.output);
        }
        window.location = '?page=results3';
      })
      .catch((err) => {
        const message = err?.message || 'Error desconocido al calcular.';
        renderBanner(errorBanner, 'error', 'Error al calcular', [message]);
      })
      .finally(() => {
        if (btn) btn.disabled = false;
      });
  }

  return root;
}
