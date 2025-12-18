import { setDeceased, setStep, setLastResult, addHeir, updateHeir, removeHeir } from './state.js';
import { loadState, saveState } from './storage.js';

const STEP_ORDER = ['decedent', 'heirs', 'review', 'results'];
const LABELS = {
  decedent: 'Causante',
  heirs: 'Familia / Herederos',
  review: 'Revisión',
  results: 'Resultados',
};

let state = syncWithUrl(loadState());
const root = document.getElementById('flow-root');
const nav = document.querySelector('.flow__steps');
const footerActions = document.querySelector('.flow__footer-actions');

function syncWithUrl(current) {
  const url = new URL(window.location.href);
  const requested = url.searchParams.get('step');
  const defaultStep = current.step || 'decedent';
  const safeDefault = STEP_ORDER.includes(defaultStep) ? defaultStep : STEP_ORDER[0];
  const nextStep = STEP_ORDER.includes(requested) ? requested : safeDefault;
  if (nextStep !== current.step) {
    current = setStep(current, nextStep);
  }
  applyUrl(nextStep);
  return current;
}

function applyUrl(step) {
  const url = new URL(window.location.href);
  url.searchParams.set('step', step);
  history.replaceState({}, '', url.toString());
}

function persist(next) {
  state = next;
  saveState(state);
  render();
}

function goToStep(step) {
  if (!STEP_ORDER.includes(step)) return;
  persist(setStep(state, step));
  applyUrl(step);
}

function stepFromIndex(index) {
  return STEP_ORDER[Math.min(Math.max(index, 0), STEP_ORDER.length - 1)];
}

function nextStep(direction) {
  const currentIdx = STEP_ORDER.indexOf(state.step);
  const targetIdx = currentIdx + direction;
  return stepFromIndex(targetIdx);
}

function renderNav() {
  if (!nav) return;
  nav.querySelectorAll('button[data-step]').forEach((btn) => {
    const isActive = btn.dataset.step === state.step;
    btn.classList.toggle('is-active', isActive);
    btn.disabled = btn.dataset.step === 'results' && state.heirs.length === 0;
  });
}

function renderFooter() {
  if (!footerActions) return;
  const back = footerActions.querySelector('[data-action="back"]');
  const next = footerActions.querySelector('[data-action="next"]');
  const recalc = footerActions.querySelector('[data-action="recalc"]');

  if (back) {
    back.disabled = state.step === STEP_ORDER[0];
  }

  if (next) {
    next.textContent = state.step === 'results' ? 'Finalizado' : 'Siguiente';
    next.disabled = state.step === 'results';
  }

  if (recalc) {
    recalc.classList.toggle('is-hidden', state.step !== 'results');
    recalc.disabled = state.heirs.length === 0 && !state.deceased.name;
  }
}

