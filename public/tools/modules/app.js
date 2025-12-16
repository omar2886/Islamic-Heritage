import { uid } from './utils/id.js';
import { Person } from './core/person.js';
import { FamilyTree } from './core/family-tree.js';
import { BackendAdapter } from './adapter/backend-adapter.js';
import { SiblingsCreator } from './ui/siblings-creator.js';
import { StateManager } from './ui/state-manager.js';

const ENDPOINT = new URL('../tools/explain_smoke.php', location.href).href;

const $ = s => document.querySelector(s);
const show = (el, yes) => el.style.display = yes? '' : 'none';
function setBanner(msg, kind){ const el=$('#status'); el.textContent=msg||''; el.className='banner '+(kind||''); show(el,Boolean(msg)); }
function setAlerts(msg){ const el=$('#alerts'); el.textContent=msg||''; show(el,Boolean(msg)); }
function fracParse(s){ const [p,q]=(String(s||'0/1')).split('/').map(Number); return {p:p||0,q:q||1}; }
function gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){[a,b]=[b,a%b];} return a||1; }
function addF(a,b){ return {p:a.p*b.q + b.p*a.q, q:a.q*b.q}; }
function normF(f){ const g=gcd(f.p,f.q); return {p:f.p/g, q:f.q/g}; }
function badge(sum){ const el=$('#sumBadge'); if(!sum){ el.textContent='Σ — pendiente'; el.className='pill'; return; } const ok=sum.p===1&&sum.q===1; el.textContent= ok? 'Σ = 1/1 — OK' : `Σ = ${sum.p}/${sum.q}`; el.className='pill '+(ok?'ok':'fail'); }

const tree = new FamilyTree('male');

function optionsFor(select, items, {value='id', label='name', includeEmpty=false, emptyLabel='—'}={}){
  select.innerHTML = '';
  if (includeEmpty){ const o=document.createElement('option'); o.value=''; o.textContent=emptyLabel; select.appendChild(o); }
  for (const it of items){ const o=document.createElement('option'); o.value=it[value]; o.textContent=it[label] || it[value]; select.appendChild(o); }
}

function refreshQuickParents(){
  const persons = tree.listPersons().filter(p=>p.id!=='deceased');
  const males = persons.filter(p=>p.gender==='male');
  const females = persons.filter(p=>p.gender==='female');
  optionsFor($('#quickFather'), males, { includeEmpty:true });
  optionsFor($('#quickMother'), females, { includeEmpty:true });
  optionsFor($('#siblingsFather'), males, { includeEmpty:true, emptyLabel:'-- Sin padre --' });
  optionsFor($('#siblingsMother'), females, { includeEmpty:true, emptyLabel:'-- Sin madre --' });
}

