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
import { ROLE_LABELS } from './roles_meta.js';
import { exportJson } from './export.js';

const STEP_ORDER = ['decedent', 'heirs', 'review', 'results'];
const DEFAULT_REACHED = {
  decedent: true,
  heirs: false,
  review: false,
  results: false,
};

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

function normalizeReached(reached = {}) {
  return { ...DEFAULT_REACHED, ...reached };
}

function ensureStepValue(step) {
  return STEP_ORDER.includes(step) ? step : STEP_ORDER[0];
}

function markStepReached(current, step) {
  const safeStep = ensureStepValue(step || current.step);
  const reached = normalizeReached(current.reached);
  const idx = STEP_ORDER.indexOf(safeStep);
  if (idx < 0) return current;
  const nextReached = { ...reached };
  for (let i = 0; i <= idx; i += 1) {
    nextReached[STEP_ORDER[i]] = true;
  }
  return { ...current, reached: nextReached };
}

function withStateDefaults(next) {
  return {
    ...next,
    step: ensureStepValue(next.step),
    reached: normalizeReached(next.reached),
  };
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

function setState(next, { render = true } = {}) {
  const normalized = withStateDefaults(normalizeSpouseCounts(next));
  state = normalized;
  validation = validateState(state, rolesCatalog);
  if (rolesWarning) {
    validation = { ...validation, warnings: [...validation.warnings, rolesWarning] };
  }
  saveState(state);
  if (render) {
    renderStep(state.step);
  } else {
    updateFooterAndErrors();
  }
}

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

function normalizeSpouseCounts(current) {
  const sex = current?.deceased?.sex;
  const counts = { ...(current.heirsCounts || {}) };
  if (sex === 'M') {
    counts.husband = 0;
    counts.wife = clampRoleCount('wife', counts.wife, sex);
  } else if (sex === 'F') {
    counts.wife = 0;
    counts.husband = clampRoleCount('husband', counts.husband, sex);
  }
  return { ...current, heirsCounts: counts };
}

function roleRow(role, label, hint, max) {
  const v = Number(state.heirsCounts?.[role] || 0);
  const mAttr = Number.isFinite(max) ? `max=\"${max}\"` : '';
  return `
    <div class=\"row\" style=\"align-items:center; gap:.75rem; justify-content:space-between;\">
      <div>
        <strong>${label}</strong>
        ${hint ? `<div class=\"muted\" style=\"margin-top:.15rem\">${hint}</div>` : ``}
      </div>
      <div class=\"row\" style=\"gap:.5rem; align-items:center;\">
        <button type=\"button\" class=\"btn\" data-action=\"dec\" data-role=\"${role}\">−</button>
        <input class=\"input\" type=\"number\" inputmode=\"numeric\" min=\"0\" ${mAttr}
          value=\"${v}\" data-role=\"${role}\" style=\"width:96px; text-align:center;\">
        <button type=\"button\" class=\"btn\" data-action=\"inc\" data-role=\"${role}\">+</button>
      </div>
    </div>
  `;
}

function updateStepper() {
  if (!root) return;
  const buttons = root.querySelectorAll('[data-step]');
  const currentIdx = STEP_ORDER.indexOf(state.step);
  const reached = normalizeReached(state.reached);
  const hasErrors = validation.errors.length > 0;

  buttons.forEach((btn) => {
    const step = btn.dataset?.step;
    const idx = STEP_ORDER.indexOf(step);
    const isCurrent = step === state.step;
    if (isCurrent) {
      btn.setAttribute('aria-current', 'step');
    } else {
      btn.removeAttribute('aria-current');
    }
    const isFuture = idx > currentIdx;
    const isReachable = reached[step];
    btn.disabled = !isReachable || (hasErrors && isFuture);
  });
}

function updateFooterControls() {
  if (!footer) return;
  const backBtn = footer.querySelector('[data-action="back"]');
  const nextBtn = footer.querySelector('[data-action="next"]');
  const calcBtn = footer.querySelector('[data-action="calc"]');

  const idx = STEP_ORDER.indexOf(state.step);
  if (backBtn) backBtn.disabled = idx <= 0;

  if (nextBtn) {
    nextBtn.style.display = state.step === 'results' ? 'none' : '';
    nextBtn.disabled = state.step === 'review' || state.step === 'results' || validation.errors.length > 0;
  }

  if (calcBtn) {
    const isReview = state.step === 'review';
    calcBtn.style.display = isReview ? '' : 'none';
    calcBtn.disabled = !isReview;
  }
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
  updateStepper();
}

function syncSingleRoleRow(role) {
  if (!stepContainer) return;
  const input = stepContainer.querySelector(`input[data-role="${role}"]`);
  if (input) {
    input.value = state.heirsCounts[role] ?? 0;
  }
}

function renderDecedent() {
  return `
    <h3>Datos del causante</h3>
    <div class="form-grid">
      <label class="field">
        <span class="field__label">Nombre</span>
        <input type="text" name="deceased-name" data-deceased="name" value="${state.deceased.name || ''}" placeholder="Nombre completo" />
      </label>
      <label class="field">
        <span class="field__label">Sexo</span>
        <select name="deceased-sex" data-deceased="sex">
          <option value="M" ${state.deceased.sex === 'M' ? 'selected' : ''}>Masculino</option>
          <option value="F" ${state.deceased.sex === 'F' ? 'selected' : ''}>Femenino</option>
        </select>
      </label>
      <label class="field">
        <span class="field__label">Valor de la herencia</span>
        <input type="number" min="0" step="0.01" name="estate-value" data-estate="value" value="${state.estate.value || ''}" placeholder="0.00" />
      </label>
      <label class="field" style="grid-column: 1 / -1">
        <span class="field__label">Notas</span>
        <textarea name="deceased-notes" data-deceased="notes" rows="3" placeholder="Observaciones relevantes...">${state.deceased.notes || ''}</textarea>
      </label>
    </div>
  `;
}

function renderHeirs() {
  const spouseCard = state.deceased.sex === 'M'
    ? roleRow('wife', getRoleLabel('wife'), 'Máximo 4 esposas', 4)
    : roleRow('husband', getRoleLabel('husband'), 'Máximo 1 esposo', 1);

  const descendants = [
    roleRow('son', getRoleLabel('son'), 'Incluye todos los hijos'),
    roleRow('daughter', getRoleLabel('daughter'), 'Incluye todas las hijas'),
    roleRow('sons_son', getRoleLabel('sons_son'), 'Nietos por hijo'),
    roleRow('sons_daughter', getRoleLabel('sons_daughter'), 'Nietas por hijo')
  ].join('');

  const ascendants = [
    roleRow('father', getRoleLabel('father'), '', 1),
    roleRow('mother', getRoleLabel('mother'), '', 1),
    roleRow('paternal_grandfather', getRoleLabel('paternal_grandfather')),
    roleRow('paternal_grandmother', getRoleLabel('paternal_grandmother')),
    roleRow('maternal_grandmother', getRoleLabel('maternal_grandmother'))
  ].join('');

  const siblings = [
    roleRow('full_brother', getRoleLabel('full_brother')),
    roleRow('full_sister', getRoleLabel('full_sister')),
    roleRow('consanguine_brother', getRoleLabel('consanguine_brother')),
    roleRow('consanguine_sister', getRoleLabel('consanguine_sister')),
    roleRow('uterine_brother', getRoleLabel('uterine_brother')),
    roleRow('uterine_sister', getRoleLabel('uterine_sister'))
  ].join('');

  const others = [
    roleRow('paternal_uncle', getRoleLabel('paternal_uncle')),
    roleRow('paternal_uncle_son', getRoleLabel('paternal_uncle_son')),
    roleRow('maternal_uncle', getRoleLabel('maternal_uncle')),
    roleRow('maternal_uncle_son', getRoleLabel('maternal_uncle_son'))
  ].join('');

  return `
    <div class="muted" style="margin-bottom:.75rem">
      <p style="margin:0">Introduce conteos.</p>
      <p style="margin:.15rem 0 0 0">Si un pariente existe pero queda bloqueado por otros, el motor lo indicará en resultados.</p>
    </div>
    <div class="stack" style="gap:.75rem">
      <section class="card">
        <h3 style="margin-top:0">Cónyuge</h3>
        <div class="stack" style="gap:.75rem">${spouseCard}</div>
      </section>
      <section class="card">
        <h3 style="margin-top:0">Descendientes</h3>
        <div class="stack" style="gap:.75rem">${descendants}</div>
      </section>

      <section class="card">
        <h3 style="margin-top:0">Ascendientes</h3>
        <div class="stack" style="gap:.75rem">${ascendants}</div>
      </section>

      <section class="card">
        <h3 style="margin-top:0">Hermanos/as</h3>
        <div class="stack" style="gap:.75rem">${siblings}</div>
      </section>

      <section class="card">
        <details>
          <summary><strong>Otros (tíos, primos, etc.)</strong></summary>
          <div class="stack" style="gap:.75rem; margin-top:.75rem">${others}</div>
        </details>
      </section>
    </div>
  `;
}

function renderReview() {
  const heirsList = Object.entries(state.heirsCounts || {})
    .filter(([, count]) => Number.parseInt(count, 10) > 0)
    .map(([role, count]) => `<li>${getRoleLabel(role)}: ${count}</li>`) || [];
  return `
    <h2>Revisión</h2>
    <div class="form-grid">
      <div class="field">
        <span class="field__label">Nombre</span>
        <p>${state.deceased.name || '(sin nombre)'}</p>
      </div>
      <div class="field">
        <span class="field__label">Sexo</span>
        <p>${state.deceased.sex}</p>
      </div>
      <div class="field">
        <span class="field__label">Valor herencia</span>
        <p>${state.estate.value || '(sin valor)'}</p>
      </div>
      <div class="field" style="grid-column: 1 / -1">
        <span class="field__label">Notas</span>
        <p>${state.deceased.notes || '(sin notas)'}</p>
      </div>
    </div>
    <h3>Herederos</h3>
    <ul class="muted">${heirsList.length ? heirsList.join('') : '<li>(sin herederos)</li>'}</ul>
    <div class="downloads">
      <button type="button" class="btn" data-action="dl-payload">Descargar payload</button>
      <label class="btn file-input">
        Cargar payload
        <input type="file" accept="application/json" data-action="import" />
      </label>
    </div>
  `;
}

function renderResults() {
  const response = state.lastResponse;
  return `
    <h2>Resultados</h2>
    ${state.lastError ? `<div class="error-banner">${state.lastError}</div>` : ''}
    ${response ? `<details open><summary>RAW JSON</summary><pre>${JSON.stringify(response, null, 2)}</pre></details>` : '<p>Sin resultados.</p>'}
    <div class="downloads">
      <button type="button" class="btn" data-action="dl-result">Descargar resultado</button>
    </div>
  `;
}

function captureActiveFocus() {
  if (!stepContainer) return null;
  const active = document.activeElement;
  if (!active || !stepContainer.contains(active)) return null;
  return {
    name: active.getAttribute('name'),
    role: active.dataset?.role,
    deceased: active.dataset?.deceased,
    selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
  };
}

function restoreFocus(snapshot) {
  if (!snapshot || !stepContainer) return;
  let target = null;
  if (snapshot.name) {
    target = stepContainer.querySelector(`[name="${snapshot.name}"]`);
  }
  if (!target && snapshot.role) {
    target = stepContainer.querySelector(`[data-role="${snapshot.role}"]`);
  }
  if (!target && snapshot.deceased) {
    target = stepContainer.querySelector(`[data-deceased="${snapshot.deceased}"]`);
  }
  if (target) {
    target.focus({ preventScroll: true });
    if (
      typeof snapshot.selectionStart === 'number'
      && typeof snapshot.selectionEnd === 'number'
      && typeof target.setSelectionRange === 'function'
    ) {
      target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  }
}

function renderStep(step = state.step) {
  if (!stepContainer) return;
  const focusSnapshot = captureActiveFocus();
  let body = '';
  if (step === 'decedent') body = renderDecedent();
  else if (step === 'heirs') body = renderHeirs();
  else if (step === 'review') body = renderReview();
  else if (step === 'results') body = renderResults();
  stepContainer.innerHTML = body;
  restoreFocus(focusSnapshot);
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
  const action = target.dataset?.action;
  if (action === 'import') {
    const [file] = target.files || [];
    if (file) {
      void handlePayloadImport(file);
    }
    target.value = '';
    return;
  }

  const deceasedKey = target.dataset?.deceased;
  if (deceasedKey === 'sex') {
    let next = setDeceasedField(state, 'sex', target.value);
    next = normalizeSpouseCounts(next);
    setState(next, { render: false });
    const shouldRenderHeirs = state.step === 'heirs';
    renderStep(shouldRenderHeirs ? 'heirs' : state.step);
  }
}

function nextStep(direction) {
  const idx = STEP_ORDER.indexOf(state.step);
  const nextIdx = Math.min(Math.max(idx + direction, 0), STEP_ORDER.length - 1);
  return STEP_ORDER[nextIdx];
}

async function handleCalc() {
  setState(normalizeSpouseCounts(state), { render: false });
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
    let next = setLastResponse(state, result);
    next = setLastError(next, '');
    next = markStepReached(next, 'results');
    next = setStep(next, 'results');
    setState(next);
  } catch (err) {
    let next = setLastResponse(state, null);
    next = setLastError(next, err.message);
    next = markStepReached(next, 'review');
    next = setStep(next, 'review');
    setState(next);
  }
}

function canNavigateToStep(step) {
  const reached = normalizeReached(state.reached);
  const stepIdx = STEP_ORDER.indexOf(step);
  const currentIdx = STEP_ORDER.indexOf(state.step);
  if (stepIdx === -1) return false;
  if (!reached[step]) return false;
  if (validation.errors.length && stepIdx > currentIdx) return false;
  return true;
}

function goToStep(step, { viaStepper = false } = {}) {
  const safeStep = ensureStepValue(step);
  const currentIdx = STEP_ORDER.indexOf(state.step);
  const targetIdx = STEP_ORDER.indexOf(safeStep);
  if (viaStepper && !canNavigateToStep(safeStep)) return;
  if (validation.errors.length && targetIdx > currentIdx) return;
  let next = markStepReached(state, safeStep);
  next = setStep(next, safeStep);
  setState(next);
}

function onClick(event) {
  const target = event.target?.closest('button, [data-action], [data-step]');
  if (!target || (root && !root.contains(target))) return;
  const action = target.dataset?.action;
  const role = target.dataset?.role;
  const step = target.dataset?.step;

  if (step) {
    goToStep(step, { viaStepper: true });
    return;
  }

  if (action === 'next') {
    const next = nextStep(1);
    goToStep(next);
    return;
  }
  if (action === 'back') {
    const prev = nextStep(-1);
    goToStep(prev);
    return;
  }
  if (action === 'dl-payload') {
    const payload = buildPayload(state);
    exportJson('payload.json', payload);
    return;
  }
  if (action === 'dl-result') {
    exportJson('result.json', state.lastResponse);
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
    return;
  }
  if (action === 'new') {
    clearStorage();
    state = createInitialState();
    setState(state);
    return;
  }
  if (action === 'export') {
    exportJson('heritage_flow.json', { state, lastPayload: state.lastPayload, lastResponse: state.lastResponse });
    return;
  }
  if (action === 'import') {
    triggerStateImport();
    return;
  }
}

function importPayloadToState(payload) {
  const heirsCounts = {};
  if (Array.isArray(payload?.heirs)) {
    payload.heirs.forEach((entry) => {
      const role = entry?.role;
      const count = Number.parseInt(entry?.count, 10);
      if (!role || !Number.isFinite(count) || count <= 0) return;
      heirsCounts[role] = count;
    });
  }

  const estateValue = payload?.estate_value ?? payload?.amount ?? payload?.estateValue ?? '';
  return {
    estate: { value: estateValue != null ? String(estateValue) : '' },
    heirsCounts
  };
}

async function handlePayloadImport(file) {
  try {
    const content = await file.text();
    const parsed = JSON.parse(content);
    const { estate, heirsCounts } = importPayloadToState(parsed);
    let next = {
      ...state,
      estate,
      heirsCounts,
      lastPayload: parsed,
      lastResponse: null,
      lastError: ''
    };
    next = markStepReached(next, 'review');
    next = setStep(next, 'review');
    setState(next);
  } catch (err) {
    console.warn('No se pudo importar el payload', err);
    const next = setLastError(state, 'No se pudo importar el payload seleccionado');
    setState(next, { render: false });
    updateFooterAndErrors();
  }
}

function parseImportedState(obj) {
  if (!obj || typeof obj !== 'object' || typeof obj.state !== 'object') return null;
  let imported = withStateDefaults({ ...createInitialState(), ...obj.state });
  if (!imported.step) return null;
  imported.step = ensureStepValue(imported.step);
  imported.reached = normalizeReached(imported.reached);
  imported = markStepReached(imported, imported.step);
  return imported;
}

function triggerStateImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const [file] = input.files || [];
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      const importedState = parseImportedState(parsed);
      if (importedState && importedState.step) {
        setState(importedState, { render: false });
        renderStep(importedState.step);
      }
    } catch (err) {
      console.warn('No se pudo importar el estado', err);
    } finally {
      input.remove();
    }
  });
  document.body.appendChild(input);
  input.click();
}

function normalizeStateOnLoad(initial) {
  let next = withStateDefaults(initial || createInitialState());
  next = markStepReached(next, next.step);
  return next;
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
  state = normalizeStateOnLoad(loadState());
  validation = validateState(state, rolesCatalog);
  root.innerHTML = `
  <div class="flow__header">
    <div>
      <p class="eyebrow">Calculadora</p>
      <h2 style="margin:.25rem 0 0 0">Herencia islámica (MVP)</h2>
      <p class="muted" style="margin:.35rem 0 0 0">Introduce el causante, herederos y el valor de la herencia. El motor calcula fracciones e importes.</p>
    </div>
    <div class="flow__header-actions">
      <button type="button" class="btn" data-action="new">Nuevo caso</button>
      <button type="button" class="btn" data-action="export">Exportar JSON</button>
      <button type="button" class="btn" data-action="import">Importar JSON</button>
    </div>
  </div>

  <div class="card" style="margin-top: .9rem">
    <div class="errors" data-errors></div>
    <div class="warnings" data-warnings></div>
    <div class="error-banner" data-error-banner style="display:none"></div>
  </div>

  <nav class="flow__steps" aria-label="Pasos">
    <button type="button" data-step="decedent">1. Causante</button>
    <button type="button" data-step="heirs">2. Herederos</button>
    <button type="button" data-step="review">3. Revisión</button>
    <button type="button" data-step="results">4. Resultados</button>
  </nav>

  <div class="card" data-step-container></div>

  <div class="flow__footer">
    <div class="flow__footer-actions">
      <button type="button" class="btn" data-action="back">Atrás</button>
      <button type="button" class="btn primary" data-action="next">Siguiente</button>
      <button type="button" class="btn primary" data-action="calc">Calcular</button>
    </div>
  </div>
`;

  stepContainer = root.querySelector('[data-step-container]');
  errorsBox = root.querySelector('[data-errors]');
  warningsBox = root.querySelector('[data-warnings]');
  errorBanner = root.querySelector('[data-error-banner]');
  footer = root.querySelector('.flow__footer');

  root.addEventListener('input', onInput, true);
  root.addEventListener('change', onChange, true);
  root.addEventListener('click', onClick, true);

  renderStep(state.step);
  updateStepper();
  updateFooterAndErrors();
  void loadRolesCatalog();
}