function renderDecedent() {
  const { deceased } = state;
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Paso 1</p>
          <h2>${LABELS.decedent}</h2>
          <p class="muted">Datos básicos del causante para contextualizar el caso.</p>
        </div>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Nombre</span>
          <input type="text" name="deceased-name" data-deceased-field="name" value="${escapeHtml(deceased.name)}" placeholder="Ej: Ahmad ibn Zayd" />
        </label>
        <label class="field">
          <span>Sexo</span>
          <select name="deceased-sex" data-deceased-field="sex" value="${escapeHtml(deceased.sex)}">
            ${renderOptions([
              { value: 'M', label: 'Masculino' },
              { value: 'F', label: 'Femenino' },
            ], deceased.sex)}
          </select>
        </label>
        <label class="field">
          <span>Madhhab</span>
          <input type="text" name="deceased-madhhab" data-deceased-field="madhhab" value="${escapeHtml(deceased.madhhab)}" placeholder="Escuela fiqh" />
        </label>
        <label class="field field--full">
          <span>Notas</span>
          <textarea name="deceased-notes" data-deceased-field="notes" rows="3" placeholder="Circunstancias o notas adicionales">${escapeHtml(deceased.notes)}</textarea>
        </label>
      </div>
    </section>
  `;
}

function renderHeirList() {
  if (!state.heirs.length) {
    return '<p class="empty">Aún no hay herederos añadidos.</p>';
  }

  return state.heirs
    .map(
      (heir) => `
        <article class="card heir-card" data-heir-id="${heir.id}">
          <div class="heir-card__title">
            <div>
              <p class="eyebrow">${LABELS.heirs}</p>
              <h3>${escapeHtml(heir.name || 'Nuevo heredero')}</h3>
            </div>
            <button type="button" class="btn btn-ghost" data-remove-heir="${heir.id}">Eliminar</button>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>Nombre</span>
              <input type="text" data-heir-field="name" data-heir-id="${heir.id}" value="${escapeHtml(heir.name)}" placeholder="Ej: Fatima" />
            </label>
            <label class="field">
              <span>Sexo</span>
              <select data-heir-field="sex" data-heir-id="${heir.id}">
                ${renderOptions([
                  { value: 'M', label: 'Masculino' },
                  { value: 'F', label: 'Femenino' },
                ], heir.sex)}
              </select>
            </label>
            <label class="field">
              <span>Rol</span>
              <input type="text" data-heir-field="role" data-heir-id="${heir.id}" value="${escapeHtml(heir.role)}" placeholder="Ej: Hijo, Esposa" />
            </label>
            <label class="field">
              <span>Vivos</span>
              <input type="number" min="1" step="1" data-heir-field="count" data-heir-id="${heir.id}" value="${escapeHtml(String(heir.count))}" />
            </label>
            <label class="field field--inline">
              <input type="checkbox" data-heir-field="alive" data-heir-id="${heir.id}" ${heir.alive ? 'checked' : ''} />
              <span>Está vivo</span>
            </label>
          </div>
        </article>
      `,
    )
    .join('');
}

function renderHeirs() {
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Paso 2</p>
          <h2>${LABELS.heirs}</h2>
          <p class="muted">Agrega herederos uno a uno y manténlos sincronizados con el caso.</p>
        </div>
      </div>
      <form class="card card--subtle" data-form="add-heir">
        <div class="form-grid">
          <label class="field">
            <span>Nombre</span>
            <input type="text" name="heir-name" placeholder="Nombre del heredero" required />
          </label>
          <label class="field">
            <span>Sexo</span>
            <select name="heir-sex">
              ${renderOptions([
                { value: 'M', label: 'Masculino' },
                { value: 'F', label: 'Femenino' },
              ], 'M')}
            </select>
          </label>
          <label class="field">
            <span>Rol</span>
            <input type="text" name="heir-role" placeholder="Rol o parentesco" />
          </label>
          <label class="field">
            <span>Vivos</span>
            <input type="number" name="heir-count" min="1" step="1" value="1" />
          </label>
          <label class="field field--inline">
            <input type="checkbox" name="heir-alive" checked />
            <span>Está vivo</span>
          </label>
        </div>
        <div class="inline-actions">
          <button type="submit" class="btn btn-primary">Añadir heredero</button>
        </div>
      </form>
      <div class="list list--spaced">
        ${renderHeirList()}
      </div>
    </section>
  `;
}

function renderReview() {
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Paso 3</p>
          <h2>${LABELS.review}</h2>
          <p class="muted">Repasa la información antes de calcular.</p>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-item">
          <p class="eyebrow">Causante</p>
          <p><strong>${escapeHtml(state.deceased.name || 'Sin nombre')}</strong></p>
          <p class="muted">${escapeHtml(state.deceased.madhhab || 'Sin madhhab')}</p>
        </div>
        <div class="summary-item">
          <p class="eyebrow">Herederos</p>
          <p><strong>${state.heirs.length}</strong> registro(s)</p>
          <p class="muted">Actualizar antes de calcular.</p>
        </div>
        <div class="summary-item">
          <p class="eyebrow">Notas</p>
          <p>${escapeHtml(state.deceased.notes || 'Sin notas')}</p>
        </div>
      </div>
    </section>
  `;
}

function renderResults() {
  const hasResult = Boolean(state.lastResult);
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Paso 4</p>
          <h2>${LABELS.results}</h2>
          <p class="muted">Consulta el resumen más reciente.</p>
        </div>
      </div>
      ${hasResult ? renderResultCard(state.lastResult) : '<p class="empty">Recalcula para obtener resultados actualizados.</p>'}
    </section>
  `;
}

