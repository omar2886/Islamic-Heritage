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

function toolsUrl(){
  if (typeof window === 'undefined') return 'tools/explain_smoke.php';
  const configured = window.__URLS__?.tools;
  if (configured) return configured;
  const publicBase = cleanBase(window.__PUBLIC_BASE__ || '');
  return publicBase ? `${publicBase}/tools/explain_smoke.php` : 'tools/explain_smoke.php';
}

function normalizeServer(data){
  const out = (data && typeof data==='object' && data.output) ? data.output : data || {};
  const warnings = out.warnings || data?.warnings || [];
  const errors   = out.errors   || data?.errors   || [];
  return { out, warnings, errors, raw: data };
}

function renderExplain(explain){
  if (!Array.isArray(explain) || explain.length===0) return null;
  const sect = el('section',{}, el('h3',{}, 'Explicación'));
  const ul = el('ul',{}, ...explain.map(ev=>{
    if (typeof ev === 'string') return el('li',{}, ev);
    const stage = ev?.stage || 'TRACE';
    const msg = ev?.message || JSON.stringify(ev);
    return el('li',{}, el('span',{class:'small muted'},`[${stage}] `), msg);
  }));
  sect.append(ul);
  return sect;
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

async function run(payload, root){
  const diag = el('section',{}, el('h3',{}, 'Diagnóstico'));
  const top = el('div',{}, el('p',{class:'muted small',id:'results-status',role:'status','aria-live':'polite'}, 'Enviando cálculo…'));
  root.append(top);

  let data;
  try{
    data = await postCalc(payload);
  }catch(e){
    root.innerHTML = '';
    const endpoint = toolsUrl();
    const curl = [
      'curl -s -X POST',
      `-H 'Content-Type: application/json'`,
      `--data '${JSON.stringify(payload).replace(/'/g,"'\\''")}'`,
      endpoint
    ].join(' ');
    const tools = el('div',{class:'actions'},
      copyButton('Copiar cURL', ()=>curl),
      copyButton('Copiar payload', ()=>JSON.stringify(payload,null,2))
    );
    tools.dataset.endpoint = endpoint;
    tools.dataset.curl = curl;
    root.append(
      banner('error','Error del servidor', [String(e.message || e)]),
      el('pre',{}, curl),
      tools,
      el('details',{}, el('summary',{},'Payload enviado'), el('pre',{}, JSON.stringify(payload,null,2)))
    );
    console.error(e);
    return;
  }

  const { out, warnings, errors, raw } = normalizeServer(data);
  root.innerHTML = '';

  const sum = el('div',{class:'muted small'},
    'Σ final: ', el('strong',{}, String(out.sum_final ?? '—')),
    (out.sum_fixed ? ` · Σ fijo: ${out.sum_fixed}` : ''),
    (out.residual_share ? ` · residual: ${out.residual_share}` : '')
  );
  root.append(sum);

  const blocks = [
    tableKV('Cuotas por grupo', out.group_shares, {k:'Rol', v:'Cuota'}),
    tableKV('Cuotas por individuo', out.individual_shares, {k:'Rol(i)', v:'Cuota'}),
    tableKV('Importes por rol', out.amounts_by_role, {k:'Rol', v:'Importe'}),
    tableKV('Importes por individuo', out.amounts_by_individual, {k:'Rol(i)', v:'Importe'}),
  ].filter(Boolean);
  blocks.forEach(b => root.append(b));

  if (warnings?.length) root.append(banner('warn','Avisos', warnings));
  if (errors?.length)   root.append(banner('error','Errores', errors));

  const exp = renderExplain(out.explain);
  if (exp) root.append(exp);

  const endpoint = toolsUrl();
  const curlOk = [
    'curl -s -X POST',
    `-H 'Content-Type: application/json'`,
    `--data '${JSON.stringify(payload).replace(/'/g,"'\\''")}'`,
    endpoint
  ].join(' ');

  const tools = el('div',{class:'actions'},
    downloadJsonLink('resultado.json', raw, 'Descargar resultado'),
    downloadJsonLink('payload_enviado.json', payload, 'Descargar payload'),
    copyButton('Copiar cURL', ()=>curlOk),
    copyButton('Copiar resultado', ()=>JSON.stringify(raw,null,2))
  );
  tools.dataset.endpoint = endpoint;
  tools.dataset.curl = curlOk;
  root.append(tools);
}

export async function mount(){
  const root = document.getElementById('results-root');
  root.innerHTML = '';
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
