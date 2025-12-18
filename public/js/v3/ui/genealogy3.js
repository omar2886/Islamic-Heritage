import { Persons, resetPersons, hydratePersons, snapshotPersons, addPerson, updatePerson, removePerson, linkSpouses, unlinkSpouses } from '../../persons.js';
import { buildMap, canSetFather, canSetMother, canLinkSpouse, validateWholeGraph, wouldCreateCycle } from '../guardrails.js';
import { saveCase, loadCase, clearCase } from '../storage_v3.js';
import { el, clear } from '../dom.js';

let selectedId = null;
let decedentId = null;
let searchTerm = '';

function persist() {
  saveCase({ personsSnapshot: snapshotPersons(), decedentId });
}

function formatPersonLabel(p) {
  if (!p) return '';
  const meta = [];
  if (p.sex === 'male') meta.push('Varón');
  if (p.sex === 'female') meta.push('Mujer');
  if (!p.alive) meta.push('Fallecido');
  return `${p.name || p.id}${meta.length ? ' · ' + meta.join(' · ') : ''}`;
}

function renderList(container) {
  clear(container);
  const root = container.closest('.v3-layout');
  const toolbar = el('div', { className: 'toolbar' },
    el('input', {
      type: 'search',
      placeholder: 'Buscar...',
      value: searchTerm,
      oninput: (e) => { searchTerm = e.target.value || ''; renderAll(root); },
    }),
    el('button', {
      className: 'btn btn-primary',
      onclick: () => {
        const p = addPerson({ name: 'Nueva persona', sex: 'unknown', alive: true, spouseIds: [] });
        selectedId = p.id;
        persist();
        renderAll(root);
      },
    }, 'Nueva persona'),
    el('button', {
      className: 'btn btn-ghost',
      onclick: () => { clearCase(); resetPersons(); selectedId = null; decedentId = null; persist(); renderAll(root); },
    }, 'Limpiar caso')
  );

  const list = el('div', { className: 'list' });
  const filtered = Persons.list.filter(p => !searchTerm || (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
  if (!filtered.length) {
    list.append(el('div', { className: 'muted' }, 'Sin personas'));
  } else {
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    filtered.forEach((p) => {
      const item = el('div', {
        className: `card list-item${p.id === selectedId ? ' active' : ''}`,
        onclick: () => { selectedId = p.id; renderAll(root); },
      },
      el('div', { className: 'card-title' }, p.name || p.id),
      el('div', { className: 'card-meta' }, [
        p.sex === 'male' ? 'Varón' : p.sex === 'female' ? 'Mujer' : 'Sexo sin definir',
        p.alive ? 'Vivo' : 'Fallecido',
        p.id === decedentId ? 'Causante' : null,
      ].filter(Boolean).join(' · '))
      );
      list.append(item);
    });
  }

  container.append(toolbar, list);
}

function renderParentSelect(label, person, type, container) {
  const map = buildMap(Persons.list);
  const currentId = type === 'father' ? person.fatherId : person.motherId;
  const candidates = Persons.list.filter((p) => {
    if (!p) return false;
    if (p.id === person.id) return false;
    if (type === 'father' && p.sex !== 'male') return false;
    if (type === 'mother' && p.sex !== 'female') return false;
    if (wouldCreateCycle(person.id, p.id, map)) return false;
    return true;
  });

  const select = el('select', {
    value: currentId || '',
    onchange: (e) => {
      const newId = e.target.value || null;
      const prevId = currentId || null;
      const check = type === 'father' ? canSetFather(person.id, newId, Persons.list) : canSetMother(person.id, newId, Persons.list);
      if (!check.ok) {
        alert(check.error);
        e.target.value = prevId || '';
        return;
      }
      const patch = type === 'father' ? { fatherId: newId } : { motherId: newId };
      updatePerson(person.id, patch);
      persist();
      renderAll(container.closest('.v3-layout'));
    },
  },
  el('option', { value: '' }, '— Sin asignar —'),
  ...candidates.map((p) => el('option', { value: p.id, selected: p.id === currentId }, formatPersonLabel(p)))
  );

  container.append(el('div', { className: 'field' }, el('label', {}, label), select));
}

function renderSpousesSection(person, container) {
  const map = buildMap(Persons.list);
  const wrapper = el('div', { className: 'field' });
  wrapper.append(el('label', {}, 'Cónyuges'));

  const pills = el('div', { className: 'chips' });
  (person.spouseIds || []).forEach((sid) => {
    const sp = map.get(sid);
    if (!sp) return;
    const pill = el('span', { className: 'pill' }, sp.name || sp.id,
      el('button', {
        className: 'chip-close',
        title: 'Eliminar vínculo',
        onclick: () => {
          unlinkSpouses(person.id, sid);
          persist();
          renderAll(container.closest('.v3-layout'));
        },
      }, '×')
    );
    pills.append(pill);
  });
  if (!pills.childNodes.length) {
    pills.append(el('span', { className: 'muted' }, 'Sin cónyuge'));
  }
  wrapper.append(pills);

  const addWrapper = el('div', { className: 'field' });
  const candidateOptions = Persons.list.filter((p) => p.id !== person.id && canLinkSpouse(person.id, p.id, Persons.list).ok && !(person.spouseIds || []).includes(p.id));
  const select = el('select', {},
    el('option', { value: '' }, 'Seleccionar...'),
    ...candidateOptions.map((p) => el('option', { value: p.id }, formatPersonLabel(p)))
  );
  const addBtn = el('button', {
    className: 'btn',
    onclick: () => {
      const id = select.value;
      if (!id) return;
      const check = canLinkSpouse(person.id, id, Persons.list);
      if (!check.ok) { alert(check.error); return; }
      linkSpouses(person.id, id);
      persist();
      renderAll(container.closest('.v3-layout'));
    },
  }, 'Añadir cónyuge');
  addWrapper.append(select, addBtn);
  wrapper.append(addWrapper);

  container.append(wrapper);
}

function renderEditor(container) {
  clear(container);
  const person = Persons.byId.get(selectedId);
  if (!person) {
    container.append(el('div', { className: 'muted' }, 'Selecciona una persona para editar'));
    return;
  }

  const header = el('div', { className: 'toolbar' },
    el('div', { className: 'card-title' }, person.name || person.id),
    el('div', { className: 'inline-actions' },
      el('button', {
        className: 'btn btn-danger',
        onclick: () => {
          if (!confirm('¿Eliminar esta persona?')) return;
          removePerson(person.id);
          if (selectedId === person.id) selectedId = null;
          if (decedentId === person.id) decedentId = null;
          persist();
          renderAll(container.closest('.v3-layout'));
        },
      }, 'Eliminar')
    )
  );

  const form = el('div', { className: 'card' });
  const nameField = el('div', { className: 'field' },
    el('label', {}, 'Nombre'),
    el('input', {
      type: 'text',
      value: person.name,
      oninput: (e) => { updatePerson(person.id, { name: e.target.value }); persist(); renderAll(container.closest('.v3-layout')); },
    })
  );
  const sexField = el('div', { className: 'field' },
    el('label', {}, 'Sexo'),
    el('select', {
      value: person.sex,
      onchange: (e) => {
        updatePerson(person.id, { sex: e.target.value });
        persist();
        renderAll(container.closest('.v3-layout'));
      },
    },
    el('option', { value: 'male' }, 'Varón'),
    el('option', { value: 'female' }, 'Mujer')
    )
  );
  const aliveField = el('div', { className: 'field' },
    el('label', {}, 'Vive'),
    el('input', {
      type: 'checkbox',
      checked: !!person.alive,
      onchange: (e) => { updatePerson(person.id, { alive: e.target.checked }); persist(); renderAll(container.closest('.v3-layout')); },
    })
  );

  const roleField = el('div', { className: 'field' },
    el('label', {}, 'Causante'),
    el('input', {
      type: 'radio',
      name: 'decedent',
      checked: decedentId === person.id,
      onchange: () => { decedentId = person.id; persist(); renderAll(container.closest('.v3-layout')); },
    })
  );

  const parents = el('div', { className: 'grid-2' });
  renderParentSelect('Padre', person, 'father', parents);
  renderParentSelect('Madre', person, 'mother', parents);

  const spouseSection = el('div');
  renderSpousesSection(person, spouseSection);

  form.append(nameField, sexField, aliveField, roleField, parents, spouseSection);
  container.append(header, form);
}

function renderValidation(container) {
  clear(container);
  const { errors, warnings } = validateWholeGraph(Persons.list);
  if (!errors.length && !warnings.length) {
    container.append(el('div', { className: 'banner banner-ok' }, 'Todo en orden.'));
    return;
  }
  if (errors.length) {
    container.append(el('div', { className: 'banner banner-error' }, errors.join('\n')));
  }
  if (warnings.length) {
    container.append(el('div', { className: 'banner banner-warn' }, warnings.join('\n')));
  }
}

export function mount() {
  const root = document.getElementById('genealogy3-root');
  if (!root) throw new Error('No se encontró el contenedor genealogy3-root');

  const saved = loadCase();
  if (saved && saved.personsSnapshot) {
    hydratePersons(saved.personsSnapshot);
    decedentId = saved.decedentId || null;
  } else {
    resetPersons();
  }

  selectedId = decedentId || Persons.list[0]?.id || null;

  const layout = el('div', { className: 'v3-layout' });
  const aside = el('aside', { className: 'card' });
  const editorSection = el('section', { className: 'card' });
  const validationSection = el('section', { className: 'card' });

  layout.append(aside, editorSection, validationSection);
  root.replaceChildren(layout);

  function render() {
    renderList(aside);
    renderEditor(editorSection);
    renderValidation(validationSection);
  }

  render();
  return root;
}

function renderAll(root) {
  if (!root) return;
  const aside = root.querySelector('aside');
  const sections = root.querySelectorAll('section');
  const editorSection = sections[0];
  const validationSection = sections[1];
  if (aside) renderList(aside);
  if (editorSection) renderEditor(editorSection);
  if (validationSection) renderValidation(validationSection);
}
