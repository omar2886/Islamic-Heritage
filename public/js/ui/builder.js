// Builder con export/import, autosave y duplicado (Sprint 6)
import { setSex, setDecedent, setEstateValue, setCount, getCount, snapshot, State } from '../state.js';
import { Roles, loadRoles } from '../roles.js';
import { validate } from '../validation.js';
import { toPayload } from '../serializer.js';
import { deriveCountsFromPersons, applyHierarchyScreening, deriveCountsGraph } from '../derive.js';
import { Persons } from '../persons.js';
import { mountPersonsSection } from './persons.js';
import { banner, filePicker, downloadJsonLink } from './components.js';
import { loadTree as loadGenealogyTree, applyPersonsSnapshot, listTrees as listGenealogyTrees } from './genealogy.js';
import { makeCase, applyCase, validateCaseShape } from '../caseio.js';
import { saveDraft, loadDraft, clearDraft, hasDraft } from '../storage.js';

const el=(t,a={},...k)=>{const n=document.createElement(t);for(const [k1,v]of Object.entries(a)){if(k1==='class')n.className=v;else if(k1==='for')n.htmlFor=v;else n.setAttribute(k1,v)};k.flat().forEach(x=>n.append(x));return n;}
const num=(v)=>Number.isFinite(+v)?+v:0;

let autosaveTimer = null;
const FALLBACK_WARNING = 'No se pudieron derivar counts desde Personas; se conservaron los valores manuales.';

function personsSource(){
  if (typeof window !== 'undefined' && Array.isArray(window.__PersonsSnapshot)) return window.__PersonsSnapshot;
  return Persons.list;
}

function hasUsablePersonsData(){
  const list = personsSource();
  if (!Array.isArray(list) || !list.length) return false;
  return list.some(p=>{
    if (!p) return false;
    const role = typeof p.role === 'string' ? p.role.trim() : '';
    const hasRelations = Boolean(role || p.fatherId || p.motherId || (Array.isArray(p.spouseIds) && p.spouseIds.length));
    const alive = ('alive' in p) ? !!p.alive : true;
    return alive && hasRelations;
  });
}

function enforceUsePersonsDefault(){
  const cb = document.getElementById('usePersons');
  if (!cb) return;
  const snap = snapshot();
  if (!snap.decedentId || !hasUsablePersonsData()) {
    cb.checked = false;
  }
}
function scheduleAutosave(){
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(()=>{
    const draft = makeCase();
    saveDraft(draft);
  }, 300);
}
function notifyModelChanged(){
  enforceUsePersonsDefault();
  scheduleAutosave();
}
window.__onModelChanged = notifyModelChanged; // personas y counts lo invocan

function cleanBase(base){
  return base ? String(base).replace(/\/+$, '') : '';
}

function joinBase(base, path){
  const clean = cleanBase(base);
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return clean ? `${clean}${safePath}` : safePath;
}

function section(title,id){ return el('section',{class:'card',id,tabindex:'-1'},el('h2',{},title)); }
function field(id,label,input){ const w=el('div',{class:'field'}); w.append(el('label',{for:id},label),input); return w; }

function buildHeader(root){
  const sec = section('Datos del caso','sec-case');
  const grid = el('div',{class:'grid'});
  const sex = el('select',{id:'sex'},
    el('option',{value:'unknown',selected:''},'Desconocido'),
    el('option',{value:'male'},'Varón'),
    el('option',{value:'female'},'Mujer'),
  );
  const money = el('input',{id:'estate',type:'number',min:'0',step:'0.01',inputmode:'decimal',placeholder:'1000.00'});
  const cbUsePersons = el('input',{id:'usePersons',type:'checkbox'});
  const usePersons = el('label',{}, cbUsePersons, ' Derivar desde Personas (grafo)');
  grid.append(field('sex','Sexo del causante',sex), field('estate','Monto total (valor de la herencia)',money), el('div',{}, usePersons));
  sec.append(grid);
  root.append(sec);
  sex.addEventListener('change',()=>{ setSex(sex.value); notifyModelChanged(); });
  money.addEventListener('input',()=>{ setEstateValue(money.value); notifyModelChanged(); });
  cbUsePersons.addEventListener('change',()=>{
    if (cbUsePersons.checked){
      enforceUsePersonsDefault();
    }
    notifyModelChanged();
  });
}

