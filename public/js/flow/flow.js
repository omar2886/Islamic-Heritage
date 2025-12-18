import {
  setDeceased,
  setStep,
  setLastResult,
  setLastResultRaw,
  addHeir,
  updateHeir,
  removeHeir,
  setLastPayload,
  setEstateValue,
} from './state.js';
import { loadState, saveState } from './storage.js';
import { loadRoles } from './roles.js';
import { validateState } from './validate.js';
import { buildPayload } from './payload.js';
import { exportJson } from './export.js';

const STEP_ORDER = ['decedent', 'heirs', 'review', 'results'];
const LABELS = {
  decedent: 'Causante',
  heirs: 'Familia / Herederos',
  review: 'Revisión',
  results: 'Resultados',
};

let state = syncWithUrl(loadState());
let roles = [];
let validation = { errors: [], warnings: [] };
let isLoadingRoles = false;
let rolesError = null;
let isCalculating = false;
let calcError = null;
const DEFAULT_CALC_URL = 'api/calc.php';

const root = document.getElementById('flow-root');
const nav = document.querySelector('.flow__steps');
const footerActions = document.querySelector('.flow__footer-actions');

if (!root) {
  throw new Error('flow-root missing');
}

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

function joinUrl(base, path) {
  const cleanBase = base ? String(base).replace(/\/+$/, '') : '';
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return cleanBase ? `${cleanBase}/${cleanPath}` : cleanPath;
}

function getCalcUrl() {
  const fromConfig = window.__URLS__?.calc;
  const publicBase = window.__PUBLIC_BASE__ || '';
  if (fromConfig) return fromConfig;
  return joinUrl(publicBase, DEFAULT_CALC_URL);
}

function stepFromIndex(index) {
  return STEP_ORDER[Math.min(Math.max(index, 0), STEP_ORDER.length - 1)];
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
    roles = await loadRoles();
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
    btn.disabled = btn.dataset.step === 'results' && !state.lastResult;
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
    next.textContent = state.step === 'review' ? 'Calcular' : state.step === 'results' ? 'Finalizado' : 'Siguiente';
    next.disabled =
      state.step === 'results' ||
      isCalculating ||
      (validation.errors.length > 0 && (state.step === 'heirs' || state.step === 'review' || state.step === 'decedent'));
  }

  if (recalc) {
    recalc.classList.toggle('is-hidden', state.step !== 'results');
    recalc.disabled = isCalculating || (!state.lastResult && !state.lastPayload);
  }
}

