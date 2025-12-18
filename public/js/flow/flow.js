import {
  createInitialState,
  setDeceasedField,
  setEstateValue,
  setHeirCount,
  setLastPayload,
  setLastResponse,
  setLastError,
  setStep,
} from './state.js';
import { loadState, saveState, resetState as clearStorage } from './storage.js';
import { validateState } from './validate.js';
import { buildPayload } from './payload.js';
import { getRoles, postCalc } from './api.js';
import { ROLE_GROUPS, ROLE_LABELS } from './roles_meta.js';

const STEPS = ['decedent', 'heirs', 'review', 'results'];

let state = createInitialState();
let rolesCatalog = [];
let validation = { errors: [], warnings: [] };
let rolesWarning = '';
let root = null;
let stepContainer = null;
let errorsBox = null;
let warningsBox = null;
let errorBanner = null;
let footer = null;

function getRoleLabel(role) {
  const match = rolesCatalog.find((r) => {
    if (typeof r === 'string') return r === role;
    const code = r?.role || r?.code || r?.id;
    return code === role;
  });
  return match?.label || match?.name || match?.title || ROLE_LABELS[role] || role;
}

function getRoleMax(role, sex) {
  if (role === 'wife') return sex === 'M' ? 4 : 0;
  if (role === 'husband') return sex === 'F' ? 1 : 0;
  if (role === 'father' || role === 'mother') return 1;
  return Infinity;
}

function clampRoleCount(role, raw, sex) {
  let n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) n = 0;
  const max = getRoleMax(role, sex);
  if (Number.isFinite(max)) n = Math.min(n, max);
  return n;
}

function setState(next, { render = true } = {}) {
  state = next;
  saveState(state);
  validation = validateState(state, rolesCatalog);
  if (rolesWarning) {
    validation = { ...validation, warnings: [...validation.warnings, rolesWarning] };
  }
  if (render) {
    renderStep(state.step);
  } else {
    updateFooterAndErrors();
  }
}

function applyRoleFilter(query) {
  if (!stepContainer) return;
  const term = String(query || '').trim().toLowerCase();
  const rows = stepContainer.querySelectorAll('[data-role-row]');
  rows.forEach((row) => {
    const role = row.getAttribute('data-role-row');
    const label = row.querySelector('.role-label')?.textContent || '';
    const matches = !term || role.toLowerCase().includes(term) || label.toLowerCase().includes(term);
    row.style.display = matches ? '' : 'none';
  });
}

function updateFooterAndErrors() {
  if (!errorsBox || !warningsBox) return;
  errorsBox.innerHTML = '';
  warningsBox.innerHTML = '';
  const { errors, warnings } = validation;
  if (errors.length) {
    const list = document.createElement('ul');
    errors.forEach((err) => {
      const li = document.createElement('li');
      li.textContent = err;
      list.appendChild(li);
    });
    errorsBox.appendChild(list);
  }
  if (warnings.length) {
    const list = document.createElement('ul');
    warnings.forEach((warn) => {
      const li = document.createElement('li');
      li.textContent = warn;
      list.appendChild(li);
    });
    warningsBox.appendChild(list);
  }
  if (errorBanner) {
    errorBanner.textContent = state.lastError || '';
    errorBanner.style.display = state.lastError ? '' : 'none';
  }
  updateFooterControls();
}

function updateFooterControls() {
  if (!footer) return;
  const backBtn = footer.querySelector('[data-action="back"]');
  const nextBtn = footer.querySelector('[data-action="next"]');
  const calcBtn = footer.querySelector('[data-action="calc"]');
  const resetBtn = footer.querySelector('[data-action="reset"]');

  const idx = STEPS.indexOf(state.step);
  if (backBtn) backBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.style.display = state.step === 'review' || state.step === 'results' ? 'none' : '';
  if (calcBtn) calcBtn.style.display = state.step === 'review' ? '' : 'none';
  if (resetBtn) resetBtn.disabled = false;
}

function syncSingleRoleRow(role) {
  if (!stepContainer) return;
  const row = stepContainer.querySelector(`[data-role-row="${role}"] input[data-role="${role}"]`);
  if (row) {
    row.value = state.heirsCounts[role] ?? 0;
  }
}