function buildSpouses(root){
  const sec = section('Cónyuge(s)','sec-spouses');
  const grid = el('div',{class:'grid'});
  const inH = el('input',{id:'husband',type:'number',min:'0',step:'1',value:String(getCount('husband'))});
  const inW = el('input',{id:'wife',type:'number',min:'0',step:'1',value:String(getCount('wife'))});
  grid.append(field('husband','Esposo (husband)',inH), field('wife','Esposas (wife)',inW));
  sec.append(grid, el('p',{id:'note-spouses',class:'note',hidden:''}));
  root.append(sec);
  inH.addEventListener('input',()=>{ setCount('husband',num(inH.value)); notifyModelChanged(); });
  inW.addEventListener('input',()=>{ setCount('wife',num(inW.value)); notifyModelChanged(); });
}
function buildChildren(root){
  const sec = section('Hijos/as','sec-children');
  const grid = el('div',{class:'grid'});
  const inS = el('input',{id:'son',type:'number',min:'0',step:'1',value:String(getCount('son'))});
  const inD = el('input',{id:'daughter',type:'number',min:'0',step:'1',value:String(getCount('daughter'))});
  grid.append(field('son','Hijos varones (son)',inS), field('daughter','Hijas (daughter)',inD));
  sec.append(grid);
  root.append(sec);
  inS.addEventListener('input',()=>{ setCount('son',num(inS.value)); notifyModelChanged(); });
  inD.addEventListener('input',()=>{ setCount('daughter',num(inD.value)); notifyModelChanged(); });
}
function buildParents(root){
  const sec = section('Progenitores','sec-parents');
  const grid = el('div',{class:'grid'});
  const inF = el('input',{id:'father',type:'number',min:'0',step:'1',value:String(getCount('father'))});
  const inM = el('input',{id:'mother',type:'number',min:'0',step:'1',value:String(getCount('mother'))});
  grid.append(field('father','Padre (father)',inF), field('mother','Madre (mother)',inM));
  sec.append(grid, el('p',{id:'note-parents',class:'note',hidden:''}));
  root.append(sec);
  inF.addEventListener('input',()=>{ setCount('father',num(inF.value)); notifyModelChanged(); });
  inM.addEventListener('input',()=>{ setCount('mother',num(inM.value)); notifyModelChanged(); });
}
function buildGrandparents(root){
  const roles = Roles.sections.grandparents || [];
  if (!roles.length) return;
  const sec = section('Abuelos/as','sec-grandparents');
  const grid = el('div',{class:'grid'});
  roles.forEach(r=>{
    const inp = el('input',{id:r,type:'number',min:'0',step:'1',value:String(getCount(r))});
    grid.append(field(r,`${labelOf(r)} (${r})`,inp));
    inp.addEventListener('input',()=>{ setCount(r,num(inp.value)); notifyModelChanged(); });
  });
  sec.append(grid, el('p',{id:'note-grand',class:'note',hidden:''}));
  root.append(sec);
}
function buildSiblings(root){
  const roles = Roles.sections.siblings || [];
  const sec = section('Hermanos/as','sec-siblings');
  const grid = el('div',{class:'grid'});
  roles.forEach(r=>{
    const inp = el('input',{id:r,type:'number',min:'0',step:'1',value:String(getCount(r))});
    grid.append(field(r,`${labelOf(r)} (${r})`,inp));
    inp.addEventListener('input',()=>{ setCount(r,num(inp.value)); notifyModelChanged(); });
  });
  sec.append(grid, el('p',{id:'note-siblings',class:'note',hidden:''}));
  root.append(sec);
}
function labelOf(role){
  const map = {
    paternal_grandfather:'Abuelo paterno',
    paternal_grandmother:'Abuela paterna',
    maternal_grandmother:'Abuela materna',
    full_brother:'Hermano pleno', full_sister:'Hermana plena',
    consanguine_brother:'Hermano consanguíneo', consanguine_sister:'Hermana consanguínea',
    uterine_brother:'Hermano uterino', uterine_sister:'Hermana uterina',
  }; return map[role] || role;
}