function renderResultCard(result) {
  return `
    <article class="card card--subtle">
      <p class="eyebrow">Último cálculo</p>
      <p><strong>${escapeHtml(result.note || 'Cálculo manual')}</strong></p>
      <p class="muted">Actualizado: ${escapeHtml(result.updatedAt || new Date().toISOString())}</p>
    </article>
  `;
}

function render() {
  if (!root) return;
  const fragments = {
    decedent: renderDecedent(),
    heirs: renderHeirs(),
    review: renderReview(),
    results: renderResults(),
  };
  root.innerHTML = fragments[state.step] || '';
  renderNav();
  renderFooter();
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderOptions(options, selected) {
  return options
    .map(({ value, label }) => `<option value="${escapeHtml(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

function handleNavClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.step) {
    goToStep(target.dataset.step);
  }
}

function handleFooterClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.dataset.action) return;
  if (target.dataset.action === 'back') {
    goToStep(nextStep(-1));
  }
  if (target.dataset.action === 'next') {
    goToStep(nextStep(1));
  }
  if (target.dataset.action === 'recalc') {
    const next = setLastResult(state, {
      note: 'Resultados pendientes de cálculo core',
      updatedAt: new Date().toISOString(),
    });
    persist(next);
  }
}

function handleDecedentInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const field = target.dataset.deceasedField;
  if (!field) return;
  const value = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
    ? target.type === 'checkbox'
      ? target.checked
      : target.value
    : '';
  persist(setDeceased(state, { [field]: value }));
}

function parseHeirValue(target) {
  if (target.type === 'checkbox') return target.checked;
  if (target.type === 'number') return parseInt(target.value, 10) || 1;
  return target.value;
}

function handleHeirChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const heirId = target.dataset.heirId;
  const field = target.dataset.heirField;
  if (!heirId || !field) return;
  const value = target instanceof HTMLInputElement || target instanceof HTMLSelectElement
    ? parseHeirValue(target)
    : target.textContent;
  persist(updateHeir(state, heirId, { [field]: value }));
}

function handleHeirRemoval(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const heirId = target.dataset.removeHeir;
  if (!heirId) return;
  persist(removeHeir(state, heirId));
}

function handleAddHeir(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.dataset.form !== 'add-heir') return;
  event.preventDefault();
  const name = form.elements.namedItem('heir-name')?.value || '';
  const role = form.elements.namedItem('heir-role')?.value || '';
  const sex = form.elements.namedItem('heir-sex')?.value || 'M';
  const count = parseInt(form.elements.namedItem('heir-count')?.value || '1', 10) || 1;
  const alive = form.elements.namedItem('heir-alive') instanceof HTMLInputElement
    ? form.elements.namedItem('heir-alive').checked
    : true;
  const trimmedName = name.toString().trim();
  const payload = { name: trimmedName, role: role.trim(), sex, count, alive };
  persist(addHeir(state, payload));
  form.reset();
  const defaultSex = form.querySelector('select[name="heir-sex"]');
  if (defaultSex instanceof HTMLSelectElement) {
    defaultSex.value = 'M';
  }
  const defaultCount = form.querySelector('input[name="heir-count"]');
  if (defaultCount instanceof HTMLInputElement) {
    defaultCount.value = '1';
  }
  const defaultAlive = form.querySelector('input[name="heir-alive"]');
  if (defaultAlive instanceof HTMLInputElement) {
    defaultAlive.checked = true;
  }
}

function bindEvents() {
  nav?.addEventListener('click', handleNavClick);
  footerActions?.addEventListener('click', handleFooterClick);
  root?.addEventListener('input', handleDecedentInput);
  root?.addEventListener('change', handleDecedentInput);
  root?.addEventListener('input', handleHeirChange);
  root?.addEventListener('change', handleHeirChange);
  root?.addEventListener('click', handleHeirRemoval);
  root?.addEventListener('submit', handleAddHeir);
}

function mount() {
  if (!root) return null;
  if (!nav || !footerActions) return null;
  bindEvents();
  render();
  root.setAttribute('tabindex', '-1');
  root.focus({ preventScroll: false });
  return root;
}

export { mount };
