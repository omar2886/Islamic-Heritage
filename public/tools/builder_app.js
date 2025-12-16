import { FamilyTree } from './modules/core/family-tree.js';
import { Person } from './modules/core/person.js';
import { RoleDetector } from './modules/engine/relationship-engine.js';
import { SiblingsCreator } from './modules/ui/siblings-creator.js';

const $ = sel => document.querySelector(sel);

const CANONICAL_ROLES = [
  'husband','wife',
  'father','mother',
  'son','daughter',
  'paternal_grandfather','paternal_grandmother',
  'maternal_grandfather','maternal_grandmother',
  'full_brother','full_sister',
  'consanguine_brother','consanguine_sister',
  'uterine_brother','uterine_sister',
  'sons_son','sons_daughter',
  'paternal_uncle','paternal_aunt',
  'paternal_uncle_son','paternal_uncle_daughter'
];

const UNIQUE_ROLES = new Set([
  'father',
  'mother',
  'paternal_grandfather',
  'paternal_grandmother',
  'maternal_grandfather',
  'maternal_grandmother'
]);

const tree = new FamilyTree('male');
const treeSharingState = { include:false, confirmed:false };

function parseAmountInput() {
  const amountInput = $('#amount');
  if (!amountInput) { return { amount: null, error: 'No se encontró el campo de monto.' }; }
  const rawValue = amountInput.value.trim();
  if (rawValue === '') {
    return { amount: null, error: null };
  }
  const parsed = parseFloat(rawValue);
  if (Number.isNaN(parsed)) {
    return { amount: null, error: 'Introduce un monto válido.' };
  }
  if (parsed < 0) {
    return { amount: null, error: 'El monto debe ser mayor o igual a 0.' };
  }
  return { amount: parsed, error: null };
}

function options(el, list, { includeEmpty=false, emptyLabel='--', getLabel=(o)=>o.name||o.id, getValue=(o)=>o.id }={}) {
  el.innerHTML = '';
  if (includeEmpty) {
    const op = document.createElement('option');
    op.value = '';
    op.textContent = emptyLabel;
    el.appendChild(op);
  }
  list.forEach(item => {
    const op = document.createElement('option');
    op.value = getValue(item);
    op.textContent = getLabel(item);
    el.appendChild(op);
  });
}

function initRoleSelect() {
  options($('#pRole'), CANONICAL_ROLES.map(r => ({id:r,name:r})), {
    getLabel:(o)=>o.name, getValue:(o)=>o.id
  });
}

function refreshParentsCombos() {
  const males = tree.listPersons().filter(p => p.gender==='male');
  const females = tree.listPersons().filter(p => p.gender==='female');
  options($('#pFather'), males, { includeEmpty:true, emptyLabel:'(sin padre)', getLabel:(o)=>o.name||o.id });
  options($('#pMother'), females, { includeEmpty:true, emptyLabel:'(sin madre)', getLabel:(o)=>o.name||o.id });
  options($('#sibFather'), males, { includeEmpty:true, emptyLabel:'(ninguno)', getLabel:(o)=>o.name||o.id });
  options($('#sibMother'), females, { includeEmpty:true, emptyLabel:'(ninguna)', getLabel:(o)=>o.name||o.id });
}

function idToName(id) {
  if (!id) return '';
  const p = tree.persons.get(id);
  return p ? (p.name||p.id) : id;
}