function renderPairs(tblId, obj){
  const tb = document.querySelector(tblId); tb.innerHTML = '';
  for (const [k,v] of Object.entries(obj||{})){
    const tr=document.createElement('tr'); tr.innerHTML = `<td>${k}</td><td>${Array.isArray(v)? v.join(', '): String(v)}</td>`; tb.appendChild(tr);
  }
}
function renderSteps(steps){
  const tb = $('#tbl-steps'); tb.innerHTML='';
  (steps?.steps||[]).forEach((s,i)=>{
    const changes = s.changes ? Object.entries(s.changes).map(([r,c])=>`${r}: ${c.before}→${c.after}`).join(' | ') : '';
    const byP = s.byPerson ? Object.entries(s.byPerson).map(([r,ids])=>`${r}: [${ids.join(', ')}]`).join(' | ') : '';
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${s.stage||''}</td><td>${s.rule||''}</td><td>${s.note||''}</td><td>${changes}</td><td>${byP}</td>`;
    tb.appendChild(tr);
  });
}

async function postJSON(url, data){
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
  const txt = await res.text(); let payload=null; try{ payload=JSON.parse(txt);}catch(_){ }
  if (!res.ok || (payload && payload.ok===false)) {
    const msg = (payload && (payload.error||payload.message)) || `HTTP ${res.status} — ${txt.slice(0,200)}`;
    throw new Error(msg);
  }
  return payload || {};
}

function renderPersons(){
  const tb = $('#personsTbody'); tb.innerHTML='';
  const persons = tree.listPersons().filter(p=>p.id!=='deceased');
  const males = persons.filter(p=>p.gender==='male');
  const females = persons.filter(p=>p.gender==='female');

  for (const p of persons){
    const tr=document.createElement('tr');

    // NOMBRE
    const tdN=document.createElement('td'); 
    const inN=document.createElement('input'); inN.type='text'; inN.value=p.name||''; inN.addEventListener('change',()=>{p.name=inN.value;});
    tdN.appendChild(inN); tr.appendChild(tdN);

    // GÉNERO
    const tdG=document.createElement('td');
    const sG=document.createElement('select'); sG.innerHTML='<option value="male">male</option><option value="female">female</option>';
    sG.value=p.gender; sG.addEventListener('change',()=>{p.gender=sG.value; renderPersons();});
    tdG.appendChild(sG); tr.appendChild(tdG);

    // ESTADO
    const tdStatus=document.createElement('td'); tdStatus.className='person-status';
    tdStatus.innerHTML = p.alive ? '<span class="status-alive">✅ VIVO</span>' : '<span class="status-deceased">💀 FALLECIDO</span>';
    tr.appendChild(tdStatus);

    // ROL
    const tdR=document.createElement('td');
    const roles = ['', 'husband','wife','father','mother','paternal_grandfather','paternal_grandmother','maternal_grandfather','maternal_grandmother','son','daughter','sons_son','sons_daughter','full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister','paternal_uncle','paternal_uncle_son'];
    const sR=document.createElement('select'); sR.innerHTML = roles.map(r=>`<option value="${r}">${r||'(auto)'}</option>`).join('');
    sR.value=p.role||''; sR.addEventListener('change',()=>{ p.role = sR.value||null; });
    tdR.appendChild(sR); tr.appendChild(tdR);

    // PADRE
    const tdF=document.createElement('td'); const sF=document.createElement('select');
    optionsFor(sF, males, { includeEmpty:true });
    sF.value=p.parents.father||''; sF.addEventListener('change',()=>{ try{ tree.setParents(p.id, sF.value||null, p.parents.mother||null); }catch(e){ alert(e.message); } renderPersons(); });
    tdF.appendChild(sF); tr.appendChild(tdF);

    // MADRE
    const tdM=document.createElement('td'); const sM=document.createElement('select');
    optionsFor(sM, females, { includeEmpty:true });
    sM.value=p.parents.mother||''; sM.addEventListener('change',()=>{ try{ tree.setParents(p.id, p.parents.father||null, sM.value||null); }catch(e){ alert(e.message); } renderPersons(); });
    tdM.appendChild(sM); tr.appendChild(tdM);

    // ACCIONES
    const tdA=document.createElement('td'); tdA.className='right';
    const toggle=document.createElement('button'); toggle.className='secondary';
    toggle.textContent = p.alive ? 'Marcar Fallecido' : 'Marcar Vivo';
    toggle.addEventListener('click', ()=>{ StateManager.updatePersonState(p.id, !p.alive, tree); renderPersons(); });
    const del=document.createElement('button'); del.className='secondary'; del.textContent='Eliminar';
    del.addEventListener('click',()=>{ tree.persons.delete(p.id); renderPersons(); refreshQuickParents(); });
    tdA.appendChild(toggle); tdA.appendChild(del); tr.appendChild(tdA);

    // estado visual
    StateManager.renderPersonState(p, tr);
    tb.appendChild(tr);
  }
  refreshQuickParents();

  // Validación y avisos
  const v = tree.validate();
  const allMsgs = [...v.errors, ...v.warnings];
  setAlerts(allMsgs.join(' · '));
}

$('#deceasedGender').addEventListener('change', e=>{ tree.setDeceasedGender(e.target.value); renderPersons(); });
$('#addPerson').addEventListener('click', ()=>{
  try{
    const person = new Person({
      id: uid(),
      name: $('#pName').value.trim(),
      gender: $('#pGender').value,
      alive: $('#pAlive').checked,
      role: $('#pRole').value || null
    });
    tree.addPerson(person);
    $('#pName').value='';
    renderPersons();
  }catch(e){ alert(e.message); }
});
$('#quickAddChild').addEventListener('click', ()=>{
  const fatherId = $('#quickFather').value || null;
  const motherId = $('#quickMother').value || null;
  const gender = $('#quickChildGender').value;
  const role = (gender==='male') ? 'son' : 'daughter';
  const id = uid();
  try{
    tree.addPerson(new Person({ id, name:'', gender, alive:true, role }));
    tree.setParents(id, fatherId, motherId);
    renderPersons();
  }catch(e){ alert(e.message); }
});
$('#createSiblings').addEventListener('click', ()=>{
  const fatherId = $('#siblingsFather').value || null;
  const motherId = $('#siblingsMother').value || null;
  const type = $('#siblingsType').value;
  const maleCount = parseInt($('#siblingsMaleCount').value)||0;
  const femaleCount = parseInt($('#siblingsFemaleCount').value)||0;
  if (maleCount===0 && femaleCount===0) { alert('Debes especificar al menos un hermano o hermana'); return; }
  try{
    SiblingsCreator.createSiblingsGroup(tree, fatherId, motherId, type, maleCount, femaleCount);
    renderPersons();
  }catch(e){ alert(e.message); }
});
$('#clearAll').addEventListener('click', ()=>{ for (const [id] of tree.persons){ if (id!=='deceased') tree.persons.delete(id); } renderPersons(); });
$('#openLite').addEventListener('click', ()=>{ location.href = 'builder_lite.html'; });

function buildPayload() {
  const amtRaw = String($('#amount').value||'').trim();
  let amount = null;
  if (amtRaw!==''){ const n=Number(amtRaw); if(!Number.isFinite(n)||n<0){ throw new Error('Monto inválido (≥0) o déjalo vacío'); } amount = n; }
  const flags = []; if ($('#flagExplain').checked) flags.push('--explain'); if ($('#flagAudit').checked) flags.push('--audit');
  const applyBlocks = $('#applyUiBlocks').checked;
  return { payload: BackendAdapter.toLegacyPayload(tree, { amount, flags, applyBlocks }), applyBlocks };
}

function badgeFromShares(gs){
  let acc={p:0,q:1};
  for(const v of Object.values(gs||{})){ const f=fracParse(v); acc=normF(addF(acc,f)); }
  badge(acc);
}

$('#calc').addEventListener('click', async ()=>{
  setBanner('', ''); $('#curl').textContent=''; $('#engine').textContent='';
  try{
    const v = tree.validate(); if (!v.valid){ setBanner('Corrige los errores antes de calcular.', 'err'); return; }
    const { payload, applyBlocks } = buildPayload();

    document.querySelector('#curl').textContent = `curl -s -X POST -H 'Content-Type: application/json' --data '${JSON.stringify(payload)}' '${ENDPOINT}'`;

    const out = await postJSON(ENDPOINT, payload);
    const res = out.output || out || {};
    renderPairs('#tbl-gs', res.group_shares||{});
    renderPairs('#tbl-ind', res.individual_shares||{});
    renderSteps(res.explain||{});
    badgeFromShares(res.group_shares);
    const eng = (res?.meta?.engine_version)||out?.version||''; const rb=(res?.meta?.rulebook_sha256? res.meta.rulebook_sha256.slice(0,8):'');
    $('#engine').textContent = eng ? `engine=${eng}${rb? ' · rulebook='+rb:''}` : '';
    setBanner(applyBlocks ? 'OK — cálculo con bloqueos UI aplicados.' : 'OK — cálculo sin bloqueos UI.', 'ok');
    window.__lastPayload__ = { input: payload, output: res };
  }catch(e){
    setBanner('Error: '+e.message, 'err'); badge(null); window.__lastPayload__=null;
  }
});

$('#download').addEventListener('click', ()=>{
  const obj = window.__lastPayload__; if (!obj){ setBanner('No hay resultado para descargar.', 'err'); return; }
  const blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='inheritance_case.json'; a.click(); URL.revokeObjectURL(a.href);
});

// boot
function init() { renderPersons(); refreshQuickParents(); }
init();