function buildActions(root){
  const bar = el('div',{class:'actions'});
  const btnDerive = el('button',{id:'btnDerive',class:'btn-secondary',type:'button'},'Aplicar personas → counts');
  const btnPreview = el('button',{id:'btnPreview',class:'btn-secondary',type:'button'},'Generar payload');
  const btnCalc = el('button',{id:'btnCalc',class:'btn-primary',type:'button'},'Calcular');
  const btnExport = el('button',{id:'btnExport',class:'btn-secondary',type:'button'},'Exportar caso');
  const btnImport = el('button',{id:'btnImport',class:'btn-secondary',type:'button'},'Importar caso');
  const btnDuplicate = el('button',{id:'btnDuplicate',class:'btn-secondary',type:'button'},'Duplicar caso');
  const btnClearDraft = el('button',{id:'btnClearDraft',class:'btn-secondary',type:'button'},'Borrar borrador');

  bar.append(btnDerive, btnPreview, btnCalc, btnExport, btnImport, btnDuplicate, btnClearDraft);

  const preWarn = el('div',{id:'preWarnings',class:'banner warn',hidden:''});
  const preErr  = el('div',{id:'preErrors', class:'banner error',hidden:''});
  const preOut  = el('pre',{id:'prePayload',class:'card',style:'white-space:pre-wrap;overflow:auto;max-height:280px;margin-top:.5rem;'},'');
  root.append(bar, preWarn, preErr, preOut);

  const usePersons = document.getElementById('usePersons');

  function warnFallback(){
    preWarn.hidden = false;
    preWarn.innerHTML = '<strong>Avisos</strong><ul class="clean"><li>' + FALLBACK_WARNING + '</li></ul>';
    preWarn.dataset.kind = 'warn';
    const cb = document.getElementById('usePersons');
    if (cb) cb.checked = false;
    enforceUsePersonsDefault();
    notifyModelChanged();
    preWarn.focus();
  }

  btnDerive.addEventListener('click',()=>{
    const snap = snapshot();
    const D = snap.decedentId || window.__DecedentId || null;
    const wantsGraph = !!(usePersons && usePersons.checked);
    if (wantsGraph && (!D || !hasUsablePersonsData())){
      warnFallback();
      return;
    }
    const derived = (wantsGraph && D) ? deriveCountsGraph(D) : deriveCountsFromPersons();
    const entries = Array.from(derived.entries());
    if (wantsGraph && !entries.length){
      warnFallback();
      return;
    }
    if (!entries.length){
      preWarn.hidden = false;
      preWarn.innerHTML = '<strong>Avisos</strong><ul class="clean"><li>' + FALLBACK_WARNING + '</li></ul>';
      preWarn.dataset.kind = 'warn';
      notifyModelChanged();
      preWarn.focus();
      return;
    }
    derived.forEach((n,r)=> setCount(r, n));
    notifyModelChanged();
    preWarn.hidden=false;
    preWarn.innerHTML = '<strong>Counts derivados</strong><ul class="clean">' + entries.map(([r,n])=>`<li>${r}: ${n}</li>`).join('') + '</ul>';
    preWarn.dataset.kind = 'info';
    preWarn.focus();
  });

  function buildPayloadAndBanners(){
    const snap = snapshot();
    const estateValue = String(State.estateValue ?? '').trim();
    let counts = snap.counts;
    const localWarnings = [];
    if (usePersons?.checked){
      const D = snap.decedentId || window.__DecedentId || null;
      const graphReady = !!(D && hasUsablePersonsData());
      if (graphReady){
        const derived = deriveCountsGraph(D);
        if (derived.size){
          const { counts: screened, warnings } = applyHierarchyScreening(derived);
          counts = screened; localWarnings.push(...warnings);
        } else {
          localWarnings.push(FALLBACK_WARNING);
          if (usePersons) {
            usePersons.checked = false;
            notifyModelChanged();
          }
          enforceUsePersonsDefault();
        }
      } else {
        localWarnings.push(FALLBACK_WARNING);
        if (usePersons) {
          usePersons.checked = false;
          notifyModelChanged();
        }
        enforceUsePersonsDefault();
      }
    }
    const persistedWarns = (!preWarn.hidden && ['persist','warn'].includes(preWarn.dataset.kind || ''))
      ? Array.from(preWarn.querySelectorAll('li')).map(li => li.textContent.trim()).filter(Boolean)
      : [];
    const uniqWarns = new Set(persistedWarns);
    localWarnings.forEach(w => uniqWarns.add(w));
    const persistedErrors = (!preErr.hidden && ['persist','errors'].includes(preErr.dataset.kind || ''))
      ? Array.from(preErr.querySelectorAll('li')).map(li => li.textContent.trim()).filter(Boolean)
      : [];
    const {
      counts: postCounts,
      warnings: validationWarnings,
      errors,
      estateValue: normalizedEstateValue,
    } = validate({ ...snap, counts, estateValue });
    validationWarnings.forEach(w => uniqWarns.add(w));
    const finalWarns = Array.from(uniqWarns);
    const allErrors = Array.from(new Set([...persistedErrors, ...errors]));

    if (allErrors.length){
      preErr.hidden=false;
      preErr.innerHTML='<strong>Errores</strong><ul class="clean">'+allErrors.map(x=>`<li>${x}</li>`).join('')+'</ul>';
      preErr.dataset.kind = 'errors';
      preErr.focus();
    }
    else {
      preErr.hidden=true;
      preErr.textContent='';
      delete preErr.dataset.kind;
    }
    if (finalWarns.length){
      preWarn.hidden=false;
      preWarn.innerHTML='<strong>Avisos</strong><ul class="clean">'+finalWarns.map(x=>`<li>${x}</li>`).join('')+'</ul>';
      preWarn.dataset.kind = 'warn';
    }
    else {
      preWarn.hidden=true;
      preWarn.textContent='';
      delete preWarn.dataset.kind;
    }

    const finalEstateValue = normalizedEstateValue ?? estateValue;
    const payload = allErrors.length ? null : toPayload({ ...snap, estateValue: finalEstateValue, counts: postCounts });
    return { errors: allErrors, payload };
  }

  btnPreview.addEventListener('click',()=>{
    const { errors, payload } = buildPayloadAndBanners();
    preOut.textContent = errors.length ? '' : JSON.stringify(payload, null, 2);
  });

  btnCalc.addEventListener('click',()=>{
    const { errors, payload } = buildPayloadAndBanners();
    if (errors.length) return;
    try { sessionStorage.setItem('heritage_payload', JSON.stringify(payload)); } catch {}
    const base = (typeof window !== 'undefined' && (window.__APP_BASE__ || '')) || '';
    const target = joinBase(base, 'index.php?page=results');
    window.location.href = target;
  });

  btnExport.addEventListener('click',()=>{
    const cs = makeCase();
    const a = downloadJsonLink(`caso_${Date.now()}.json`, cs, 'Descargar caso');
    a.click();
  });

  btnImport.addEventListener('click',()=>{
    filePicker('application/json', (text, file)=>{
      let obj = null; try{ obj = JSON.parse(text); } catch(e){ showError(`JSON inválido (${e.message})`); return; }
      const errs = validateCaseShape(obj);
      if (errs.length){ showError('Case inválido', errs); return; }
      try{
        const res = applyCase(obj); // ← ahora devuelve {warnings:[]}
        notifyModelChanged();
        if (res && res.warnings && res.warnings.length){
          const b = banner('warn','Normalización de roles', res.warnings);
          root.prepend(b); b.focus();
        }
        location.reload();
      }catch(e){ showError(`No se pudo aplicar el caso: ${e.message}`); }
    });
  });

  btnDuplicate.addEventListener('click',()=>{
    const cs = makeCase();
    const a = downloadJsonLink(`caso_duplicado_${Date.now()}.json`, cs, 'Descargar duplicado');
    a.click();
  });

  btnClearDraft.addEventListener('click',()=>{ clearDraft(); const ok = banner('warn','Borrador eliminado','Se ha borrado el borrador local.'); root.prepend(ok); ok.focus(); });

  function showError(title, items){ const b = banner('error', title, items||[]); root.prepend(b); b.focus(); }
}

