// results.js — POST al backend y render con utilidades de copia
import { postCalc } from '../api.js';
import { el, banner, tableKV, downloadJsonLink } from './components.js';

function cleanBase(base){
  return base ? String(base).replace(/\/+$, '') : '';
}

function appBase(){
  if (typeof window === 'undefined') return '';
  return cleanBase(window.__APP_BASE__ || '');
}

function builderHref(){
  const base = appBase();
  const path = 'index.php?page=builder';
  return base ? `${base}/${path}` : path;
}

function calcUrl(){
  if (typeof window === 'undefined') return 'api/calc.php';
  const configured = window.__URLS__?.calc;
  if (configured) return configured;
  const publicBase = cleanBase(window.__PUBLIC_BASE__ || '');
  return publicBase ? `${publicBase}/api/calc.php` : 'api/calc.php';
}

function normalizeServer(data){
  const out = (data && typeof data==='object' && data.output) ? data.output : data || {};
  const warnings = out.warnings || data?.warnings || [];
  const errors   = out.errors   || data?.errors   || [];
  return { out, warnings, errors, raw: data };
}

function makeCurl(payload){
  const endpoint = calcUrl();
  return [
    'curl -s -X POST',
    `-H 'Content-Type: application/json'`,
    `--data '${JSON.stringify(payload).replace(/'/g,"'\\''")}'`,
    endpoint
  ].join(' ');
}

