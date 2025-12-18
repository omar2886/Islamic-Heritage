import {
  setDeceased,
  setStep,
  setLastResult,
  setLastResultRaw,
  setLastPayload,
  setEstateValue,
  setHeirCount,
  setScreening,
  setLastResponse,
  setLastError,
} from './state.js';
import { loadState, saveState, resetCase } from './storage.js';
import { validateState } from './validate.js';
import { buildPayload } from './payload.js';
import { exportJson } from './export.js';
import { ROLE_GROUPS, ROLE_LABELS } from './roles_meta.js';
import { postCalc, loadRoles } from './api.js';

const STEP_ORDER = ['screening', 'decedent', 'heirs', 'review', 'results'];
const LABELS = {
  screening: 'Prefiltro',
  decedent: 'Causante',
  heirs: 'Familia / Herederos',
  review: 'Revisión',
  results: 'Resultados',
};
const TOTAL_STEPS = STEP_ORDER.length;

let state = syncWithUrl(loadState());
let roles = [];
let validation = { errors: [], warnings: [], bySection: {} };
let isLoadingRoles = false;
let rolesError = null;
let isCalculating = false;
function apiUrl(relPath) {
  const base = (window.__APP_BASE__ || '').replace(/\/+$/, '');
  return new URL(base + '/' + relPath.replace(/^\/+/, ''), window.location.origin);
}

const root = document.getElementById('flow-root');
const page = document.querySelector('.flow');
const nav = document.querySelector('.flow__steps');
const footerActions = document.querySelector('.flow__footer-actions');

const ROLE_LIMITS = {
  father: 1,
  mother: 1,
  paternal_grandfather: 1,
  paternal_grandmother: 1,
  maternal_grandmother: 1,
  paternal_great_grandmother: 1,
  maternal_great_grandmother: 1,
  husband: 1,
  wife: 4,
};

const heirsUI = {
  container: null,
  host: null,
  inputs: new Map(),
  validationSlot: null,
  mainStack: null,
  advanced: null,
  advancedBody: null,
  groups: new Map(),
};

if (!root) {
  throw new Error('flow-root missing');
}