function renderDecedent() {
  const { deceased, estate } = state;
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
            ${renderOptions(
              [
                { value: 'M', label: 'Masculino' },
                { value: 'F', label: 'Femenino' },
              ],
              deceased.sex,
            )}
          </select>
        </label>
        <label class="field">
          <span>Madhhab</span>
          <input type="text" name="deceased-madhhab" data-deceased-field="madhhab" value="${escapeHtml(deceased.madhhab)}" placeholder="Escuela fiqh" />
        </label>
        <label class="field">
          <span>Montante de la herencia</span>
          <input type="number" step="0.01" min="0" inputmode="decimal" name="estate-value" data-estate-field="value" value="${escapeHtml(
            estate?.value || '',
          )}" placeholder="Ej: 100000" />
        </label>
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
  const hasRoles = roles.length > 0;
  const roleStatus = rolesError
    ? `<p class="text-error">${escapeHtml(rolesError)}</p>`
    : isLoadingRoles
    ? '<p class="muted">Cargando catálogo de roles…</p>'
    : hasRoles
    ? ''
    : '<p class="muted">Catálogo de roles vacío.</p>';

  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Paso 2</p>
          <h2>${LABELS.heirs}</h2>
          <p class="muted">Agrega herederos uno a uno y manténlos sincronizados con el caso.</p>
        </div>
        <div class="inline-actions">
          <button type="button" class="btn btn-primary" data-action="add-heir" ${isLoadingRoles ? 'disabled' : ''}>Añadir heredero</button>
          <button type="button" class="btn btn-ghost" data-action="reload-roles" ${isLoadingRoles ? 'disabled' : ''}>Recargar roles</button>
        </div>
      </div>
      ${roleStatus}
      ${renderHeirTable()}
      ${renderValidationMessages(['heirs'])}
    </section>
  `;
}

function renderHeirTable() {
  if (!state.heirs.length) {
    return '<p class="empty">Aún no hay herederos añadidos.</p>';
  }

  return `
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Sexo</th>
            <th>Rol</th>
            <th>Vivo</th>
            <th>Count</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.heirs.map(renderHeirRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderHeirRow(heir) {
  return `
    <tr data-heir-id="${escapeHtml(heir.id)}">
      <td>
        <input type="text" class="input" data-heir-field="name" data-heir-id="${escapeHtml(heir.id)}" value="${escapeHtml(heir.name)}" placeholder="Ej: Fatima" />
      </td>
      <td>
        <select data-heir-field="sex" data-heir-id="${escapeHtml(heir.id)}">
          ${renderOptions(
            [
              { value: 'M', label: 'Masculino' },
              { value: 'F', label: 'Femenino' },
            ],
            heir.sex,
          )}
        </select>
      </td>
      <td>
        ${renderRoleSelect(heir)}
      </td>
      <td class="text-center">
        <label class="field field--inline">
          <input type="checkbox" data-heir-field="alive" data-heir-id="${escapeHtml(heir.id)}" ${heir.alive ? 'checked' : ''} />
          <span>Vivo</span>
        </label>
      </td>
      <td>
        <input type="number" min="1" max="20" step="1" data-heir-field="count" data-heir-id="${escapeHtml(heir.id)}" value="${escapeHtml(String(heir.count))}" />
      </td>
      <td>
        <button type="button" class="btn btn-ghost" data-remove-heir="${escapeHtml(heir.id)}">Eliminar</button>
      </td>
    </tr>
  `;
}

function renderRoleSelect(heir) {
  if (!roles.length) {
    return `<input type="text" data-heir-field="role" data-heir-id="${escapeHtml(heir.id)}" value="${escapeHtml(heir.role)}" placeholder="Rol" />`;
  }
  const opts = roles
    .map((role) => `<option value="${escapeHtml(role.code)}" ${role.code === heir.role ? 'selected' : ''}>${escapeHtml(role.label)}</option>`)
    .join('');
  return `<select data-heir-field="role" data-heir-id="${escapeHtml(heir.id)}">${opts}</select>`;
}

function renderReview() {
  let previewPayload = {};
  try {
    previewPayload = buildPayload(state);
  } catch (error) {
    previewPayload = { error: error instanceof Error ? error.message : 'Payload inválido', estate_value: state?.estate?.value || '' };
  }
  const pretty = JSON.stringify(previewPayload, null, 2);
  const heirsCount = Array.isArray(state.heirs) ? state.heirs.reduce((acc, heir) => acc + (Number(heir.count) || 0), 0) : 0;
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Paso 3</p>
          <h2>${LABELS.review}</h2>
          <p class="muted">Repasa la información antes de calcular.</p>
        </div>
        <div class="inline-actions">
          <button type="button" class="btn btn-primary" data-action="calc" ${validation.errors.length ? 'disabled' : ''}>Calcular</button>
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
          <p><strong>${heirsCount}</strong> persona(s) declarada(s)</p>
          <p class="muted">${state.heirs.length} registro(s)</p>
        </div>
        <div class="summary-item">
          <p class="eyebrow">Montante</p>
          <p><strong>${escapeHtml(state.estate?.value || '—')}</strong></p>
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
      ${calcError ? `<p class="text-error">${escapeHtml(calcError)}</p>` : ''}
    </section>
  `;
}

function getOutputData() {
  const raw = state.lastResultRaw?.json;
  if (raw && typeof raw === 'object') {
    if (raw.output !== undefined) return raw.output;
    if (raw.result !== undefined) return raw.result;
    if (raw.results !== undefined) return raw.results;
  }
  return state.lastResult || raw || null;
}

function mapShareEntry(entry, index) {
  const item = entry && typeof entry === 'object' ? entry : { value: entry };
  const label = item.name || item.role || item.heir || item.label || `Entrada ${index + 1}`;
  const share = item.fraction ?? item.share ?? item.percent ?? item.percentage ?? item.part ?? item.value ?? '';
  const amount = item.amount ?? item.total ?? item.quantity ?? item.value_amount ?? item.amount_value ?? item.money ?? item.value;
  return { label, share, amount };
}

function normalizeDistribution(output) {
  if (!output || typeof output !== 'object') return { rows: [], mapped: false };

  let rows = [];
  let mapped = false;

  if (Array.isArray(output.shares)) {
    rows = output.shares.map(mapShareEntry);
    mapped = true;
  } else if (Array.isArray(output.distribution)) {
    rows = output.distribution.map(mapShareEntry);
    mapped = true;
  } else if (output.result && typeof output.result === 'object' && !Array.isArray(output.result)) {
    rows = Object.entries(output.result).map(([label, value]) => {
      const share = value && typeof value === 'object' ? value.share ?? value.fraction ?? value.part ?? value.percent ?? value : value;
      const amount = value && typeof value === 'object' ? value.amount ?? value.value ?? value.total : undefined;
      return { label, share, amount };
    });
    mapped = true;
  } else {
    const personShares = output?.person_shares || output?.individual_shares || {};
    const roleShares = output?.group_shares || output?.shares || {};
    const personAmounts = output?.person_amounts || {};
    const roleAmounts = output?.group_amounts || output?.amounts || {};

    const rowsFromHeirs = (state.heirs || []).map((heir, index) => {
      const label = `${heir.name || 'Sin nombre'}${heir.role ? ` (${heir.role})` : ''}`;
      const share = personShares[heir.name] ?? personShares[heir.role] ?? roleShares[heir.role] ?? '';
      const amount = personAmounts[heir.name] ?? personAmounts[heir.role] ?? roleAmounts[heir.role] ?? '';
      return { key: heir.id || `heir-${index}`, label, share, amount };
    });

    const extraEntries = Object.entries(personShares).filter(([label]) => !rowsFromHeirs.find((row) => row.label === label));

    rows = [
      ...rowsFromHeirs,
      ...extraEntries.map(([label, share], idx) => ({
        key: `extra-${idx}`,
        label,
        share,
        amount: personAmounts[label] ?? roleAmounts[label] ?? '',
      })),
    ].filter((row) => row.share || row.amount || row.label);

    mapped = rows.length > 0 || Object.keys(personShares).length > 0 || Object.keys(roleShares).length > 0;
  }

  return { rows, mapped };
}

function renderResults() {
  const hasResult = Boolean(state.lastResult || state.lastResultRaw);
  const output = getOutputData();
  const distributionInfo = normalizeDistribution(output);
  const hasStructured = distributionInfo.mapped;
  const waiting = !hasResult && state.lastPayload ? '<p class="muted">Recalculando con el último payload…</p>' : '';
  const canExport = hasResult || state.lastPayload;

  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Paso 4</p>
          <h2>${LABELS.results}</h2>
          <p class="muted">Consulta y comparte el resultado del cálculo.</p>
        </div>
        <div class="inline-actions">
          <button type="button" class="btn" data-action="edit-case">Editar caso</button>
          <button type="button" class="btn" data-action="export-json" ${canExport ? '' : 'disabled'}>Exportar JSON</button>
          <button type="button" class="btn" data-action="calc" ${isCalculating ? 'disabled' : ''}>Recalcular</button>
        </div>
      </div>
      ${hasResult ? renderResultLayout(output, distributionInfo) : `<p class="empty">Recalcula para obtener resultados actualizados.</p>${waiting}`}
      ${renderResultMessages(output)}
      ${!hasStructured ? renderRawResult(state.lastResultRaw) : ''}
    </section>
  `;
}

function renderResultLayout(result, distributionInfo) {
  const summary = renderResultSummary(result);
  const distribution = renderDistribution(distributionInfo);
  const justification = renderJustification(result);

  return `
    <div class="result-stack">
      ${summary}
      ${distribution}
      ${justification}
    </div>
  `;
}

function renderResultSummary(result) {
  const meta = result?.meta || {};
  const heirsCount = Array.isArray(state.heirs) ? state.heirs.reduce((acc, h) => acc + (h?.count || 0), 0) : 0;
  const timestamp =
    result?.updatedAt || meta?.generated_at || meta?.generatedAt || meta?.timestamp || new Date().toISOString();
  const note = result?.note || meta?.note || 'Resultado de cálculo';
  const amount =
    result?.estate_value ||
    meta?.estate_value ||
    meta?.amount ||
    meta?.estateValue ||
    state?.estate?.value ||
    undefined;

  return `
    <section class="result-block">
      <div class="result-block__head">
        <h3>Resumen</h3>
        <span class="badge">${escapeHtml(note)}</span>
      </div>
      <div class="summary-grid results-summary">
        <div class="summary-item">
          <p class="muted small">Causante</p>
          <strong>${escapeHtml(state.deceased.name || 'Sin nombre')}</strong>
          <p class="muted">${escapeHtml(state.deceased.madhhab || 'Sin madhhab')}</p>
        </div>
        <div class="summary-item">
          <p class="muted small">Nº herederos</p>
          <strong>${heirsCount}</strong>
          <p class="muted">Registros activos</p>
        </div>
        <div class="summary-item">
          <p class="muted small">Timestamp</p>
          <strong>${escapeHtml(String(timestamp))}</strong>
          <p class="muted">Última actualización</p>
        </div>
        <div class="summary-item">
          <p class="muted small">Importe (si aplica)</p>
          <strong>${amount !== undefined ? escapeHtml(String(amount)) : '—'}</strong>
          <p class="muted">Valor declarado</p>
        </div>
      </div>
    </section>
  `;
}

function renderDistribution(distributionInfo) {
  const rows = distributionInfo?.rows || [];

  const body = rows.length
    ? rows
        .map(
          (row, idx) => `
            <tr>
              <td>${escapeHtml(row.label || `Entrada ${idx + 1}`)}</td>
              <td>${row.share !== '' && row.share !== undefined ? escapeHtml(String(row.share)) : '<span class="muted">—</span>'}</td>
              <td>${row.amount !== '' && row.amount !== undefined ? escapeHtml(String(row.amount)) : '<span class="muted">—</span>'}</td>
            </tr>
          `,
        )
        .join('')
    : `<tr><td colspan="3"><p class="empty">Sin reparto disponible.</p></td></tr>`;

  return `
    <section class="result-block">
      <div class="result-block__head">
        <h3>Reparto</h3>
        <p class="muted">Fracciones y montos calculados para cada heredero.</p>
      </div>
      <div class="table-responsive">
        <table class="table result-table">
          <thead>
            <tr><th>Heredero</th><th>Fracción / %</th><th>Importe</th></tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderResultMessages(result) {
  const errors = [];
  const warnings = [];

  if (calcError) errors.push(calcError);
  if (result?.error) errors.push(String(result.error));
  if (Array.isArray(result?.errors)) {
    result.errors.forEach((err) => errors.push(String(err)));
  }
  if (result?.warning) warnings.push(String(result.warning));
  if (Array.isArray(result?.warnings)) {
    result.warnings.forEach((warn) => warnings.push(String(warn)));
  }

  const hasMessages = errors.length || warnings.length;
  const errorList = errors.length
    ? `<div class="alert alert-error"><ul>${errors.map((msg) => `<li>${escapeHtml(msg)}</li>`).join('')}</ul></div>`
    : '';
  const warningList = warnings.length
    ? `<div class="alert alert-warning"><ul>${warnings.map((msg) => `<li>${escapeHtml(msg)}</li>`).join('')}</ul></div>`
    : '';

  return `
    <section class="result-block">
      <div class="result-block__head">
        <h3>Errores/avisos</h3>
      </div>
      ${
        hasMessages
          ? `<div class="stack">${errorList}${warningList}</div>`
          : '<p class="muted">Sin errores o avisos reportados.</p>'
      }
    </section>
  `;
}

function renderRawResult(raw) {
  if (!raw) return '';
  const pretty = raw.json ? JSON.stringify(raw.json, null, 2) : raw.text;
  const snippet = raw.text && raw.text.length > 0 ? raw.text.slice(0, 200) : '';

  return `
    <section class="result-block">
      <div class="result-block__head">
        <h3>Resultado crudo</h3>
      </div>
      <p class="muted">No se pudo mapear el resultado. Adjuntamos la respuesta para depurar.</p>
      ${snippet ? `<p class="small">HTTP ${escapeHtml(String(raw.status || ''))}: ${escapeHtml(snippet)}</p>` : ''}
      <details class="prose" open>
        <summary>Ver respuesta</summary>
        <pre class="code-block">${escapeHtml(pretty || 'Respuesta vacía')}</pre>
      </details>
      <div class="inline-actions">
        <button type="button" class="btn" data-action="download-raw">Descargar respuesta</button>
      </div>
    </section>
  `;
}

function normalizeExplanationEntries(result) {
  const entries = [];
  const traces = Array.isArray(result?.traces) ? result.traces : [];
  const explainArr = Array.isArray(result?.explain) ? result.explain : result?.explain ? [result.explain] : [];
  const explanationArr = Array.isArray(result?.explanation)
    ? result.explanation
    : result?.explanation
    ? [result.explanation]
    : [];
  const notesArr = Array.isArray(result?.notes) ? result.notes : result?.notes ? [result.notes] : [];

  [...traces, ...explainArr, ...explanationArr, ...notesArr].forEach((item) => {
    if (!item) return;
    if (typeof item === 'string') {
      entries.push({ title: 'Regla aplicada', detail: item });
      return;
    }
    if (typeof item === 'object') {
      const title = item.rule_id || item.rule || item.phase || item.stage || 'Regla aplicada';
      const detail = item.reason || item.message || item.explanation || item.delta || JSON.stringify(item);
      entries.push({ title, detail: String(detail) });
    }
  });

  return entries;
}

function renderJustification(result) {
  const entries = normalizeExplanationEntries(result);

  if (!entries.length) {
    return `
      <section class="result-block">
        <div class="result-block__head">
          <h3>Justificación</h3>
        </div>
        <p class="empty">Sin explicaciones registradas.</p>
      </section>
    `;
  }

  const items = entries
    .map(
      (entry, index) => `
        <details class="explain" ${index === 0 ? 'open' : ''}>
          <summary>${escapeHtml(entry.title)}</summary>
          <div class="prose">
            <p>${escapeHtml(entry.detail)}</p>
          </div>
        </details>
      `,
    )
    .join('');

  return `
    <section class="result-block">
      <div class="result-block__head">
        <h3>Justificación</h3>
        <p class="muted">Revisa las reglas aplicadas durante el cálculo.</p>
      </div>
      <div class="stack">${items}</div>
    </section>
  `;
}

function renderValidationMessages() {
  const { errors, warnings } = validation;
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
      triggerCalc();
      return;
    }
    if (validation.errors.length && (state.step === 'heirs' || state.step === 'decedent')) {
      render();
      return;
    }
    goToStep(nextStep(1));
  }
  if (target.dataset.action === 'recalc') {
    triggerCalc(state.lastPayload || null);
  }
}

function handleDecedentInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const estateField = target.dataset.estateField;
  if (estateField) {
    const value = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
      ? target.value
      : '';
    persist(setEstateValue(state, value));
    return;
  }
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
  const value = target instanceof HTMLInputElement || target instanceof HTMLSelectElement ? parseHeirValue(target) : target.textContent;
  persist(updateHeir(state, heirId, { [field]: value }));
}

function handleHeirRemoval(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const heirId = target.dataset.removeHeir;
  if (!heirId) return;
  persist(removeHeir(state, heirId));
}

function handleRootClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action === 'add-heir') {
    persist(addHeir(state, {}));
  }
  if (target.dataset.action === 'reload-roles') {
    ensureRoles(true);
  }
  if (target.dataset.action === 'calc') {
    triggerCalc();
  }
  if (target.dataset.action === 'edit-case') {
    goToStep('heirs');
  }
  if (target.dataset.action === 'export-json') {
    let payload = null;
    try {
      payload = state.lastPayload || buildPayload(state);
    } catch (error) {
      calcError = error instanceof Error ? error.message : 'No se pudo construir el payload para exportar.';
      render();
      return;
    }
    const data = { state, payload, result: state.lastResult, raw: state.lastResultRaw };
    exportJson('heritage_result.json', data);
  }
  if (target.dataset.action === 'download-raw') {
    if (state.lastResultRaw) {
      exportJson('calc_raw_response.json', state.lastResultRaw);
    }
  }
  if (target.dataset.removeHeir) {
    handleHeirRemoval(event);
  }
}

async function runCalc(payload) {
  const url = getCalcUrl();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (error) {
    // se maneja más abajo
  }
  return { status: response.status, ok: response.ok, json, text };
}

async function triggerCalc(payloadOverride = null) {
  validation = validateState(state, roles);
  if (validation.errors.length) {
    render();
    return;
  }
  isCalculating = true;
  calcError = null;
  let payload = null;
  try {
    payload = payloadOverride || buildPayload(state);
  } catch (error) {
    calcError = error instanceof Error ? error.message : 'No se pudo construir el payload.';
    isCalculating = false;
    render();
    return;
  }
  persist(setLastPayload(state, payload));
  try {
    const response = await runCalc(payload);
    persist(setLastResultRaw(state, response));
    if (!response.json) {
      calcError = `Respuesta no-JSON (${response.status}). ${response.text.slice(0, 200)}`;
      persist(setStep(setLastPayload(state, payload), 'results'));
      return;
    }

    if (response.json.ok !== true && response.json.output === undefined) {
      const msg = response.json.error || response.text || 'Cálculo fallido.';
      calcError = `${msg} (${response.status})`;
      persist(setStep(setLastPayload(state, payload), 'results'));
      return;
    }

    const output = response.json.output ?? response.json.result ?? response.json.results ?? response.json;
    const withResult = setLastResult(state, output);
    const withRaw = setLastResultRaw(withResult, response);
    const withPayload = setLastPayload(withRaw, payload);
    persist(setStep(withPayload, 'results'));
  } catch (error) {
    calcError = error instanceof Error ? error.message : 'No se pudo calcular.';
    persist(setLastPayload(state, payload));
  } finally {
    isCalculating = false;
    render();
  }
}

function maybeAutoRecalc() {
  if (state.step !== 'results') return;
  if (state.lastResult || !state.lastPayload || isCalculating || calcError) return;
  triggerCalc(state.lastPayload);
}

function bindEvents() {
  nav?.addEventListener('click', handleNavClick);
  footerActions?.addEventListener('click', handleFooterClick);
  root?.addEventListener('input', handleDecedentInput);
  root?.addEventListener('change', handleDecedentInput);
  root?.addEventListener('input', handleHeirChange);
  root?.addEventListener('change', handleHeirChange);
  root?.addEventListener('click', handleRootClick);
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