async function copy(text){
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
function copyButton(label, getText){
  const b = el('button',{type:'button',class:'btn-ghost'}, label);
  b.addEventListener('click', async ()=>{
    const ok = await copy(getText());
    b.textContent = ok ? 'Copiado ✓' : 'No se pudo copiar';
    setTimeout(()=>{ b.textContent = label; }, 1200);
  });
  return b;
}

function renderSummary(out){
  const hasGroupShares = out.group_shares && Object.keys(out.group_shares).length>0;
  const sect = el('section',{class:'summary'}, el('h2',{}, 'Resumen'));
  const metricsItems = [
    el('div',{class:'summary-item'}, el('p',{class:'muted small'},'Σ final'), el('strong',{}, String(out.sum_final ?? '—'))),
    out.sum_fixed!=null ? el('div',{class:'summary-item'}, el('p',{class:'muted small'},'Σ fijo'), el('strong',{}, String(out.sum_fixed))) : null,
    out.residual_share!=null ? el('div',{class:'summary-item'}, el('p',{class:'muted small'},'Residual'), el('strong',{}, String(out.residual_share))) : null
  ].filter(Boolean);
  const metrics = el('div',{class:'summary-grid'}, metricsItems);
  sect.append(metrics);
  if (hasGroupShares){
    const tbl = el('table',{class:'compact'}, el('thead',{}, el('tr',{}, el('th',{},'Grupo'), el('th',{},'Cuota'))), el('tbody',{}));
    Object.entries(out.group_shares).forEach(([k,v])=>{
      tbl.querySelector('tbody').append(el('tr',{}, el('td',{}, el('code',{}, k)), el('td',{}, String(v))));
    });
    sect.append(el('div',{class:'summary-table'}, tbl));
  }
  return sect;
}

function renderSharesTables(out){
  const blocks = [
    tableKV('Cuotas por grupo', out.group_shares, {k:'Rol', v:'Cuota'}),
    tableKV('Cuotas por individuo', out.individual_shares, {k:'Rol(i)', v:'Cuota'}),
    tableKV('Importes por rol', out.amounts_by_role, {k:'Rol', v:'Importe'}),
    tableKV('Importes por individuo', out.amounts_by_individual, {k:'Rol(i)', v:'Importe'}),
  ].filter(Boolean);
  if (!blocks.length) return null;
  const sect = el('section',{}, el('h2',{}, 'Detalle de cuotas'));
  blocks.forEach(b=>sect.append(b));
  return sect;
}

function renderTraces(out){
  const traces = [];
  if (Array.isArray(out.traces)) traces.push(...out.traces);
  if (Array.isArray(out.explain)) traces.push(...out.explain);
  if (!traces.length) return null;

  const grouped = traces.reduce((acc, ev)=>{
    const phase = ev?.phase || ev?.stage || 'General';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(ev);
    return acc;
  },{});

  const details = el('details',{class:'explain'}, el('summary',{}, 'Explicación'));
  Object.entries(grouped).forEach(([phase, items])=>{
    const tbl = el('table',{class:'compact'}, el('thead',{}, el('tr',{}, el('th',{},'Regla'), el('th',{},'Razón'), el('th',{},'Δ'))), el('tbody',{}));
    items.forEach(ev=>{
      const rule = ev?.rule_id || ev?.rule || ev?.id || '—';
      const reason = ev?.reason || ev?.message || ev?.explanation || JSON.stringify(ev);
      const delta = ev?.delta ?? ev?.value ?? ev?.change ?? '—';
      tbl.querySelector('tbody').append(el('tr',{}, el('td',{}, String(rule)), el('td',{}, String(reason)), el('td',{}, String(delta))));
    });
    const phaseBlock = el('section',{}, el('h3',{}, phase), tbl);
    details.append(phaseBlock);
  });
  return details;
}

function renderError(message, payload){
  const curl = makeCurl(payload);
  const alert = banner('error','No se pudo calcular', [message]);
  const tools = el('div',{class:'actions'},
    copyButton('Copiar cURL', ()=>curl),
    downloadJsonLink('payload_enviado.json', payload, 'Descargar payload')
  );
  setTimeout(()=>{ try{ alert.focus(); }catch{} }, 0);
  return el('div',{}, alert, tools);
}

async function run(payload, root){
  const status = el('p',{class:'muted small',id:'results-status',role:'status','aria-live':'polite'}, 'Enviando cálculo…');
  root.append(status);

  let data;
  try{
    data = await postCalc(payload, { meta: true });
  }catch(e){
    status.textContent = 'Error en cálculo';
    root.replaceChildren(status);
    root.append(renderError(String(e.message || e), payload));
    return;
  }

  const { status: httpStatus, ok: httpOk, json, text } = data;
  const hasJson = json && typeof json==='object';
  if (!httpOk || (hasJson && json.ok===false)){
    status.textContent = 'Error en cálculo';
    root.replaceChildren(status);
    const message = hasJson ? (json.error || 'El cálculo devolvió un error.') : `HTTP ${httpStatus}`;
    root.append(renderError(message, payload));
    return;
  }
  if (!hasJson){
    status.textContent = 'Error en cálculo';
    root.replaceChildren(status);
    root.append(renderError(`Respuesta inesperada (${httpStatus}): ${text}`, payload));
    return;
  }

  const { out, warnings, errors, raw } = normalizeServer(json);
  status.textContent = 'Cálculo listo';
  root.replaceChildren(status);

  const summary = renderSummary(out);
  if (summary) root.append(summary);

  const shares = renderSharesTables(out);
  if (shares) root.append(shares);

  if (warnings?.length) root.append(banner('warn','Avisos', warnings));
  if (errors?.length)   root.append(banner('error','Errores', errors));

  const traces = renderTraces(out);
  if (traces) root.append(traces);

  const curlOk = makeCurl(payload);
  const tools = el('div',{class:'actions'},
    downloadJsonLink('resultado.json', raw, 'Descargar resultado'),
    downloadJsonLink('payload_enviado.json', payload, 'Descargar payload'),
    copyButton('Copiar cURL', ()=>curlOk),
    copyButton('Copiar resultado', ()=>JSON.stringify(raw,null,2))
  );
  tools.dataset.curl = curlOk;
  root.append(tools);
}

export async function mount(){
  const root = document.getElementById('results-root');
  root.replaceChildren();
  let payload = null;
  try { payload = JSON.parse(sessionStorage.getItem('heritage_payload') || 'null'); } catch { payload = null; }

  if (!payload || !payload.heirs){
    root.append(
      banner('warn','Sin payload','No se encontró ningún payload en sessionStorage (heritage_payload). Vuelve al Constructor.'),
      el('p',{}, el('a',{href:builderHref(), class:'btn'}, 'Ir al Constructor'))
    );
    return;
  }
  await run(payload, root);
  try{ root.focus(); }catch{}
}