function syncWithUrl(current) {
  const url = new URL(window.location.href);
  const requested = url.searchParams.get('step');
  const defaultStep = current.step || STEP_ORDER[0];
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

function persist(next, opts = {}) {
  state = next;
  saveState(state);
  validation = validateState(state, roles);
  if (opts.render === false) {
    renderFooter();
    return;
  }
  render();
}

function stepFromIndex(index) {
  return STEP_ORDER[Math.min(Math.max(index, 0), STEP_ORDER.length - 1)];
}

function stepNumber(step) {
  return STEP_ORDER.indexOf(step) + 1;
}

function formatStepLabel(step) {
  const number = Math.max(1, stepNumber(step));
  return `Paso ${number}/${TOTAL_STEPS}`;
}

function nextStep(direction) {
  const currentIdx = STEP_ORDER.indexOf(state.step);
  const targetIdx = currentIdx + direction;
  return stepFromIndex(targetIdx);
}

async function ensureRoles(force = false) {
  if (isLoadingRoles) return;
  if (!force && roles.length) return;
  isLoadingRoles = true;
  rolesError = null;
  render();
  try {
    roles = await loadRoles(apiUrl);
  } catch (error) {
    rolesError = error instanceof Error ? error.message : 'No se pudieron cargar los roles.';
  } finally {
    isLoadingRoles = false;
    render();
  }
}

function goToStep(step) {
  if (!STEP_ORDER.includes(step)) return;
  persist(setStep(state, step));
  applyUrl(step);
  maybeAutoRecalc();
}

function renderNav() {
  if (!nav) return;
  nav.querySelectorAll('button[data-step]').forEach((btn) => {
    const isActive = btn.dataset.step === state.step;
    btn.classList.toggle('is-active', isActive);
    btn.disabled = btn.dataset.step === 'results' && !state.lastResponse && !state.lastError;
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
    next.textContent = state.step === 'review' && isCalculating ? 'Calculando…' : state.step === 'review'
      ? 'Calcular'
      : state.step === 'results'
      ? 'Finalizado'
      : 'Siguiente';
    next.disabled =
      state.step === 'results' ||
      isCalculating ||
      (validation.errors.length > 0 && (state.step === 'heirs' || state.step === 'review' || state.step === 'decedent'));
  }

  if (recalc) {
    recalc.classList.toggle('is-hidden', state.step !== 'results');
    recalc.disabled = isCalculating || (!state.lastResponse && !state.lastPayload && !state.lastError);
  }
}

function renderScreening() {
  const screening = state?.screening || {};
  const options = [
    { field: 'spouse', label: '¿Cónyuge?', helper: 'Activa la sección de esposo/esposa.' },
    { field: 'descendants', label: '¿Descendientes?', helper: 'Hijos o nietos directos.' },
    { field: 'ascendants', label: '¿Padre/madre vivos?', helper: 'Incluye abuelos si aplica.' },
    { field: 'siblings', label: '¿Hermanos?', helper: 'Germanos, consanguíneos o uterinos.' },
    { field: 'collaterals', label: '¿Colaterales?', helper: 'Tíos paternos y descendencia.' },
  ];

  const fields = options
    .map(
      (item) => `
        <label class="field field--inline">
          <input type="checkbox" data-screening-field="${item.field}" ${screening[item.field] ? 'checked' : ''} />
          <span><strong>${escapeHtml(item.label)}</strong><br /><span class="muted">${escapeHtml(item.helper)}</span></span>
        </label>
      `,
    )
    .join('');

  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${formatStepLabel('screening')}</p>
          <h2>${LABELS.screening}</h2>
          <p class="muted">Selecciona las ramas familiares relevantes para este caso. Tus elecciones solo afectan la visualización.</p>
        </div>
      </div>
      <div class="form-grid form-grid--two">
        ${fields}
      </div>
    </section>
  `;
}

function renderDecedent() {
  const { deceased, estate } = state;
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${formatStepLabel('decedent')}</p>
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
            ${renderOptions(
              [
                { value: 'M', label: 'Masculino' },
                { value: 'F', label: 'Femenino' },
              ],
              deceased.sex,
            )}
          </select>
        </label>
        <div class="field">
          <label for="estateValue">Montante de la herencia</label>
          <input id="estateValue"
                 type="number"
                 step="0.01"
                 min="0"
                 inputmode="decimal"
                 data-estate-field="value"
                 value="${escapeHtml(state.estateValue || estate?.value || '')}"
                 placeholder="Ej: 10000" />
          <div class="hint">Introduce el monto total (misma moneda para todo).</div>
        </div>
        <label class="field field--full">
          <span>Notas</span>
          <textarea name="deceased-notes" data-deceased-field="notes" rows="3" placeholder="Circunstancias o notas adicionales">${escapeHtml(deceased.notes)}</textarea>
        </label>
      </div>
      ${renderValidationMessages(['deceased'])}
    </section>
  `;
}

function renderHeirs() {
  const roleStatus = rolesError
    ? `<p class="text-error">${escapeHtml(rolesError)}</p>`
    : isLoadingRoles
    ? '<p class="muted">Cargando catálogo de roles…</p>'
    : '';

  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${formatStepLabel('heirs')}</p>
          <h2>${LABELS.heirs}</h2>
          <p class="muted">Declara cantidades por rol familiar.</p>
        </div>
        <div class="inline-actions">
          <button type="button" class="btn btn-ghost" data-action="reload-roles" ${isLoadingRoles ? 'disabled' : ''}>Recargar roles</button>
        </div>
      </div>
      ${roleStatus}
      <div id="heirs-matrix-host" class="stack"></div>
    </section>
  `;
}

function clampCount(role, raw) {
  const parsed = Number.parseInt(raw, 10);
  const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const max = ROLE_LIMITS[role];
  if (Number.isInteger(max)) {
    return Math.min(safe, max);
  }
  return safe;
}

function createRoleInput(role) {
  const label = ROLE_LABELS[role] || escapeHtml(role);
  const field = document.createElement('label');
  field.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = '1';
  input.inputMode = 'numeric';
  input.dataset.heirCount = role;
  const max = ROLE_LIMITS[role];
  if (Number.isInteger(max)) {
    input.max = String(max);
  }
  input.addEventListener('input', handleHeirCountInput);
  field.appendChild(span);
  field.appendChild(input);
  heirsUI.inputs.set(role, input);
  return field;
}

function createGroupSection(group) {
  const section = document.createElement('section');
  section.className = 'card card--subtle';

  const head = document.createElement('div');
  head.className = 'section-head section-head--compact';
  const title = document.createElement('h3');
  title.textContent = group.title;
  head.appendChild(title);
  section.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'form-grid form-grid--two';
  group.roles.forEach((role) => {
    const input = createRoleInput(role);
    grid.appendChild(input);
  });
  section.appendChild(grid);

  return section;
}

function createGroupWrapper(group) {
  const section = createGroupSection(group);
  let wrapper = section;
  let details = null;

  if (group.group === 'coll') {
    details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = group.title;
    details.appendChild(summary);
    details.appendChild(section);
    wrapper = details;
  }

  wrapper.dataset.groupKey = group.group;
  heirsUI.groups.set(group.group, { wrapper, details });
  return wrapper;
}

function createHeirsUIOnce() {
  if (heirsUI.container) return heirsUI.container;
  const container = document.createElement('div');
  container.className = 'stack';

  const mainStack = document.createElement('div');
  mainStack.className = 'stack';
  heirsUI.mainStack = mainStack;

  const advanced = document.createElement('details');
  advanced.className = 'card card--subtle';
  advanced.open = false;
  const advancedSummary = document.createElement('summary');
  advancedSummary.textContent = 'Avanzado';
  advanced.appendChild(advancedSummary);
  const advancedBody = document.createElement('div');
  advancedBody.className = 'stack';
  advanced.appendChild(advancedBody);
  heirsUI.advanced = advanced;
  heirsUI.advancedBody = advancedBody;

  ROLE_GROUPS.forEach((group) => {
    const wrapper = createGroupWrapper(group);
    mainStack.appendChild(wrapper);
  });

  container.appendChild(mainStack);
  container.appendChild(advanced);

  heirsUI.validationSlot = document.createElement('div');
  heirsUI.validationSlot.className = 'stack';
  container.appendChild(heirsUI.validationSlot);

  heirsUI.container = container;
  return container;
}

function applyScreeningLayout() {
  if (!heirsUI.mainStack || !heirsUI.advancedBody) return;
  heirsUI.mainStack.innerHTML = '';
  heirsUI.advancedBody.innerHTML = '';

  const prefs = state?.screening || {};

  ROLE_GROUPS.forEach((group) => {
    const groupUI = heirsUI.groups.get(group.group);
    if (!groupUI?.wrapper) return;
    const key =
      group.group === 'spouse'
        ? 'spouse'
        : group.group === 'desc'
        ? 'descendants'
        : group.group === 'asc'
        ? 'ascendants'
        : group.group === 'sib'
        ? 'siblings'
        : 'collaterals';
    const target = group.group === 'coll' ? heirsUI.advancedBody : prefs[key] ? heirsUI.mainStack : heirsUI.advancedBody;
    target.appendChild(groupUI.wrapper);
    if (groupUI.details && group.group === 'coll') {
      groupUI.details.open = Boolean(prefs.collaterals);
    }
  });

  const hasPrimary = heirsUI.mainStack.childElementCount > 0;
  const hasAdvanced = heirsUI.advancedBody.childElementCount > 0;
  if (heirsUI.advanced) {
    heirsUI.advanced.classList.toggle('is-hidden', !hasAdvanced);
    heirsUI.advanced.open = prefs.collaterals || !hasPrimary;
  }
}

function syncHeirsUIFromState() {
  const counts = state?.heirsCounts || {};
  const deceasedSex = String(state?.deceased?.sex || '').toUpperCase();
  heirsUI.inputs.forEach((input, role) => {
    const value = counts[role] ?? 0;
    const clamped = clampCount(role, value);
    if (String(input.value) !== String(clamped)) {
      input.value = String(clamped);
    }

    const disableInputs = !deceasedSex;
    input.disabled = disableInputs;

    const shouldHideHusband = deceasedSex === 'M' || !deceasedSex;
    const shouldHideWife = deceasedSex === 'F' || !deceasedSex;

    if (role === 'husband') {
      input.closest('.field')?.classList.toggle('is-hidden', shouldHideHusband);
    }
    if (role === 'wife') {
      input.closest('.field')?.classList.toggle('is-hidden', shouldHideWife);
    }
  });
}

function renderHeirsValidation() {
  if (!heirsUI.validationSlot) return;
  heirsUI.validationSlot.innerHTML = renderValidationMessages(['heirs']);
}

function renderReview() {
  let previewPayload = {};
  try {
    previewPayload = buildPayload(state);
  } catch (error) {
    previewPayload = { error: error instanceof Error ? error.message : 'Payload inválido', estate_value: state?.estate?.value || '' };
  }
  const pretty = JSON.stringify(previewPayload, null, 2);
  const heirsCount = Object.values(state.heirsCounts || {}).reduce((acc, value) => acc + (Number(value) || 0), 0);
  const heirsRoles = Object.values(state.heirsCounts || {}).filter((value) => Number(value) > 0).length;
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${formatStepLabel('review')}</p>
          <h2>${LABELS.review}</h2>
          <p class="muted">Repasa la información antes de calcular.</p>
        </div>
        <div class="inline-actions">
          <button type="button" class="btn btn-primary" data-action="calc" ${
            validation.errors.length || isCalculating ? 'disabled' : ''
          }>${isCalculating ? 'Calculando…' : 'Calcular'}</button>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-item">
          <p class="eyebrow">Causante</p>
          <p><strong>${escapeHtml(state.deceased.name || 'Sin nombre')}</strong></p>
        </div>
        <div class="summary-item">
          <p class="eyebrow">Herederos</p>
          <p><strong>${heirsCount}</strong> persona(s) declarada(s)</p>
          <p class="muted">${heirsRoles} rol(es) activo(s)</p>
        </div>
        <div class="summary-item">
          <p class="eyebrow">Montante</p>
          <p><strong>${escapeHtml(state.estateValue || state.estate?.value || '—')}</strong></p>
          <p class="muted">Moneda: ${escapeHtml(state.estate?.currency || 'N/A')}</p>
        </div>
        <div class="summary-item">
          <p class="eyebrow">Notas</p>
          <p>${escapeHtml(state.deceased.notes || 'Sin notas')}</p>
        </div>
      </div>
      <div class="card card--subtle">
        <p class="eyebrow">Preview JSON</p>
        <pre class="code-block">${escapeHtml(pretty)}</pre>
      </div>
      ${renderValidationMessages(['review'])}
      ${state.lastError ? `<p class="text-error">${escapeHtml(state.lastError)}</p>` : ''}
    </section>
  `;
}

function extractRows(resp) {
  const root = resp && typeof resp === 'object' ? resp : null;
  if (!root) return null;

  const candidates = [root.output, root.result, root.data, root].filter(Boolean);

  for (const c of candidates) {
    const arrays = ['shares', 'distribution', 'allocations', 'rows', 'heirs'];
    for (const k of arrays) {
      if (Array.isArray(c[k])) return c[k];
    }
  }
  return null;
}

function renderResultTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const body = rows
    .map((entry) => {
      const label = entry?.role || entry?.code || entry?.label || '(?)';
      const fraction = entry?.fraction || entry?.ratio || entry?.share || entry?.portion || '';
      const amount = entry?.amount || entry?.value || entry?.share_amount || '';
      return `
        <tr>
          <td>${escapeHtml(String(label))}</td>
          <td>${fraction !== '' && fraction !== undefined ? escapeHtml(String(fraction)) : '<span class="muted">—</span>'}</td>
          <td>${amount !== '' && amount !== undefined ? escapeHtml(String(amount)) : '<span class="muted">—</span>'}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <section class="result-block">
      <div class="result-block__head">
        <h3>Reparto</h3>
      </div>
      <div class="table-responsive">
        <table class="table result-table">
          <thead>
            <tr><th>Heir/Role</th><th>Fraction</th><th>Amount</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderRawSection() {
  return `
    <details class="raw">
      <summary>Respuesta cruda (RAW JSON)</summary>
      <pre id="rawJson"></pre>
    </details>
  `;
}

function renderResults() {
  const rows = extractRows(state.lastResponse);
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const canExport = Boolean(state.lastResponse || state.lastPayload);

  const errorBanner = state.lastError
    ? `<div class="alert alert-error"><p>${escapeHtml(state.lastError)}</p></div>`
    : '';
  const noResults = !state.lastResponse && !state.lastError;

  const mappedTable = hasRows ? renderResultTable(rows) : '';
  const mappingFallback = !hasRows && state.lastResponse
    ? '<p class="muted">No se pudo mapear el resultado a una tabla. Revisa el JSON crudo.</p>'
    : '';

  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">${formatStepLabel('results')}</p>
          <h2>${LABELS.results}</h2>
          <p class="muted">Consulta y comparte el resultado del cálculo.</p>
        </div>
        <div class="inline-actions">
          <button type="button" class="btn" data-action="edit-case">Editar caso</button>
          <button type="button" class="btn" data-action="export-json" ${canExport ? '' : 'disabled'}>Exportar JSON</button>
          <button type="button" class="btn" data-action="calc" ${isCalculating ? 'disabled' : ''}>${
            isCalculating ? 'Calculando…' : 'Recalcular'
          }</button>
        </div>
      </div>
      ${errorBanner}
      ${mappedTable || ''}
      ${mappingFallback}
      ${noResults ? '<p class="empty">No hay resultados aún.</p>' : ''}
      ${renderRawSection()}
    </section>
  `;
}

function renderValidationMessages(sections = []) {
  const bag = Array.isArray(sections) && sections.length ? sections : null;
  const fromSections = (type) => {
    if (!bag) return validation?.[type] || [];
    return bag.flatMap((key) => validation?.bySection?.[key]?.[type] || []);
  };

  const errors = fromSections('errors');
  const warnings = fromSections('warnings');
  if (!errors.length && !warnings.length) return '';

  const errorList = errors.length
    ? `<div class="alert alert-error"><p><strong>Errores</strong></p><ul>${errors.map((msg) => `<li>${escapeHtml(msg)}</li>`).join('')}</ul></div>`
    : '';
  const warningList = warnings.length
    ? `<div class="alert alert-warning"><p><strong>Avisos</strong></p><ul>${warnings.map((msg) => `<li>${escapeHtml(msg)}</li>`).join('')}</ul></div>`
    : '';
  return `<div class="stack">${errorList}${warningList}</div>`;
}

function render() {
  if (!root) return;
  validation = validateState(state, roles);

  const fragments = {
    screening: renderScreening(),
    decedent: renderDecedent(),
    heirs: renderHeirs(),
    review: renderReview(),
    results: renderResults(),
  };
  root.innerHTML = fragments[state.step] || '';

  if (state.step === 'results') {
    const rawPre = root.querySelector('#rawJson');
    if (rawPre) {
      const rawText = state.lastResponse !== null && state.lastResponse !== undefined
        ? JSON.stringify(state.lastResponse, null, 2)
        : 'null';
      rawPre.textContent = rawText;
    }
  }

  const heirsHost = root.querySelector('#heirs-matrix-host');
  if (heirsHost) {
    heirsUI.host = heirsHost;
    const matrix = createHeirsUIOnce();
    if (matrix.parentElement !== heirsHost) {
      heirsHost.replaceChildren(matrix);
    }
    applyScreeningLayout();
    syncHeirsUIFromState();
    renderHeirsValidation();
  }
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
  if (!target.dataset.step) return;
  if (validation.errors.length && (target.dataset.step === 'review' || target.dataset.step === 'results')) {
    render();
    return;
  }
  goToStep(target.dataset.step);
}

function handleFooterClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.dataset.action) return;
  if (target.dataset.action === 'back') {
    goToStep(nextStep(-1));
  }
  if (target.dataset.action === 'next') {
    if (state.step === 'review') {
      runCalc();
      return;
    }
    if (validation.errors.length && (state.step === 'heirs' || state.step === 'decedent')) {
      render();
      return;
    }
    goToStep(nextStep(1));
  }
  if (target.dataset.action === 'recalc') {
    runCalc();
  }
}

function handleDecedentInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const screeningField = target.dataset.screeningField;
  if (screeningField) {
    const value = target instanceof HTMLInputElement ? target.checked : false;
    persist(setScreening(state, { [screeningField]: value }));
    return;
  }
  const estateField = target.dataset.estateField;
  if (estateField === 'value') {
    const raw = String(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
      ? target.value
      : '');
    const normalized = raw.replace(',', '.');
    const next = setEstateValue(state, normalized);
    persist(next, { render: event.type !== 'input' });
    return;
  }
  const field = target.dataset.deceasedField;
  if (!field) return;
  const value = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
    ? target.type === 'checkbox'
      ? target.checked
      : target.value
    : '';
  const isTypingTarget =
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.type !== 'checkbox';
  if (event.type === 'input' && isTypingTarget) {
    persist(setDeceased(state, { [field]: value }), { render: false });
  } else {
    persist(setDeceased(state, { [field]: value }));
  }
}

function handleHeirCountInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const role = target.dataset.heirCount;
  if (!role) return;
  const value = clampCount(role, target.value);
  if (String(target.value) !== String(value)) {
    target.value = String(value);
  }
  const next = setHeirCount(state, role, value);
  persist(next, { render: false });
}

function handleRootClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action === 'reload-roles') {
    ensureRoles(true);
  }
  if (target.dataset.action === 'calc') {
    runCalc();
  }
  if (target.dataset.action === 'edit-case') {
    goToStep('heirs');
  }
  if (target.dataset.action === 'export-json') {
    let payload = null;
    try {
      payload = state.lastPayload || buildPayload(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo construir el payload para exportar.';
      const next = setLastError(state, message);
      persist(next, { render: true });
      return;
    }
    const data = { state, payload, response: state.lastResponse, error: state.lastError };
    exportJson('heritage_result.json', data);
  }
  if (target.dataset.action === 'download-raw') {
    exportJson('calc_raw_response.json', { response: state.lastResponse, error: state.lastError });
  }
}

function handlePageClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action === 'reset-case') {
    const fresh = setStep(resetCase(), STEP_ORDER[0]);
    rolesError = null;
    fresh.lastError = '';
    isCalculating = false;
    applyUrl(fresh.step);
    persist(fresh);
  }
}