function renderDecedent() {
  return `
    <div class="card">
      <h2>Causante</h2>
      <label>Nombre
        <input type="text" data-deceased="name" value="${state.deceased.name || ''}" />
      </label>
      <label>Sexo
        <select data-deceased="sex">
          <option value="M" ${state.deceased.sex === 'M' ? 'selected' : ''}>Masculino</option>
          <option value="F" ${state.deceased.sex === 'F' ? 'selected' : ''}>Femenino</option>
        </select>
      </label>
      <label>Notas
        <textarea data-deceased="notes">${state.deceased.notes || ''}</textarea>
      </label>
      <label>Valor de la herencia
        <input type="number" step="0.01" data-estate="value" value="${state.estate.value || ''}" />
      </label>
    </div>
  `;
}

function renderRoleRow(role) {
  const count = state.heirsCounts[role] ?? 0;
  const label = getRoleLabel(role);
  return `
    <div class="row" data-role-row="${role}">
      <span class="role-label">${label}</span>
      <div class="role-controls">
        <button type="button" data-action="dec" data-role="${role}">−</button>
        <input type="number" min="0" step="1" data-role="${role}" value="${count}" />
        <button type="button" data-action="inc" data-role="${role}">+</button>
      </div>
    </div>
  `;
}

function renderHeirs() {
  const sex = state.deceased.sex;
  const groupsHtml = ROLE_GROUPS.map((group) => {
    let roles = group.roles;
    if (group.id === 'spouse') {
      roles = sex === 'M' ? ['wife'] : ['husband'];
    }
    if (!roles || roles.length === 0) return '';
    const rows = roles.map((role) => renderRoleRow(role)).join('');
    return `
      <section class="card" data-group="${group.id}">
        <details open>
          <summary>${group.title}</summary>
          <div class="role-rows">${rows}</div>
        </details>
      </section>
    `;
  }).join('');

  return `
    <div class="heirs">
      <div class="filter">
        <input type="text" data-filter="roles" placeholder="Buscar rol…" />
      </div>
      ${groupsHtml}
    </div>
  `;
}

function renderReview() {
  const heirsList = Object.entries(state.heirsCounts || {})
    .filter(([, count]) => Number.parseInt(count, 10) > 0)
    .map(([role, count]) => `<li>${getRoleLabel(role)}: ${count}</li>`) || [];
  return `
    <div class="card">
      <h2>Revisión</h2>
      <p><strong>Nombre:</strong> ${state.deceased.name || '(sin nombre)'}</p>
      <p><strong>Sexo:</strong> ${state.deceased.sex}</p>
      <p><strong>Valor herencia:</strong> ${state.estate.value || '(sin valor)'}</p>
      <p><strong>Notas:</strong> ${state.deceased.notes || '(sin notas)'}</p>
      <h3>Herederos</h3>
      <ul>${heirsList.join('')}</ul>
      <button type="button" data-action="calc" class="btn primary">Calcular</button>
    </div>
  `;
}

function renderResults() {
  const response = state.lastResponse;
  return `
    <div class="card">
      <h2>Resultados</h2>
      ${state.lastError ? `<div class="error-banner">${state.lastError}</div>` : ''}
      ${response ? `<details open><summary>RAW JSON</summary><pre>${JSON.stringify(response, null, 2)}</pre></details>` : '<p>Sin resultados.</p>'}
    </div>
  `;
}

function renderStep(step) {
  if (!stepContainer) return;
  state = setStep(state, step);
  saveState(state);
  let body = '';
  if (step === 'decedent') body = renderDecedent();
  else if (step === 'heirs') body = renderHeirs();
  else if (step === 'review') body = renderReview();
  else if (step === 'results') body = renderResults();
  stepContainer.innerHTML = body;
  updateFooterAndErrors();
}

function onInput(event) {
  const target = event.target;
  const deceasedKey = target.dataset?.deceased;
  const estateKey = target.dataset?.estate;
  const role = target.dataset?.role;
  const filter = target.dataset?.filter;

  if (filter === 'roles') {
    applyRoleFilter(target.value);
    return;
  }

  if (deceasedKey === 'name' || deceasedKey === 'notes') {
    const next = setDeceasedField(state, deceasedKey, target.value);
    setState(next, { render: false });
    return;
  }

  if (estateKey === 'value') {
    const next = setEstateValue(state, target.value);
    setState(next, { render: false });
    return;
  }

  if (role) {
    const clamped = clampRoleCount(role, target.value, state.deceased.sex);
    const next = setHeirCount(state, role, clamped);
    setState(next, { render: false });
    syncSingleRoleRow(role);
  }
}