function offerRestoreDraft(root){
  if (!hasDraft()) return;
  const b = banner('warn','Se encontró un borrador previo','Puedes restaurarlo o descartarlo.');
  const restore = el('button',{class:'btn-secondary',type:'button'},'Restaurar');
  const discard = el('button',{class:'btn-secondary',type:'button'},'Descartar');
  const box = el('div',{class:'actions'}, restore, discard);
  const wrap = el('section',{class:'card'}, b, box);
  root.prepend(wrap);
  b.focus();
  restore.addEventListener('click',()=>{
    const cs = loadDraft(); if (!cs) return;
    try{ applyCase(cs); location.reload(); }catch(e){ console.error(e); }
  });
  discard.addEventListener('click',()=>{ clearDraft(); wrap.remove(); });
}

function preloadGenealogy(root){
  const params = new URLSearchParams(window.location.search || '');
  const treeId = params.get('tree_id');
  if (!treeId) return;

  try {
    const tree = loadGenealogyTree(treeId);
    if (!tree) {
      const b = banner('error','No se pudo cargar el árbol','No se encontró el árbol solicitado en este dispositivo.');
      root.prepend(b); b.focus();
      return;
    }
    if (!Array.isArray(tree.persons)) throw new Error('El árbol no contiene una lista de personas válida.');
    applyPersonsSnapshot(tree.persons);
    const meta = tree.ui_meta || {};
    setSex(meta.sex || 'unknown');
    const dec = meta.decedentId || null;
    window.__DecedentId = dec;
    setDecedent(dec);

    const entry = listGenealogyTrees().find(t => t.id === treeId);
    const name = (entry && entry.name) || meta.title || treeId;
    const b = banner('info','Árbol precargado', [`Se cargó "${name}" desde Genealogía.`]);
    root.prepend(b); b.focus();
  } catch (e) {
    const b = banner('error','Genealogía no disponible', e.message || e.toString());
    root.prepend(b); b.focus();
  }
}

export async function mount(){
  await loadRoles();
  const root = document.getElementById('builder-root');
  root.innerHTML = '';
  buildHeader(root);

  preloadGenealogy(root);

  const personsHost = el('div',{id:'persons-host'});
  root.append(personsHost);
  mountPersonsSection(personsHost);

  buildSpouses(root);
  buildChildren(root);
  buildParents(root);
  buildGrandparents(root);
  buildSiblings(root);

  buildActions(root);
  offerRestoreDraft(root);
  enforceUsePersonsDefault();
}
