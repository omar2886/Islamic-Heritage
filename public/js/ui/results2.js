import { el, banner, tableKV } from './components.js';
import { loadStoredPayloads } from '../storage.js';

const FETCH_TIMEOUT_MS = 8000;

function cleanBase(base){
  return base ? String(base).replace(/\/+$/, '') : '';
}

function appBase(){
  if (typeof window === 'undefined') return '';
  return cleanBase(window.__APP_BASE__ || '');
}

function calcUrl(){
  if (typeof window === 'undefined') return 'api/calc.php';
  const configured = window.__URLS__?.calc;
  if (configured) return configured;
  const publicBase = cleanBase(window.__PUBLIC_BASE__ || '');
  return publicBase ? `${publicBase}/api/calc.php` : 'api/calc.php';
}

function builderHref(){
  const base = appBase();
  const path = 'index.php?page=builder2';
  return base ? `${base}/${path}` : path;
}

function diagHref(){
  if (typeof window === 'undefined') return '?diag=1';
  const { pathname, search } = window.location;
  const hasQuery = search && search.length > 0;
  const glue = hasQuery ? '&' : '?';
  return `${pathname}${search}${glue}diag=1`;
}

async function fetchWithTimeout(payload){
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), FETCH_TIMEOUT_MS);
  try{
    const response = await fetch(calcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try{ json = JSON.parse(text); }catch{}
    return { response, json, text };
  }finally{
    clearTimeout(timeout);
  }
}

function renderEmpty(target){
  const warn = banner('warn','Sin payload', 'No se encontró ningún payload en sessionStorage ni en localStorage.');
  const back = el('a',{href:builderHref(), class:'btn'}, 'Volver al Constructor');
  target.replaceChildren(warn, back);
}

function renderSummary(out){
  const sect = el('section',{}, el('h2',{}, 'Resumen'));
  const items = [];
  if (out.sum_final!=null) items.push(el('div',{class:'summary-item'}, el('p',{class:'muted small'},'Σ final'), el('strong',{}, String(out.sum_final))));
  if (out.sum_fixed!=null) items.push(el('div',{class:'summary-item'}, el('p',{class:'muted small'},'Σ fijo'), el('strong',{}, String(out.sum_fixed))));
  if (out.residual_share!=null) items.push(el('div',{class:'summary-item'}, el('p',{class:'muted small'},'Residual'), el('strong',{}, String(out.residual_share))));
  const grid = el('div',{class:'summary-grid'}, items);
  sect.append(grid);
  return sect;
}

function renderShares(out){
  const blocks = [
    tableKV('Cuotas por grupo', out.group_shares, {k:'Grupo', v:'Cuota'}),
    tableKV('Cuotas por individuo', out.individual_shares, {k:'Rol(i)', v:'Cuota'})
  ].filter(Boolean);
  if (!blocks.length) return null;
  const sect = el('section',{}, el('h2',{}, 'Detalle de cuotas'));
  blocks.forEach(b=>sect.append(b));
  return sect;
}

function renderExplain(out){
  const traces = [];
  if (Array.isArray(out.traces)) traces.push(...out.traces);
  if (Array.isArray(out.explain)) traces.push(...out.explain);
  if (!traces.length) return null;
  const details = el('details',{class:'explain'}, el('summary',{}, 'Explicación'));
  traces.forEach(ev=>{
    const rule = ev?.rule_id || ev?.rule || ev?.id || '—';
    const reason = ev?.reason || ev?.message || ev?.explanation || JSON.stringify(ev);
    const delta = ev?.delta ?? ev?.value ?? ev?.change ?? '—';
    const row = el('p',{}, el('strong',{}, String(rule)), ': ', reason, ' (Δ ', String(delta), ')');
    details.append(row);
  });
  return details;
}

function renderHttpError(response, target){
  const diagLink = el('a',{href: diagHref()}, 'Ver diagnóstico (diag=1)');
  const message = [`HTTP ${response.status}`, diagLink];
  const alert = banner('error','Error al calcular', message);
  setTimeout(()=>{ try{ alert.focus(); }catch{} }, 0);
  target.replaceChildren(alert);
}

function renderUnexpectedError(error, target){
  const diagLink = el('a',{href: diagHref()}, 'Ver diagnóstico (diag=1)');
  const alert = banner('error','No se pudo calcular', [error, diagLink]);
  setTimeout(()=>{ try{ alert.focus(); }catch{} }, 0);
  target.replaceChildren(alert);
}

async function run(payload, target){
  const status = el('p',{class:'muted small', id:'results-status', role:'status','aria-live':'polite'}, 'Enviando cálculo…');
  target.append(status);
  let result;
  try{
    result = await fetchWithTimeout(payload);
  }catch(e){
    status.textContent = 'Error de red o timeout';
    renderUnexpectedError(e?.name === 'AbortError' ? 'El cálculo tardó demasiado (timeout 8s).' : (e?.message || String(e)), target);
    return;
  }

  const { response, json, text } = result;
  if (!response.ok){
    status.textContent = 'Error en cálculo';
    renderHttpError(response, target);
    return;
  }
  if (!json){
    status.textContent = 'Respuesta inesperada';
    renderUnexpectedError(`Respuesta no-JSON (${response.status}): ${text}`, target);
    return;
  }

  const out = json.output || json || {};
  status.textContent = 'Cálculo listo';
  target.replaceChildren(status);

  const summary = renderSummary(out);
  if (summary) target.append(summary);

  const shares = renderShares(out);
  if (shares) target.append(shares);

  const explain = renderExplain(out);
  if (explain) target.append(explain);
}

export async function mount(){
  const root = document.getElementById('results-root');
  root.replaceChildren();
  const content = el('div',{class:'results-body'});
  root.append(content);

  const { payload } = loadStoredPayloads();
  if (!payload){
    renderEmpty(content);
    return;
  }

  await run(payload, content);
  try{ root.focus(); }catch{}
}