function escapeHtml(s='') {
  return String(s).replace(/[&<>"]/g, ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[ch]));
}

// --------- core: build case (solo vivos) + previews ----------
function buildCaseFromTree({ amount: providedAmount=null }={}) {
  RoleDetector.applySiblingRoles(tree);
  let amount = providedAmount;
  const counts = new Map();
  const living = tree.listPersons().filter(p => p.alive && p.id!=='deceased' && p.role);
  living.forEach(p => counts.set(p.role, (counts.get(p.role)||0)+1));
  const heirs = [...counts.entries()].map(([role,count])=>({ role, count }));
  const caseObj = { heirs, cli_flags: ['--explain','--audit'] };
  if (amount === null) {
    const parsed = parseAmountInput();
    if (!parsed.error) { amount = parsed.amount; }
  }
  if (amount !== null) {
    caseObj.amount = amount;
    caseObj.estate_value = amount;
  }
  return caseObj;
}

function serializeTree() {
  RoleDetector.applySiblingRoles(tree);
  const persons = tree.listPersons()
    .filter(p => p.id !== 'deceased')
    .map(p => ({
      id: p.id,
      name: p.name,
      gender: p.gender,
      alive: p.alive,
      role: p.role,
      parents: {
        father: p.parents?.father || null,
        mother: p.parents?.mother || null
      },
      spouses: Array.isArray(p.spouses) ? [...p.spouses] : [],
      children: Array.isArray(p.children) ? [...p.children] : []
    }));
  const deceased = tree.deceased;
  return {
    deceased: {
      id: deceased.id,
      name: deceased.name,
      gender: deceased.gender,
      alive: deceased.alive,
      role: deceased.role
    },
    persons
  };
}

function renderPayloadPreview() {
  const { amount } = parseAmountInput();
  const caseObj = buildCaseFromTree({ amount });
  $('#heirsPreview').textContent = JSON.stringify(caseObj.heirs, null, 2);
  $('#payloadPreview').textContent = JSON.stringify({ cases:[caseObj] }, null, 2);
}

function computeAndRenderAll() {
  RoleDetector.applySiblingRoles(tree);
  renderPersons();
  refreshParentsCombos();
  renderPayloadPreview();
  setAlert('');
}

// --------- UI: persons table ----------
function renderPersons() {
  const tb = $('#personsTbody');
  tb.innerHTML = '';
  tree.listPersons()
    .filter(p => p.id !== 'deceased')
    .forEach(p => {
      const tr = document.createElement('tr');
      tr.className = p.alive ? 'person-alive' : 'person-deceased';
      tr.innerHTML = `
        <td>${escapeHtml(p.name||p.id)}</td>
        <td>${p.gender==='male'?'♂ Varón':'♀ Mujer'}</td>
        <td class="person-status"><label class="row"><input type="checkbox" ${p.alive?'checked':''} data-alive-for="${p.id}"/><span>${p.alive?'<span class="status-alive">VIVO</span>':'<span class="status-deceased">FALLECIDO</span>'}</span></label></td>
        <td>${escapeHtml(p.role||'(auto)')}</td>
        <td><select class="parent-select" data-parent="father" data-for="${p.id}"></select></td>
        <td><select class="parent-select" data-parent="mother" data-for="${p.id}"></select></td>
        <td class="right"></td>
      `;
      const tdActions = tr.lastElementChild;
      const btnDel = document.createElement('button');
      btnDel.className = 'btn ghost';
      btnDel.textContent = 'Eliminar';
      btnDel.addEventListener('click', () => { tree.persons.delete(p.id); computeAndRenderAll(); });
      tdActions.appendChild(btnDel);

      // wire alive checkbox
      const aliveCb = tr.querySelector('input[type="checkbox"][data-alive-for]');
      aliveCb.addEventListener('change', (e)=>{
        p.alive = e.target.checked;
        computeAndRenderAll();
      });

      const parentSelects = tr.querySelectorAll('select.parent-select');
      parentSelects.forEach((sel) => {
        const parentType = sel.dataset.parent;
        const isFather = parentType === 'father';
        const availableParents = tree.listPersons().filter(pp => pp.gender === (isFather ? 'male' : 'female'));
        options(sel, availableParents, {
          includeEmpty: true,
          emptyLabel: isFather ? '(sin padre)' : '(sin madre)',
          getLabel: (o) => o.name || o.id
        });
        sel.value = p.parents?.[parentType] || '';
        sel.addEventListener('change', (evt) => {
          const selected = evt.target.value || null;
          if (selected && selected === p.id) {
            evt.target.value = p.parents?.[parentType] || '';
            setAlert('Una persona no puede ser su propio padre o madre.');
            return;
          }
          if (!p.parents) { p.parents = {}; }
          p.parents[parentType] = selected;
          setAlert('');
          computeAndRenderAll();
        });
      });

      tb.appendChild(tr);
    });
}

// --------- run calc ----------
async function runCalc() {
  // Validaciones mínimas (no bloqueos)
  const decG = $('#deceasedGender').value;
  const living = tree.listPersons().filter(p => p.alive);
  const wives = living.filter(p => p.role==='wife').length;
  const husbands = living.filter(p => p.role==='husband').length;
  const uniqueCounts = new Map();
  for (const person of living) {
    if (person.id==='deceased' || !person.role || !UNIQUE_ROLES.has(person.role)) { continue; }
    const count = (uniqueCounts.get(person.role) || 0) + 1;
    if (count > 1) { setAlert(`Solo se permite un ${person.role}.`); return; }
    uniqueCounts.set(person.role, count);
  }
  if (decG==='male') {
    if (husbands>0) { setAlert('Causante varón: no puede haber husband.'); return; }
    if (wives>4) { setAlert('Causante varón: máximo 4 esposas'); return; }
  } else if (decG==='female') {
    if (wives>0) { setAlert('Causante mujer: no puede haber wife.'); return; }
    if (husbands>1) { setAlert('Causante mujer: máximo 1 esposo'); return; }
  }
  if (living.filter(p => p.id!=='deceased' && p.role).length===0) { setAlert('Añade al menos un heredero vivo con rol.'); return; }

  const { amount, error } = parseAmountInput();
  if (error) { setAlert(error); return; }
  setAlert('');
  const singleCase = buildCaseFromTree({ amount });
  try {
    const resp = await fetch('./batch_runner.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ cases:[ singleCase ] })
    });
    if (!resp.ok) {
      const maybe = await safeJson(resp);
      throw new Error(maybe?.error || `HTTP ${resp.status}`);
    }
    const payload = await resp.json();
    const entry = (payload && Array.isArray(payload.results)) ? payload.results[0] : null;
    renderResult(entry);
  } catch (e) {
    renderError(String(e?.message||e));
  }
}

function renderResult(entry) {
  if (!entry) { renderError('Respuesta vacía'); return; }
  const out = entry.output || {};
  const diag = entry.diagnostics || {};
  $('#groupShares').textContent = JSON.stringify(out.group_shares||{}, null, 2);
  $('#individualShares').textContent = JSON.stringify(out.individual_shares||{}, null, 2);
  $('#diagnostics').textContent = JSON.stringify(diag, null, 2);
  $('#rawOutput').textContent = JSON.stringify(out, null, 2);
  $('#resultBanner').innerHTML = entry.ok
    ? `<div class="ok">✅ OK — sum_final=${escapeHtml(diag.sum_final||'')} residual_policy=${escapeHtml(diag.residual_policy||'')}</div>`
    : `<div class="error">❌ Error — ${escapeHtml(out.error||'verifica los datos')}</div>`;
}

function renderError(msg) {
  $('#groupShares').textContent = '';
  $('#individualShares').textContent = '';
  $('#diagnostics').textContent = '';
  $('#rawOutput').textContent = '';
  $('#resultBanner').innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
}

function setAlert(text) { $('#alerts').innerHTML = text ? `<div class="warn">${escapeHtml(text)}</div>` : ''; }

// --------- events ---------
$('#deceasedGender').addEventListener('change', (e)=> { tree.setDeceasedGender(e.target.value); renderPayloadPreview(); });

$('#addPerson').addEventListener('click', () => {
  const name = $('#pName').value.trim();
  const gender = $('#pGender').value;
  const alive = $('#pAlive').checked;
  const role = $('#pRole').value || null;
  const father = $('#pFather').value || null;
  const mother = $('#pMother').value || null;

  if (!role) { setAlert('Selecciona rol.'); return; }
  if (role==='husband' && tree.deceased.gender!=='female') { setAlert('Solo causante mujer puede tener marido.'); return; }
  if (role==='wife' && tree.deceased.gender!=='male') { setAlert('Solo causante varón puede tener esposas.'); return; }
  if (UNIQUE_ROLES.has(role)) {
    const duplicate = tree.listPersons().some(p => p.id!=='deceased' && p.alive && p.role===role);
    if (duplicate) { setAlert(`Solo se permite un ${role}.`); return; }
  }

  const id = genId();
  const p = new Person({ id, name, gender, alive, role, parents: { father, mother } });
  tree.addPerson(p);
  $('#pName').value='';
  computeAndRenderAll();
});

$('#clearForm').addEventListener('click', () => {
  $('#pName').value=''; $('#pAlive').checked=true; $('#pGender').value='male'; $('#pRole').selectedIndex=0;
  $('#pFather').value=''; $('#pMother').value='';
  renderPayloadPreview();
});

$('#createSiblings').addEventListener('click', () => {
  const type = $('#sibType').value;
  const father = $('#sibFather').value || null;
  const mother = $('#sibMother').value || null;
  const m = parseInt($('#sibMales').value||'0',10);
  const f = parseInt($('#sibFemales').value||'0',10);
  const malesAlive = $('#sibMalesAlive').checked;
  const femalesAlive = $('#sibFemalesAlive').checked;
  try {
    SiblingsCreator.create(tree, { type, father, mother, males:m, females:f, malesAlive, femalesAlive });
    computeAndRenderAll();
  } catch (e) {
    setAlert(String(e?.message||e));
  }
});

$('#runCalc').addEventListener('click', runCalc);
$('#downloadCase').addEventListener('click', () => {
  const { amount, error } = parseAmountInput();
  if (error) { setAlert(error); return; }
  setAlert('');
  const obj = buildCaseFromTree({ amount });
  const blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'case.json'; a.click();
  URL.revokeObjectURL(url);
});

const downloadTreeBtn = $('#downloadTree');
if (downloadTreeBtn) {
  downloadTreeBtn.addEventListener('click', () => {
    const snapshot = serializeTree();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tree-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

const includeTreeCheckbox = $('#includeTree');
if (includeTreeCheckbox) {
  treeSharingState.include = includeTreeCheckbox.checked;
  includeTreeCheckbox.addEventListener('change', (event) => {
    if (event.target.checked && !treeSharingState.confirmed) {
      const accepted = window.confirm('El snapshot del árbol contiene los datos completos de parentesco. ¿Confirmas que deseas incluirlo en futuras peticiones?');
      if (!accepted) {
        event.target.checked = false;
        return;
      }
      treeSharingState.confirmed = true;
    }
    treeSharingState.include = event.target.checked;
  });
}

const amountInputEl = $('#amount');
if (amountInputEl) { amountInputEl.addEventListener('input', renderPayloadPreview); }

// ----- init -----
function genId(){ return 'p'+Math.random().toString(36).slice(2,9); }
function init() {
  initRoleSelect();
  refreshParentsCombos();
  computeAndRenderAll();
}
init();

async function safeJson(resp){
  try { return await resp.json(); } catch { return null; }
}
