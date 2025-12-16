import { hydratePersons, snapshotPersons } from '../persons.js';
import { setSex, setDecedent, State } from '../state.js';
import { mountPersonsSection } from './persons.js';
import { banner, filePicker } from './components.js';

const KEY_INDEX = 'heritage_tree_index';
const KEY_PREFIX = 'heritage_tree:';
const AUTOSAVE_MS = 500;

function readIndex(){
  try {
    const raw = localStorage.getItem(KEY_INDEX);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('No se pudo leer el índice de árboles', e);
    return [];
  }
}

function writeIndex(list){
  localStorage.setItem(KEY_INDEX, JSON.stringify(list));
}

export function listTrees(){
  const idx = readIndex();
  return idx.slice().sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0));
}

function treeKey(id){
  return `${KEY_PREFIX}${id}`;
}

export function loadTree(id){
  try {
    const raw = localStorage.getItem(treeKey(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('No se pudo leer el árbol', id, e);
    return null;
  }
}

function writeTree(id, tree){
  localStorage.setItem(treeKey(id), JSON.stringify(tree));
}

function ensureValidPersons(persons){
  if (!Array.isArray(persons)) throw new Error('"persons" debe ser un array');
  persons.forEach((p, idx)=>{
    if (!p || typeof p !== 'object') throw new Error(`Persona inválida en posición ${idx}`);
    if (!('id' in p)) throw new Error(`Falta id en la persona #${idx+1}`);
    if (!('name' in p)) throw new Error(`Falta nombre en la persona #${idx+1}`);
  });
}

export function createTree(name){
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const now = Date.now();
  const tree = {
    ui_meta: { title: name || 'Árbol sin título', sex: 'unknown', notes: '' },
    persons: [],
  };
  const idx = readIndex();
  idx.push({ id, name: name || 'Árbol sin título', updatedAt: now });
  writeIndex(idx);
  writeTree(id, tree);
  return { id, tree };
}

export function saveTree(id, treeObj){
  const tree = treeObj || {};
  const persons = tree.persons;
  ensureValidPersons(persons);
  const idx = readIndex();
  const entry = idx.find(x => x.id === id);
  const now = Date.now();
  const name = (entry && entry.name) || (tree.ui_meta && tree.ui_meta.title) || 'Árbol';
  if (entry){
    entry.updatedAt = now;
    if (tree.ui_meta && tree.ui_meta.title){
      entry.name = tree.ui_meta.title;
    }
  }else{
    idx.push({ id, name, updatedAt: now });
  }
  writeIndex(idx);
  writeTree(id, tree);
  return { id, tree };
}

export function renameTree(id, name){
  const idx = readIndex();
  const entry = idx.find(x => x.id === id);
  if (!entry) throw new Error('Árbol no encontrado');
  entry.name = name || entry.name;
  entry.updatedAt = Date.now();
  writeIndex(idx);
  const tree = loadTree(id) || {};
  if (!tree.ui_meta) tree.ui_meta = {};
  tree.ui_meta.title = name || tree.ui_meta.title || entry.name;
  writeTree(id, tree);
}

export function duplicateTree(id, newName){
  const tree = loadTree(id);
  if (!tree) throw new Error('Árbol no encontrado');
  const created = createTree(newName || `${id}-copy`);
  const copy = JSON.parse(JSON.stringify(tree));
  if (!copy.ui_meta) copy.ui_meta = {};
  copy.ui_meta.title = newName || copy.ui_meta.title || 'Copia';
  saveTree(created.id, copy);
  return created;
}

export function deleteTree(id){
  const idx = readIndex().filter(x => x.id !== id);
  writeIndex(idx);
  localStorage.removeItem(treeKey(id));
}

export function exportTree(id){
  const tree = loadTree(id);
  if (!tree) throw new Error('Árbol no encontrado');
  return JSON.stringify(tree, null, 2);
}

export function importTree(jsonString){
  let obj = null;
  try {
    obj = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`JSON inválido: ${e.message}`);
  }
  if (!obj || typeof obj !== 'object') throw new Error('Contenido inválido');
  const persons = obj.persons || [];
  ensureValidPersons(persons);
  const name = (obj.ui_meta && obj.ui_meta.title) || 'Árbol importado';
  const created = createTree(name);
  saveTree(created.id, { ui_meta: obj.ui_meta || { title: name }, persons });
  return created;
}

export function applyPersonsSnapshot(persons){
  hydratePersons(Array.isArray(persons) ? persons : []);
}

export function mount(){
  const select = document.getElementById('tree-select');
  const btnNew = document.getElementById('btn-tree-new');
  const btnRename = document.getElementById('btn-tree-rename');
  const btnDuplicate = document.getElementById('btn-tree-duplicate');
  const btnDelete = document.getElementById('btn-tree-delete');
  const btnExport = document.getElementById('btn-tree-export');
  const btnImport = document.getElementById('btn-tree-import');
  const btnOpen = document.getElementById('btn-tree-open-builder');
  const personsRoot = document.getElementById('genealogy-persons-root');
  const bannerRoot = document.getElementById('genealogy-banner-root');

  let currentTreeId = null;
  let autosaveTimer = null;

  function showBanner(kind, title, items){
    if (!bannerRoot) return;
    bannerRoot.innerHTML = '';
    const b = banner(kind, title, items || []);
    bannerRoot.append(b);
    try { b.focus(); } catch (e) { /* noop */ }
  }

  function clearBanner(){
    if (bannerRoot) bannerRoot.innerHTML = '';
  }

  function selectedName(){
    const opt = select.options[select.selectedIndex];
    return opt ? opt.textContent : '';
  }

  function refreshSelect(targetId){
    const trees = listTrees();
    select.innerHTML = '';
    trees.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name || t.id;
      select.append(opt);
    });
    if (targetId) select.value = targetId;
    if (!select.value && select.options.length){
      select.selectedIndex = 0;
    }
    return trees;
  }

  function ensureDefault(){
    const trees = listTrees();
    if (!trees.length){
      const created = createTree('Mi árbol');
      refreshSelect(created.id);
      return created.id;
    }
    refreshSelect(trees[0].id);
    return select.value;
  }

  function setModelChangeHook(){
    window.__onModelChanged = () => {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(()=>{ saveCurrentTree(); }, AUTOSAVE_MS);
    };
  }

  function loadPersonsToEditor(tree){
    const meta = tree.ui_meta || {};
    applyPersonsSnapshot(Array.isArray(tree.persons) ? tree.persons : []);
    const decId = meta.decedentId || null;
    window.__DecedentId = decId;
    setDecedent(decId);
    setSex(meta.sex || 'unknown');
    personsRoot.innerHTML = '';
    mountPersonsSection(personsRoot);
    setModelChangeHook();
  }

  function saveCurrentTree(){
    if (!currentTreeId) return;
    try {
      const tree = loadTree(currentTreeId) || { ui_meta: {} };
      const name = selectedName() || (tree.ui_meta && tree.ui_meta.title) || 'Árbol';
      const data = {
        ui_meta: Object.assign({}, tree.ui_meta, {
          title: name,
          sex: State.sex || 'unknown',
          decedentId: State.decedentId || null,
        }),
        persons: snapshotPersons(),
      };
      saveTree(currentTreeId, data);
      refreshSelect(currentTreeId);
    } catch (e) {
      showBanner('error', 'No se pudo guardar el árbol', e.message || e.toString());
    }
  }

  function loadTreeId(id){
    const tree = loadTree(id);
    if (!tree){
      showBanner('error','No se pudo cargar el árbol seleccionado');
      return;
    }
    currentTreeId = id;
    clearBanner();
    loadPersonsToEditor(tree);
  }

  btnNew.addEventListener('click',()=>{
    const name = prompt('Nombre del nuevo árbol', 'Nuevo árbol');
    const created = createTree(name || 'Nuevo árbol');
    refreshSelect(created.id);
    loadTreeId(created.id);
    showBanner('info','Árbol creado', name || 'Nuevo árbol');
  });

  btnRename.addEventListener('click',()=>{
    if (!currentTreeId) return;
    const currentName = selectedName();
    const name = prompt('Nuevo nombre', currentName || '');
    if (!name) return;
    try { renameTree(currentTreeId, name); refreshSelect(currentTreeId); }
    catch (e){ showBanner('error','No se pudo renombrar', e.message); return; }
    showBanner('info','Árbol renombrado', name);
  });

  btnDuplicate.addEventListener('click',()=>{
    if (!currentTreeId) return;
    const name = selectedName();
    const copyName = prompt('Nombre de la copia', `${name || 'Árbol'} (copia)`);
    try {
      const created = duplicateTree(currentTreeId, copyName || `${name || 'Árbol'} (copia)`);
      refreshSelect(created.id);
      loadTreeId(created.id);
      showBanner('info','Árbol duplicado', copyName || created.id);
    } catch (e){
      showBanner('error','No se pudo duplicar', e.message);
    }
  });

  btnDelete.addEventListener('click',()=>{
    if (!currentTreeId) return;
    const name = selectedName();
    if (!confirm(`¿Borrar "${name || currentTreeId}"?`)) return;
    deleteTree(currentTreeId);
    const trees = listTrees();
    if (!trees.length){
      const created = createTree('Mi árbol');
      refreshSelect(created.id);
      loadTreeId(created.id);
      return;
    }
    refreshSelect(trees[0].id);
    loadTreeId(select.value);
  });

  btnExport.addEventListener('click',()=>{
    if (!currentTreeId) return;
    try {
      const json = exportTree(currentTreeId);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = `${selectedName() || 'arbol'}.json`;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e){
      showBanner('error','No se pudo exportar', e.message);
    }
  });

  btnImport.addEventListener('click',()=>{
    filePicker('application/json', (text)=>{
      try {
        const created = importTree(text);
        refreshSelect(created.id);
        loadTreeId(created.id);
        showBanner('info','Árbol importado', created.id);
      } catch (e){
        showBanner('error','Importación fallida', e.message);
      }
    });
  });

  btnOpen.addEventListener('click',()=>{
    saveCurrentTree();
    if (!currentTreeId) return;
    const base = (window.__APP_BASE__ || '').replace(/\/+$/, '');
    const url = `${base ? base + '/' : ''}index.php?page=builder&tree_id=${encodeURIComponent(currentTreeId)}`;
    window.location.href = url;
  });

  select.addEventListener('change',()=>{
    const id = select.value;
    if (!id) return;
    loadTreeId(id);
  });

  const initialId = ensureDefault();
  loadTreeId(initialId);
}