function setCalcBusy(flag) {
  isCalculating = flag;
  renderFooter();
  const calcButtons = root ? root.querySelectorAll('[data-action="calc"]') : [];
  calcButtons.forEach((btn) => {
    btn.disabled = flag || validation.errors.length > 0;
    btn.textContent = flag ? 'Calculando…' : 'Calcular';
  });
  const footerCalc = footerActions?.querySelector('[data-action="next"]');
  if (footerCalc && state.step === 'review') {
    footerCalc.textContent = flag ? 'Calculando…' : 'Calcular';
    footerCalc.disabled = flag || validation.errors.length > 0;
  }
  const recalcButton = footerActions?.querySelector('[data-action="recalc"]');
  if (recalcButton) {
    recalcButton.disabled = flag;
  }
}

async function runCalc() {
  state.lastError = '';
  const payload = buildPayload(state);

  const v = validateState(state, roles);
  if (v.errors.length) {
    const next = setLastError(state, v.errors.join('\n'));
    persist({ ...next }, { render: true });
    return;
  }

  setCalcBusy(true);

  try {
    const json = await postCalc(apiUrl, payload);
    const withPayload = setLastPayload(state, payload);
    const next = setLastError(setLastResponse(withPayload, json), '');
    persist(next, { render: true });
    goToStep('results');
  } catch (e) {
    const message = String(e && e.message ? e.message : e);
    const withPayload = setLastPayload(state, payload);
    const next = setLastResponse(setLastError(withPayload, message), null);
    persist(next, { render: true });
    goToStep('results');
  } finally {
    setCalcBusy(false);
  }
}

function maybeAutoRecalc() {
  if (state.step !== 'results') return;
  if (isCalculating || state.lastError) return;
  if (state.lastResponse || !state.lastPayload) return;
  runCalc();
}

function bindEvents() {
  nav?.addEventListener('click', handleNavClick);
  footerActions?.addEventListener('click', handleFooterClick);
  root?.addEventListener('input', handleDecedentInput);
  root?.addEventListener('change', handleDecedentInput);
  root?.addEventListener('click', handleRootClick);
  page?.addEventListener('click', handlePageClick);
}

function mount() {
  if (!root) return null;
  if (!nav || !footerActions) return null;
  bindEvents();
  ensureRoles();
  render();
  root.setAttribute('tabindex', '-1');
  root.focus({ preventScroll: false });
  return root;
}

export { mount };