function onChange(event) {
  const target = event.target;
  const deceasedKey = target.dataset?.deceased;
  if (deceasedKey === 'sex') {
    const next = setDeceasedField(state, 'sex', target.value);
    setState(next, { render: false });
    const shouldRenderHeirs = state.step === 'heirs';
    renderStep(shouldRenderHeirs ? 'heirs' : state.step);
  }
}

function nextStep(direction) {
  const idx = STEPS.indexOf(state.step);
  const nextIdx = Math.min(Math.max(idx + direction, 0), STEPS.length - 1);
  return STEPS[nextIdx];
}

async function handleCalc() {
  validation = validateState(state, rolesCatalog);
  if (validation.errors.length) {
    state = setLastError(state, validation.errors.join('; '));
    saveState(state);
    updateFooterAndErrors();
    return;
  }
  const payload = buildPayload(state);
  state = setLastPayload(state, payload);
  saveState(state);
  try {
    const result = await postCalc(payload);
    state = setLastResponse(state, result);
    state = setLastError(state, '');
    setState(setStep(state, 'results'));
  } catch (err) {
    state = setLastResponse(state, null);
    state = setLastError(state, err.message);
    saveState(state);
    renderStep('review');
  }
}

function onClick(event) {
  const action = event.target?.dataset?.action;
  const role = event.target?.dataset?.role;
  if (action === 'next') {
    const next = nextStep(1);
    setState(setStep(state, next));
    return;
  }
  if (action === 'back') {
    const prev = nextStep(-1);
    setState(setStep(state, prev));
    return;
  }
  if (action === 'reset') {
    clearStorage();
    state = createInitialState();
    setState(state);
    return;
  }
  if (action === 'calc') {
    event.preventDefault();
    void handleCalc();
    return;
  }
  if ((action === 'inc' || action === 'dec') && role) {
    const current = state.heirsCounts[role] ?? 0;
    const delta = action === 'inc' ? 1 : -1;
    const nextValue = clampRoleCount(role, current + delta, state.deceased.sex);
    const next = setHeirCount(state, role, nextValue);
    setState(next, { render: false });
    syncSingleRoleRow(role);
  }
}

async function loadRolesCatalog() {
  try {
    rolesCatalog = await getRoles();
    rolesWarning = '';
  } catch (err) {
    rolesCatalog = [];
    rolesWarning = 'No se pudo cargar el catálogo de roles';
    console.warn(err);
  } finally {
    validation = validateState(state, rolesCatalog);
    if (rolesWarning) validation.warnings.push(rolesWarning);
    updateFooterAndErrors();
  }
}

export async function mount(el) {
  root = el || document.getElementById('flow-root') || document.getElementById('flowApp');
  if (!root) throw new Error('flow root not found');
  state = loadState();
  validation = validateState(state, rolesCatalog);
  root.innerHTML = `
    <div class="flow-shell">
      <div class="flow-messages">
        <div class="errors" data-errors></div>
        <div class="warnings" data-warnings></div>
        <div class="error-banner" data-error-banner style="display:none;"></div>
      </div>
      <div data-step-container></div>
      <div class="flow-footer">
        <button type="button" data-action="back">Atrás</button>
        <button type="button" data-action="next">Siguiente</button>
        <button type="button" data-action="calc">Calcular</button>
        <button type="button" data-action="reset">Reset</button>
      </div>
    </div>
  `;

  stepContainer = root.querySelector('[data-step-container]');
  errorsBox = root.querySelector('[data-errors]');
  warningsBox = root.querySelector('[data-warnings]');
  errorBanner = root.querySelector('[data-error-banner]');
  footer = root.querySelector('.flow-footer');

  root.addEventListener('input', onInput, true);
  root.addEventListener('change', onChange, true);
  root.addEventListener('click', onClick, true);

  renderStep(state.step);
  updateFooterAndErrors();
  void loadRolesCatalog();
}
