// public/ui/js/pages/builder_tree.js
import { renderIcon } from "../ui/icons.js";
import { escapeHtml } from "../ui/escape.js";
import {
  addPerson,
  updatePerson,
  setParents,
  linkSpouses,
  unlinkSpouses,
  sanitizeTree,
  ensureTree,
  getParents,
  getChildren,
  getSpouses,
} from "../domain/familyTree.js";
import { labelForRole } from "../domain/roles.js";
import { deriveHeirsByRoleFromTree } from "../domain/deriveHeirsFromTree.js";
import { loadState, persistState } from "../store/persist.js";

const MODAL_TYPES = Object.freeze({
  CREATE_PERSON: "create_person",
  EDIT_PERSON: "edit_person",
  ADD_CHILD: "add_child",
  ADD_SPOUSE: "add_spouse",
  SET_PARENT: "set_parent",
  CONFIRM_IMPORT: "confirm_import",
});

function normStr(v){
  return String(v ?? "");
}

function safeSex(v){
  return v === "male" || v === "female" ? v : null;
}

function isDescendant(tree, ancestorId, maybeDescendantId){
  const start = String(ancestorId);
  const target = String(maybeDescendantId);
  if (!start || !target) return false;
  if (start === target) return true;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length){
    const id = stack.pop();
    const kids = getChildren(tree, id);
    for (const cid of kids){
      const k = String(cid);
      if (k === target) return true;
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push(k);
    }
  }
  return false;
}

function maxSpousesForSex(sex){
  return sex === "male" ? 4 : 1;
}

function nameOf(p){
  if (!p) return "N/A";
  const base = p.name ? String(p.name) : "Sin nombre";
  return base.trim() || "Sin nombre";
}

function getTreeFromState(state){
  const treeRaw = state?.builder?.tree;
  const wizard = state?.wizard || null;
  // Nota: ensureTree(tree, wizard) solo se usa aquí para render. El import explícito aplica wizard sin magia.
  return ensureTree(sanitizeTree(treeRaw), wizard);
}

function computeWizardHash(wizard){
  try {
    return JSON.stringify({
      deceased_sex: wizard?.deceased_sex ?? null,
      spouse: wizard?.spouse ?? null,
      parents: wizard?.parents ?? null,
      descendants: wizard?.descendants ?? null,
    });
  } catch {
    return String(Date.now());
  }
}

function setTreeInState(store, nextTree, patch = {}, meta = {}){
  const derived = deriveHeirsByRoleFromTree(nextTree);
  const payloadPreview = { heirs: derived.heirs, _derivedFrom: "tree" };

  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      ...patch,
      tree: nextTree,
      payloadPreview,
      treeDerivation: derived,
    },
  }), meta);
}

function setModal(store, modal){
  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      modal,
    },
  }));
}

function setModalError(store, msg){
  const error = String(msg || "Error");
  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      modal: s.builder.modal ? { ...s.builder.modal, error } : { type: "error", error },
    },
  }));
}

function closeTreeModal(store){
  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      modal: null,
    },
  }));
}

function applyWizardToTree(tree, wizard){
  const w = wizard || {};
  let t = ensureTree(tree, null);

  // IMPORT RULE: el sexo del causante debe venir del wizard al importar, sin depender de ensureTree(null)
  const wSex = safeSex(w.deceased_sex);
  if (wSex){
    t = updatePerson(t, t.deceasedId, { sex: wSex, alive: false });
  } else {
    // Asegurar al menos que el causante no figure como vivo
    t = updatePerson(t, t.deceasedId, { alive: false });
  }

  // Padres
  const fatherWanted = Boolean(w?.parents?.father);
  const motherWanted = Boolean(w?.parents?.mother);
  const dParents = getParents(t, t.deceasedId);

  let fatherId = dParents.fatherId || null;
  let motherId = dParents.motherId || null;

  if (fatherWanted && !fatherId){
    const r = addPerson(t, { name: "Padre", sex: "male", alive: true });
    t = r.tree;
    fatherId = r.personId;
  }
  if (!fatherWanted && fatherId){
    // no borrar nodo, solo desvincular
    fatherId = null;
  }

  if (motherWanted && !motherId){
    const r = addPerson(t, { name: "Madre", sex: "female", alive: true });
    t = r.tree;
    motherId = r.personId;
  }
  if (!motherWanted && motherId){
    motherId = null;
  }

  t = setParents(t, t.deceasedId, { fatherId, motherId });

  // Cónyuge
  const d = t.people[t.deceasedId];
  const dSex2 = safeSex(d?.sex) || safeSex(w?.deceased_sex) || "male";

  if (dSex2 === "male"){
    const enabled = Boolean(w?.spouse?.enabled);
    const wives = Math.max(0, Math.min(4, parseInt(String(w?.spouse?.wives_count || 0), 10) || 0));
    const shouldHave = enabled ? wives : 0;

    const currentSpouses = getSpouses(t, t.deceasedId);
    // Mantener existentes si ya están; si faltan, crear; si sobran, desvincular desde el final
    if (currentSpouses.length > shouldHave){
      const toRemove = currentSpouses.slice(shouldHave);
      for (const sid of toRemove){
        t = unlinkSpouses(t, t.deceasedId, sid);
      }
    }
    if (currentSpouses.length < shouldHave){
      const missing = shouldHave - currentSpouses.length;
      for (let i = 0; i < missing; i++){
        const r = addPerson(t, { name: `Esposa ${currentSpouses.length + i + 1}`, sex: "female", alive: true });
        t = r.tree;
        t = linkSpouses(t, t.deceasedId, r.personId);
      }
    }
  } else {
    const husbandPresent = Boolean(w?.spouse?.husband_present);
    const currentSpouses = getSpouses(t, t.deceasedId);

    if (!husbandPresent){
      for (const sid of currentSpouses){
        t = unlinkSpouses(t, t.deceasedId, sid);
      }
    } else {
      if (currentSpouses.length === 0){
        const r = addPerson(t, { name: "Esposo", sex: "male", alive: true });
        t = r.tree;
        t = linkSpouses(t, t.deceasedId, r.personId);
      }
      // si hay más de 1, recortar a 1 por guardrail
      if (currentSpouses.length > 1){
        const toRemove = currentSpouses.slice(1);
        for (const sid of toRemove){
          t = unlinkSpouses(t, t.deceasedId, sid);
        }
      }
    }
  }

  // Descendientes
  const desc = w?.descendants || {};
  const sons = Math.max(0, parseInt(String(desc.son || 0), 10) || 0);
  const daughters = Math.max(0, parseInt(String(desc.daughter || 0), 10) || 0);
  const sonsSon = Math.max(0, parseInt(String(desc.sons_son || 0), 10) || 0);
  const sonsDaughter = Math.max(0, parseInt(String(desc.sons_daughter || 0), 10) || 0);

  const kids = getChildren(t, t.deceasedId);
  // Si ya hay hijos, respetar. Si no, crear exacto desde wizard.
  if (kids.length === 0){
    for (let i = 0; i < sons; i++){
      const r = addPerson(t, { name: `Hijo ${i + 1}`, sex: "male", alive: true });
      t = r.tree;
      // asignar causante como padre o madre según su sexo
      const role = dSex2 === "male" ? "father" : "mother";
      const p = getParents(t, r.personId);
      t = setParents(t, r.personId, {
        fatherId: role === "father" ? t.deceasedId : p.fatherId,
        motherId: role === "mother" ? t.deceasedId : p.motherId,
      });
    }
    for (let i = 0; i < daughters; i++){
      const r = addPerson(t, { name: `Hija ${i + 1}`, sex: "female", alive: true });
      t = r.tree;
      const role = dSex2 === "male" ? "father" : "mother";
      const p = getParents(t, r.personId);
      t = setParents(t, r.personId, {
        fatherId: role === "father" ? t.deceasedId : p.fatherId,
        motherId: role === "mother" ? t.deceasedId : p.motherId,
      });
    }

    // Nietos por hijo: si no hay hijos varones, se crean primero
    let sonsIds = getChildren(t, t.deceasedId).filter((cid) => safeSex(t.people[cid]?.sex) === "male");
    if (sonsIds.length === 0 && (sonsSon + sonsDaughter) > 0){
      const r = addPerson(t, { name: "Hijo", sex: "male", alive: true });
      t = r.tree;
      const role = dSex2 === "male" ? "father" : "mother";
      const p = getParents(t, r.personId);
      t = setParents(t, r.personId, {
        fatherId: role === "father" ? t.deceasedId : p.fatherId,
        motherId: role === "mother" ? t.deceasedId : p.motherId,
      });
      sonsIds = [r.personId];
    }

    const sonId = sonsIds[0] || null;
    if (sonId){
      for (let i = 0; i < sonsSon; i++){
        const r = addPerson(t, { name: `Nieto (hijo de hijo) ${i + 1}`, sex: "male", alive: true });
        t = r.tree;
        const p = getParents(t, r.personId);
        t = setParents(t, r.personId, { fatherId: sonId, motherId: p.motherId });
      }
      for (let i = 0; i < sonsDaughter; i++){
        const r = addPerson(t, { name: `Nieta (hija de hijo) ${i + 1}`, sex: "female", alive: true });
        t = r.tree;
        const p = getParents(t, r.personId);
        t = setParents(t, r.personId, { fatherId: sonId, motherId: p.motherId });
      }
    }
  }

  return t;
}

function importWizardToTree(store){
  const s = store.getState();
  const wizard = s.wizard || {};
  const builder = s.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree), wizard);
  const merged = applyWizardToTree(tree, wizard);

  setTreeInState(store, merged, {
    mode: "tree",
    treeSelectedId: merged.deceasedId,
    fromWizardApplied: true,
    wizardHashApplied: computeWizardHash(wizard),
  }, { persist: true });
}

export function applyWizardSyncTree(store){
  const s = store.getState();
  const wizard = s.wizard || {};
  const builder = s.builder || {};

  const wizardHash = computeWizardHash(wizard);
  const appliedHash = builder.wizardHashApplied || null;

  // Si nunca se importó, o cambió el wizard, mostrar CTA de import en toolbar.
  store.setState((st) => ({
    ...st,
    builder: {
      ...st.builder,
      wizardHashCurrent: wizardHash,
      wizardNeedsImport: appliedHash !== wizardHash,
    },
  }));
}

function buildGenerationIndex(tree){
  const genById = Object.create(null);
  const q = [];
  genById[tree.deceasedId] = 0;
  q.push(tree.deceasedId);

  while (q.length){
    const id = q.shift();
    const g = genById[id];

    // Spouses same generation
    for (const sid of getSpouses(tree, id)){
      if (genById[sid] === undefined){
        genById[sid] = g;
        q.push(sid);
      }
    }

    // Parents one generation up
    const parents = getParents(tree, id);
    for (const pid of [parents.fatherId, parents.motherId]){
      if (pid && genById[pid] === undefined){
        genById[pid] = g - 1;
        q.push(pid);
      }
    }

    // Children one generation down
    for (const cid of getChildren(tree, id)){
      if (genById[cid] === undefined){
        genById[cid] = g + 1;
        q.push(cid);
      }
    }
  }

  return genById;
}

function groupByGeneration(tree, genById){
  const groups = Object.create(null);
  for (const id of Object.keys(genById)){
    const g = genById[id];
    if (!groups[g]) groups[g] = [];
    groups[g].push(id);
  }

  const generations = Object.keys(groups).map((x) => parseInt(x, 10)).sort((a, b) => a - b);
  return { groups, generations };
}

function modalBase({ title, body, error }){
  const errHtml = error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : "";
  return `
    <div class="modal-backdrop" data-tree-action="modal-cancel">
      <div class="modal" role="dialog" aria-modal="true" onclick="event.stopPropagation();">
        <div class="modal-h">
          <strong>${escapeHtml(title || "Modal")}</strong>
          <button class="btn btn-sm" type="button" data-tree-action="modal-cancel">x</button>
        </div>
        <div class="modal-b stack" style="gap:10px;">
          ${errHtml}
          ${body || ""}
        </div>
      </div>
    </div>
  `;
}

function renderModal(tree, ui){
  const modal = ui.modal;
  if (!modal) return "";

  if (modal.type === MODAL_TYPES.CONFIRM_IMPORT){
    return modalBase({
      title: "Importar desde wizard",
      body: `
        <div class="stack" style="gap:10px;">
          <p style="margin:0;">Se importarán los datos del wizard al árbol. Esta acción puede crear y enlazar personas.</p>
          <div class="row" style="justify-content:flex-end; gap:10px; flex-wrap:wrap;">
            <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
            <button class="btn btn-primary" type="button" data-tree-action="confirm-import">Confirmar importación</button>
          </div>
        </div>
      `,
      error: modal.error || null,
    });
  }

  if (modal.type === MODAL_TYPES.CREATE_PERSON){
    return renderModalCreatePerson(modal.error);
  }
  if (modal.type === MODAL_TYPES.EDIT_PERSON){
    return renderModalEdit(tree, modal.personId, modal.error);
  }
  if (modal.type === MODAL_TYPES.ADD_SPOUSE){
    return renderModalAddSpouse(tree, modal.personId, modal.error);
  }
  if (modal.type === MODAL_TYPES.ADD_CHILD){
    return renderModalAddChild(tree, modal.parentId, modal.error);
  }
  if (modal.type === MODAL_TYPES.SET_PARENT){
    return renderModalSetParent(tree, modal.childId, modal.parentKind, modal.error);
  }

  return modalBase({ title: "Modal", body: `<div class="muted">Tipo de modal desconocido</div>`, error: modal.error || null });
}

function openEditModal(store, personId){
  if (!personId) return;
  setModal(store, { type: MODAL_TYPES.EDIT_PERSON, personId, error: null });
}

function openCreateModal(store){
  setModal(store, { type: MODAL_TYPES.CREATE_PERSON, error: null });
}

function openAddSpouseModal(store, personId){
  if (!personId) return;
  setModal(store, { type: MODAL_TYPES.ADD_SPOUSE, personId, error: null });
}

function openAddChildModal(store, parentId){
  if (!parentId) return;
  setModal(store, { type: MODAL_TYPES.ADD_CHILD, parentId, error: null });
}

function openSetParentModal(store, childId, parentKind){
  if (!childId || (parentKind !== "father" && parentKind !== "mother")) return;
  setModal(store, { type: MODAL_TYPES.SET_PARENT, childId, parentKind, error: null });
}

function openConfirmImportModal(store){
  setModal(store, { type: MODAL_TYPES.CONFIRM_IMPORT, error: null });
}

function readModalValues(){
  const name = document.getElementById("tree-modal-name")?.value ?? "";
  const sexRaw = document.getElementById("tree-modal-sex")?.value ?? "";
  const aliveRaw = document.getElementById("tree-modal-alive")?.value ?? "alive";
  const existingId = document.getElementById("tree-modal-existing")?.value ?? "";
  const parentAs = document.getElementById("tree-modal-parent-as")?.value ?? "auto";
  const parentKind = document.getElementById("tree-modal-parent-kind")?.value ?? "";

  const childModeNew = document.getElementById("tree-child-mode-new");
  const spouseModeNew = document.getElementById("tree-spouse-mode-new");
  const parentModeNew = document.getElementById("tree-parent-mode-new");

  const linkModeChild = childModeNew ? (childModeNew.checked ? "new" : "existing") : null;
  const linkModeSpouse = spouseModeNew ? (spouseModeNew.checked ? "new" : "existing") : null;
  const linkModeParent = parentModeNew ? (parentModeNew.checked ? "new" : "existing") : null;

  const linkMode = linkModeChild || linkModeSpouse || linkModeParent || "new";

  return {
    name: normStr(name).trim(),
    sexRaw: normStr(sexRaw).trim(),
    aliveRaw: normStr(aliveRaw).trim(),
    existingId: normStr(existingId).trim(),
    parentAs: normStr(parentAs).trim(),
    parentKind: normStr(parentKind).trim(),
    linkMode,
  };
}

function renderModalCreatePerson(error){
  const body = `
    <div class="stack" style="gap:10px;">
      <div class="grid2">
        <label class="field">
          <span class="label">Nombre</span>
          <input class="input" id="tree-modal-name" type="text" value="">
        </label>
        <label class="field">
          <span class="label">Sexo</span>
          <select class="input" id="tree-modal-sex">
            <option value="male">Hombre</option>
            <option value="female">Mujer</option>
          </select>
        </label>
      </div>
      <label class="field">
        <span class="label">Estado</span>
        <select class="input" id="tree-modal-alive">
          <option value="alive">Vivo</option>
          <option value="dead">Fallecido</option>
        </select>
      </label>

      <div class="row" style="justify-content:flex-end; flex-wrap:wrap; gap:10px;">
        <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" type="button" data-tree-action="modal-create-person">Crear</button>
      </div>
    </div>
  `;

  return modalBase({ title: "Crear persona", body, error });
}

function renderModalEdit(tree, personId, error){
  const p = tree.people[personId];
  if (!p){
    return modalBase({ title: "Editar", body: `<div class="muted">Persona inválida</div>`, error });
  }
  const isDeceased = personId === tree.deceasedId;

  const body = `
    <div class="stack" style="gap:10px;">
      <div class="grid2">
        <label class="field">
          <span class="label">Nombre</span>
          <input class="input" id="tree-modal-name" type="text" value="${escapeHtml(p.name || "")}">
        </label>
        <label class="field">
          <span class="label">Sexo</span>
          <select class="input" id="tree-modal-sex" ${isDeceased ? "disabled" : ""}>
            <option value="male" ${p.sex === "male" ? "selected" : ""}>Hombre</option>
            <option value="female" ${p.sex === "female" ? "selected" : ""}>Mujer</option>
          </select>
          ${isDeceased ? `<div class="muted" style="margin-top:6px;">El sexo del causante se define desde el Wizard e import explícito.</div>` : ""}
        </label>
      </div>

      <label class="field">
        <span class="label">Estado</span>
        <select class="input" id="tree-modal-alive" ${isDeceased ? "disabled" : ""}>
          <option value="alive" ${p.alive ? "selected" : ""}>Vivo</option>
          <option value="dead" ${!p.alive ? "selected" : ""}>Fallecido</option>
        </select>
      </label>

      <div class="row" style="justify-content:flex-end; flex-wrap:wrap; gap:10px;">
        <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" type="button" data-tree-action="modal-save-edit" data-modal-person-id="${escapeHtml(personId)}">Guardar</button>
      </div>
    </div>
  `;

  return modalBase({ title: `Editar: ${nameOf(p)} (#${personId})`, body, error });
}

function renderModalAddSpouse(tree, personId, error){
  const p = tree.people[personId];
  if (!p){
    return modalBase({ title: "Añadir cónyuge", body: `<div class="muted">Persona inválida</div>`, error });
  }

  const existing = Object.keys(tree.people || {})
    .filter((id) => id !== personId)
    .map((id) => ({ ...tree.people[id], id }))
    .sort((a, b) => nameOf(a).toLowerCase().localeCompare(nameOf(b).toLowerCase()));

  const body = `
    <div class="stack" style="gap:10px;">
      <div class="muted">Añadir cónyuge a: <strong>${escapeHtml(nameOf(p))}</strong></div>

      <div class="card card-pad">
        <div class="row" style="gap:10px; flex-wrap:wrap;">
          <label class="row" style="gap:8px;">
            <input type="radio" name="spouse_mode" value="new" checked id="tree-spouse-mode-new">
            <span>Crear nuevo</span>
          </label>
          <label class="row" style="gap:8px;">
            <input type="radio" name="spouse_mode" value="existing" id="tree-spouse-mode-existing">
            <span>Reusar existente</span>
          </label>
        </div>

        <div class="grid2" style="margin-top:10px;" data-spouse-mode="new">
          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" type="text" id="tree-modal-name" value="">
          </label>
          <label class="field">
            <span class="label">Sexo</span>
            <select class="input" id="tree-modal-sex">
              <option value="female">Mujer</option>
              <option value="male">Hombre</option>
            </select>
          </label>
        </div>

        <div class="grid2" style="margin-top:10px;" data-spouse-mode="new">
          <label class="field">
            <span class="label">Estado</span>
            <select class="input" id="tree-modal-alive">
              <option value="alive">Vivo</option>
              <option value="dead">Fallecido</option>
            </select>
          </label>
        </div>

        <div style="margin-top:10px;" data-spouse-mode="existing" class="is-hidden">
          <label class="field" style="width:100%;">
            <span class="label">Persona existente</span>
            <select class="input" id="tree-modal-existing">
              <option value="">Selecciona...</option>
              ${existing.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(nameOf(x))} (#${escapeHtml(x.id)})</option>`).join("")}
            </select>
          </label>
        </div>
      </div>

      <div class="row" style="justify-content:flex-end; flex-wrap:wrap; gap:10px;">
        <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" type="button" data-tree-action="modal-add-spouse" data-modal-person-id="${escapeHtml(personId)}">Añadir</button>
      </div>
    </div>
  `;

  return modalBase({ title: "Añadir cónyuge", body, error });
}

function renderModalAddChild(tree, parentId, error){
  const parent = tree.people[parentId];
  if (!parent){
    return modalBase({ title: "Añadir hijo", body: `<div class="muted">Persona inválida</div>`, error });
  }

  const existing = Object.keys(tree.people || {})
    .filter((id) => id !== parentId)
    .map((id) => ({ ...tree.people[id], id }))
    .sort((a, b) => nameOf(a).toLowerCase().localeCompare(nameOf(b).toLowerCase()));

  const body = `
    <div class="stack" style="gap:10px;">
      <div class="muted">Añadir hijo/a a: <strong>${escapeHtml(nameOf(parent))}</strong></div>

      <div class="card card-pad">
        <div class="row" style="gap:10px; flex-wrap:wrap;">
          <label class="row" style="gap:8px;">
            <input type="radio" name="child_mode" value="new" checked id="tree-child-mode-new">
            <span>Crear nuevo</span>
          </label>
          <label class="row" style="gap:8px;">
            <input type="radio" name="child_mode" value="existing" id="tree-child-mode-existing">
            <span>Reusar existente</span>
          </label>
        </div>

        <div class="grid2" style="margin-top:10px;">
          <label class="field">
            <span class="label">Este progenitor actúa como</span>
            <select class="input" id="tree-modal-parent-as">
              <option value="auto">Auto (por sexo)</option>
              <option value="father">Padre</option>
              <option value="mother">Madre</option>
            </select>
          </label>
          <label class="field" data-child-mode="new">
            <span class="label">Sexo del hijo/a</span>
            <select class="input" id="tree-modal-sex">
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
            </select>
          </label>
        </div>

        <div class="grid2" style="margin-top:10px;" data-child-mode="new">
          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" type="text" id="tree-modal-name" value="">
          </label>
          <label class="field">
            <span class="label">Estado</span>
            <select class="input" id="tree-modal-alive">
              <option value="alive">Vivo</option>
              <option value="dead">Fallecido</option>
            </select>
          </label>
        </div>

        <div style="margin-top:10px;" data-child-mode="existing" class="is-hidden">
          <label class="field" style="width:100%;">
            <span class="label">Persona existente</span>
            <select class="input" id="tree-modal-existing">
              <option value="">Selecciona...</option>
              ${existing.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(nameOf(x))} (#${escapeHtml(x.id)})</option>`).join("")}
            </select>
          </label>
        </div>
      </div>

      <div class="row" style="justify-content:flex-end; flex-wrap:wrap; gap:10px;">
        <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" type="button" data-tree-action="modal-add-child" data-modal-parent-id="${escapeHtml(parentId)}">Añadir</button>
      </div>
    </div>
  `;

  return modalBase({ title: "Añadir hijo", body, error });
}

function renderModalSetParent(tree, childId, parentKind, error){
  const child = tree.people[childId];
  if (!child){
    return modalBase({ title: "Asignar padre/madre", body: `<div class="muted">Persona inválida</div>`, error });
  }

  const kindLabel = parentKind === "father" ? "Padre" : "Madre";
  const fixedSex = parentKind === "father" ? "male" : "female";

  const existing = Object.keys(tree.people || {})
    .filter((id) => id !== childId)
    .map((id) => ({ ...tree.people[id], id }))
    .sort((a, b) => nameOf(a).toLowerCase().localeCompare(nameOf(b).toLowerCase()));

  const body = `
    <div class="stack" style="gap:10px;">
      <input type="hidden" id="tree-modal-parent-kind" value="${escapeHtml(parentKind)}">

      <div class="muted">Asignar <strong>${escapeHtml(kindLabel)}</strong> a: <strong>${escapeHtml(nameOf(child))}</strong></div>

      <div class="card card-pad">
        <div class="row" style="gap:10px; flex-wrap:wrap;">
          <label class="row" style="gap:8px;">
            <input type="radio" name="parent_mode" value="new" checked id="tree-parent-mode-new">
            <span>Crear nuevo</span>
          </label>
          <label class="row" style="gap:8px;">
            <input type="radio" name="parent_mode" value="existing" id="tree-parent-mode-existing">
            <span>Reusar existente</span>
          </label>
        </div>

        <div style="margin-top:10px;">
          <label class="field" style="width:100%;">
            <span class="label">Persona existente</span>
            <select class="input" id="tree-modal-existing" disabled>
              <option value="">Selecciona...</option>
              ${existing.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(nameOf(p))} (#${escapeHtml(p.id)})</option>`).join("")}
            </select>
          </label>
        </div>
      </div>

      <div data-parent-mode="new">
        <div class="grid2">
          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" type="text" id="tree-modal-name" value="">
          </label>
          <label class="field">
            <span class="label">Estado</span>
            <select class="input" id="tree-modal-alive">
              <option value="alive">Vivo</option>
              <option value="dead">Fallecido</option>
            </select>
          </label>
        </div>
        <div class="muted" style="margin-top:8px;">Sexo fijado por rol: <strong>${fixedSex === "male" ? "Hombre" : "Mujer"}</strong></div>
      </div>

      <div class="row" style="justify-content:flex-end; margin-top:6px; flex-wrap:wrap; gap:10px;">
        <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" type="button" data-tree-action="modal-save-parent" data-modal-child-id="${escapeHtml(childId)}" data-modal-parent-kind="${escapeHtml(parentKind)}">Guardar</button>
      </div>
    </div>
  `;

  return modalBase({ title: kindLabel, body, error });
}

function commitCreatePerson(store){
  const state = store.getState();
  const tree = getTreeFromState(state);

  const vals = readModalValues();
  const sex = safeSex(vals.sexRaw) || "male";
  const alive = vals.aliveRaw !== "dead";
  const name = vals.name || "Sin nombre";

  let next = tree;
  const r = addPerson(next, { name, sex, alive });
  next = r.tree;

  setTreeInState(store, next, { treeSelectedId: r.personId }, { persist: true });
  closeTreeModal(store);
}

function commitSaveEdit(store, personId){
  const state = store.getState();
  const tree = getTreeFromState(state);
  const p = tree.people[personId];
  if (!p) return;

  const vals = readModalValues();
  const name = vals.name || "Sin nombre";
  const alive = vals.aliveRaw !== "dead";

  let patch = { name, alive };
  if (personId !== tree.deceasedId){
    const sex = safeSex(vals.sexRaw) || p.sex || "male";
    patch = { ...patch, sex };
  }

  const next = updatePerson(tree, personId, patch);
  setTreeInState(store, next, {}, { persist: true });
  closeTreeModal(store);
}

function commitAddSpouse(store, personId){
  const state = store.getState();
  const tree = getTreeFromState(state);
  if (!tree.people[personId]){
    setModalError(store, "Persona inválida.");
    return;
  }

  const vals = readModalValues();
  let nextTree = tree;

  const a = tree.people[personId];
  const aSex = safeSex(a.sex);
  const maxA = maxSpousesForSex(aSex);
  const currentA = getSpouses(tree, personId).length;

  if (aSex && currentA >= maxA){
    setModalError(store, `Límite de cónyuges alcanzado para esta persona (${maxA}).`);
    return;
  }

  if (vals.linkMode === "existing"){
    if (!vals.existingId){
      setModalError(store, "Selecciona una persona existente.");
      return;
    }
    if (!tree.people[vals.existingId]){
      setModalError(store, "Persona existente inválida.");
      return;
    }
    if (vals.existingId === personId){
      setModalError(store, "No puedes ser tu propio cónyuge.");
      return;
    }

    const current = getSpouses(tree, personId);
    if (current.includes(vals.existingId)){
      setModalError(store, "Ya son cónyuges.");
      return;
    }

    const b = tree.people[vals.existingId];
    const bSex = safeSex(b?.sex);
    if (aSex && bSex && aSex === bSex){
      setModalError(store, "Un cónyuge debe ser de sexo opuesto.");
      return;
    }
    const maxB = maxSpousesForSex(bSex);
    const currentB = getSpouses(tree, vals.existingId).length;
    if (bSex && currentB >= maxB){
      setModalError(store, `La persona seleccionada ya alcanzó su límite de cónyuges (${maxB}).`);
      return;
    }

    nextTree = linkSpouses(nextTree, personId, vals.existingId);
    setTreeInState(store, nextTree, {}, { persist: true });
    closeTreeModal(store);
    return;
  }

  const name = vals.name || "Cónyuge";
  const sex = safeSex(vals.sexRaw) || "male";
  if (aSex && sex && aSex === sex){
    setModalError(store, "Un cónyuge debe ser de sexo opuesto.");
    return;
  }
  const alive = vals.aliveRaw !== "dead";

  const r = addPerson(nextTree, { name, sex, alive });
  nextTree = r.tree;
  nextTree = linkSpouses(nextTree, personId, r.personId);

  setTreeInState(store, nextTree, {}, { persist: true });
  closeTreeModal(store);
}

function commitAddChild(store, parentId){
  const state = store.getState();
  const tree = getTreeFromState(state);

  const parent = tree.people[parentId];
  if (!parent){
    setModalError(store, "Persona inválida.");
    return;
  }

  const vals = readModalValues();
  let role = vals.parentAs || "auto";
  if (role === "auto"){
    role = safeSex(parent.sex) === "female" ? "mother" : "father";
  }

  const pSex = safeSex(parent.sex);
  if (role === "father" && pSex !== "male"){
    setModalError(store, "El progenitor debe ser hombre para actuar como padre.");
    return;
  }
  if (role === "mother" && pSex !== "female"){
    setModalError(store, "El progenitor debe ser mujer para actuar como madre.");
    return;
  }

  function linkChild(childId){
    const currentParents = getParents(tree, childId);
    const fatherId = role === "father" ? parentId : currentParents.fatherId;
    const motherId = role === "mother" ? parentId : currentParents.motherId;
    const next = setParents(tree, childId, { fatherId, motherId });
    setTreeInState(store, next, {}, { persist: true });
    closeTreeModal(store);
  }

  if (vals.linkMode === "existing"){
    if (!vals.existingId){
      setModalError(store, "Selecciona una persona existente.");
      return;
    }
    if (!tree.people[vals.existingId]){
      setModalError(store, "Persona existente inválida.");
      return;
    }
    if (vals.existingId === parentId){
      setModalError(store, "No puedes ser tu propio hijo.");
      return;
    }
    if (isDescendant(tree, vals.existingId, parentId)){
      setModalError(store, "Relación inválida: el hijo seleccionado es ancestro del progenitor (ciclo).");
      return;
    }
    linkChild(vals.existingId);
    return;
  }

  const name = vals.name || "Hijo/a";
  const sex = safeSex(vals.sexRaw) || "male";
  const alive = vals.aliveRaw !== "dead";

  let nextTree = tree;
  const r = addPerson(nextTree, { name, sex, alive });
  nextTree = r.tree;

  const currentParents = getParents(nextTree, r.personId);
  const fatherId = role === "father" ? parentId : currentParents.fatherId;
  const motherId = role === "mother" ? parentId : currentParents.motherId;
  nextTree = setParents(nextTree, r.personId, { fatherId, motherId });

  setTreeInState(store, nextTree, {}, { persist: true });
  closeTreeModal(store);
}

function commitSetParent(store, childId, parentKind){
  const state = store.getState();
  const tree = getTreeFromState(state);

  if (!childId || !tree.people[childId]){
    setModalError(store, "Persona inválida.");
    return;
  }
  if (parentKind !== "father" && parentKind !== "mother"){
    setModalError(store, "Tipo de progenitor inválido.");
    return;
  }

  const vals = readModalValues();
  const fixedSex = parentKind === "father" ? "male" : "female";

  let nextTree = tree;
  const parents = getParents(nextTree, childId);
  const fatherId = parents.fatherId || null;
  const motherId = parents.motherId || null;

  const setRow = (pid) => {
    const nextFather = parentKind === "father" ? pid : fatherId;
    const nextMother = parentKind === "mother" ? pid : motherId;
    nextTree = setParents(nextTree, childId, { fatherId: nextFather, motherId: nextMother });
    setTreeInState(store, nextTree, { treeSelectedId: pid }, { persist: true });
    closeTreeModal(store);
  };

  if (vals.linkMode === "existing"){
    const pid = vals.existingId;
    if (!pid || !tree.people[pid]){
      setModalError(store, "Selecciona una persona existente para reusar.");
      return;
    }
    if (pid === childId){
      setModalError(store, "No puedes ser tu propio padre o madre.");
      return;
    }
    const p = tree.people[pid];
    const pSex = safeSex(p.sex);
    if (pSex && pSex !== fixedSex){
      setModalError(store, `Sexo inválido para ${parentKind === "father" ? "padre" : "madre"}.`);
      return;
    }
    if (isDescendant(tree, childId, pid)){
      setModalError(store, "Relación inválida: un progenitor no puede ser descendiente del hijo (ciclo).");
      return;
    }
    setRow(pid);
    return;
  }

  const name = vals.name || (parentKind === "father" ? "Padre" : "Madre");
  const alive = vals.aliveRaw !== "dead";
  const r = addPerson(nextTree, { name, sex: fixedSex, alive });
  nextTree = r.tree;
  setRow(r.personId);
}

function commitClearParent(store, childId, parentKind){
  const state = store.getState();
  const tree = getTreeFromState(state);

  if (!childId || !tree.people[childId]) return;
  if (parentKind !== "father" && parentKind !== "mother") return;

  const parents = getParents(tree, childId);
  const nextFather = parentKind === "father" ? null : (parents.fatherId || null);
  const nextMother = parentKind === "mother" ? null : (parents.motherId || null);

  const nextTree = setParents(tree, childId, { fatherId: nextFather, motherId: nextMother });
  setTreeInState(store, nextTree, {}, { persist: true });
}

function commitSetDeceased(store, personId){
  const state = store.getState();
  const tree = getTreeFromState(state);
  if (!tree.people[personId]) return;

  // Solo cambia el deceasedId. El sexo del causante sigue gobernado por Wizard cuando se importa.
  const next = { ...tree, deceasedId: personId };
  setTreeInState(store, next, { treeSelectedId: personId }, { persist: true });
}

function commitRemoveSpouseLink(store, personId, spouseId){
  const state = store.getState();
  const tree = getTreeFromState(state);
  if (!tree.people[personId] || !tree.people[spouseId]) return;

  const next = unlinkSpouses(tree, personId, spouseId);
  setTreeInState(store, next, {}, { persist: true });
}

function renderToolbar(state, tree, ui){
  const wizardNeedsImport = Boolean(state?.builder?.wizardNeedsImport);

  return `
    <section class="card card-pad row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
      <div class="row" style="gap:10px; align-items:center; flex-wrap:wrap;">
        <strong>Builder (Árbol)</strong>
        <span class="badge">Causante: ${escapeHtml(nameOf(tree.people[tree.deceasedId]))}</span>
      </div>

      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <button class="btn" type="button" data-tree-action="create-person">${renderIcon("userPlus")} Nueva persona</button>
        <button class="btn" type="button" data-tree-action="import-wizard" ${wizardNeedsImport ? "" : ""}>
          ${renderIcon("download")} Importar del wizard
        </button>
      </div>
    </section>
  `;
}

function renderSearch(ui){
  const q = normStr(ui.search || "");
  return `
    <section class="card card-pad row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
      <label class="field" style="flex:1; min-width:260px;">
        <span class="label">Buscar</span>
        <input class="input" id="tree-search" type="text" value="${escapeHtml(q)}" placeholder="Nombre o ID...">
      </label>
      <div class="muted" style="min-width:200px;">Tip: usa el panel de derivación para validar roles.</div>
    </section>
  `;
}

function renderDerivationPanel(tree, derived){
  const roleToPersons = derived?.roleToPersons && typeof derived.roleToPersons === "object" ? derived.roleToPersons : {};
  const heirs = Array.isArray(derived?.heirs) ? derived.heirs : [];
  const unmapped = Array.isArray(derived?.unmapped) ? derived.unmapped : [];
  const warnings = Array.isArray(derived?.warnings) ? derived.warnings : [];

  const roleRows = heirs.length ? heirs.map((h) => {
    const ids = Array.isArray(roleToPersons[h.role]) ? roleToPersons[h.role] : [];
    const people = ids.map((id) => {
      const p = tree.people[id];
      const label = p ? nameOf(p) : id;
      return `${escapeHtml(label)} (#${escapeHtml(id)})`;
    }).join(", ");
    return `
      <tr>
        <td><strong>${escapeHtml(labelForRole(h.role))}</strong><div class="muted">${escapeHtml(h.role)}</div></td>
        <td style="text-align:right;">${escapeHtml(String(h.count))}</td>
        <td class="muted">${people || "-"}</td>
      </tr>
    `;
  }).join("") : "";

  const unmappedHtml = unmapped.length ? `
    <div class="stack" style="gap:6px;">
      <div class="label">No mapeados (vivos, conectados, sin rol soportado)</div>
      <div class="muted">${unmapped.map((id) => {
        const p = tree.people[id];
        const label = p ? nameOf(p) : id;
        return `${escapeHtml(label)} (#${escapeHtml(id)})`;
      }).join(", ")}</div>
    </div>
  ` : "";

  const warningsHtml = warnings.length ? `
    <div class="stack" style="gap:6px;">
      <div class="label">Warnings</div>
      <ul class="muted" style="margin:0; padding-left:18px;">
        ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
      </ul>
    </div>
  ` : "";

  return `
    <section class="card card-pad stack" style="gap:10px;">
      <div class="row" style="justify-content:space-between; align-items:center; gap:10px;">
        <div class="stack">
          <strong>Derivación hacia roles del core</strong>
          <div class="muted">Fuente: árbol (tree). Solo roles soportados en MVP. Personas vivas cuentan como herederos.</div>
        </div>
        <span class="badge">${escapeHtml(String(heirs.reduce((a, x) => a + (x.count || 0), 0)))} herederos</span>
      </div>

      ${roleRows ? `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Rol</th>
                <th style="text-align:right;">Cantidad</th>
                <th>Evidencia por persona</th>
              </tr>
            </thead>
            <tbody>
              ${roleRows}
            </tbody>
          </table>
        </div>
      ` : `<div class="muted">Sin roles derivados. Importa del wizard o construye el árbol para obtener herederos.</div>`}

      ${warningsHtml}
      ${unmappedHtml}
    </section>
  `;
}

function renderPersonCard(tree, person){
  const isDeceased = person.id === tree.deceasedId;
  const parents = getParents(tree, person.id);
  const father = parents.fatherId ? tree.people[parents.fatherId] : null;
  const mother = parents.motherId ? tree.people[parents.motherId] : null;

  const spouses = getSpouses(tree, person.id).map((id) => tree.people[id]).filter(Boolean);
  const children = getChildren(tree, person.id).map((id) => tree.people[id]).filter(Boolean);

  const sexLabel = person.sex === "female" ? "Mujer" : "Hombre";
  const aliveLabel = person.alive ? "Vivo" : "Fallecido";

  const spouseHtml = spouses.length ? `
    <div class="stack" style="gap:6px;">
      <div class="row" style="justify-content:space-between; gap:10px; align-items:center;">
        <span class="label">Cónyuges</span>
        <button class="btn btn-sm" type="button" data-tree-action="add-spouse" data-person-id="${escapeHtml(person.id)}">Añadir</button>
      </div>
      <div class="stack" style="gap:6px;">
        ${spouses.map((s) => `
          <div class="row" style="justify-content:space-between; align-items:center; gap:10px;">
            <button class="link" type="button" data-tree-action="select" data-person-id="${escapeHtml(s.id)}">${escapeHtml(nameOf(s))}</button>
            <button class="btn btn-sm" type="button" data-tree-action="remove-spouse" data-person-id="${escapeHtml(person.id)}" data-spouse-id="${escapeHtml(s.id)}">Quitar</button>
          </div>
        `).join("")}
      </div>
    </div>
  ` : `
    <div class="row" style="justify-content:space-between; gap:10px; align-items:center;">
      <div class="stack">
        <span class="label">Cónyuge</span>
        <span class="muted">N/A</span>
      </div>
      <button class="btn btn-sm" type="button" data-tree-action="add-spouse" data-person-id="${escapeHtml(person.id)}">Añadir</button>
    </div>
  `;

  const childHtml = `
    <div class="stack" style="gap:6px;">
      <div class="row" style="justify-content:space-between; gap:10px; align-items:center;">
        <span class="label">Hijos</span>
        <button class="btn btn-sm" type="button" data-tree-action="add-child" data-person-id="${escapeHtml(person.id)}">Añadir</button>
      </div>
      ${children.length ? `
        <div class="muted">${children.map((c) => `<button class="link" type="button" data-tree-action="select" data-person-id="${escapeHtml(c.id)}">${escapeHtml(nameOf(c))}</button>`).join(", ")}</div>
      ` : `<div class="muted">N/A</div>`}
    </div>
  `;

  return `
    <article class="card card-pad stack" style="gap:12px;">
      <div class="row" style="justify-content:space-between; align-items:flex-start; gap:10px;">
        <div class="stack">
          <div class="row" style="gap:10px; align-items:center; flex-wrap:wrap;">
            <strong>${escapeHtml(nameOf(person))}</strong>
            <span class="badge">#${escapeHtml(person.id)}</span>
            ${isDeceased ? `<span class="badge badge-primary">CAUSANTE</span>` : ""}
          </div>
          <div class="muted">${escapeHtml(sexLabel)} - ${escapeHtml(aliveLabel)}</div>
        </div>

        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <button class="btn btn-sm" type="button" data-tree-action="edit" data-person-id="${escapeHtml(person.id)}">${renderIcon("edit")} Editar</button>
          ${!isDeceased ? `<button class="btn btn-sm" type="button" data-tree-action="set-deceased" data-person-id="${escapeHtml(person.id)}">Marcar causante</button>` : ""}
        </div>
      </div>

      <div class="grid2">
        <div class="stack" style="gap:6px;">
          <div class="row" style="justify-content:space-between; align-items:center; gap:10px;">
            <span class="label">Padres</span>
            <div class="row" style="gap:6px; flex-wrap:wrap;">
              <button class="btn btn-sm" type="button" data-tree-action="set-parent" data-person-id="${escapeHtml(person.id)}" data-parent-kind="father">Padre</button>
              <button class="btn btn-sm" type="button" data-tree-action="set-parent" data-person-id="${escapeHtml(person.id)}" data-parent-kind="mother">Madre</button>
            </div>
          </div>

          <div class="row" style="justify-content:space-between; gap:10px; align-items:center;">
            <div class="muted">
              Padre: ${father ? `<button class="link" type="button" data-tree-action="select" data-person-id="${escapeHtml(parents.fatherId)}">${escapeHtml(nameOf(father))}</button>` : "N/A"}
            </div>
            ${father ? `<button class="btn btn-sm" type="button" data-tree-action="clear-parent" data-person-id="${escapeHtml(person.id)}" data-parent-kind="father">Quitar</button>` : ""}
          </div>

          <div class="row" style="justify-content:space-between; gap:10px; align-items:center;">
            <div class="muted">
              Madre: ${mother ? `<button class="link" type="button" data-tree-action="select" data-person-id="${escapeHtml(parents.motherId)}">${escapeHtml(nameOf(mother))}</button>` : "N/A"}
            </div>
            ${mother ? `<button class="btn btn-sm" type="button" data-tree-action="clear-parent" data-person-id="${escapeHtml(person.id)}" data-parent-kind="mother">Quitar</button>` : ""}
          </div>
        </div>

        ${childHtml}
      </div>

      ${spouseHtml}
    </article>
  `;
}

export function renderBuilderTree(state){
  const tree = getTreeFromState(state);
  const builder = state?.builder || {};
  const ui = builder.ui || {};
  const selectedId = builder.treeSelectedId || tree.deceasedId;

  const genById = buildGenerationIndex(tree);
  const { groups, generations } = groupByGeneration(tree, genById);

  const search = normStr(ui.search || "").toLowerCase().trim();
  const filterIds = (ids) => {
    if (!search) return ids;
    return ids.filter((id) => {
      const p = tree.people[id];
      if (!p) return false;
      const n = nameOf(p).toLowerCase();
      return n.includes(search) || String(id).includes(search);
    });
  };

  const levelsHtml = generations.map((g) => {
    const ids = filterIds(groups[g] || []);
    if (!ids.length) return "";
    const title = g === 0 ? "Generación 0 (causante y cónyuges)" : (g < 0 ? `Ascendientes (gen ${g})` : `Descendientes (gen +${g})`);

    const cards = ids.map((id) => {
      const p = tree.people[id];
      if (!p) return "";
      return renderPersonCard(tree, p);
    }).join("");

    return `
      <section class="stack" style="gap:10px;">
        <h3 style="margin:0;">${escapeHtml(title)}</h3>
        <div class="grid3">${cards}</div>
      </section>
    `;
  }).join("");

  const selected = tree.people[selectedId] || tree.people[tree.deceasedId];

  return `
    <div class="stack" style="gap:12px;">
      ${renderToolbar(state, tree, ui)}
      ${renderSearch(ui)}
      ${renderDerivationPanel(tree, builder.treeDerivation || deriveHeirsByRoleFromTree(tree))}

      <section class="card card-pad stack" style="gap:12px;">
        <div class="row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <strong>Seleccionado</strong>
          <span class="muted">Click en nombres para seleccionar</span>
        </div>
        ${selected ? renderPersonCard(tree, { ...selected, id: selectedId }) : `<div class="muted">N/A</div>`}
      </section>

      ${levelsHtml}

      ${renderModal(tree, builder)}
    </div>
  `;
}

export function bindBuilderTreeEvents(store){
  const root = document.getElementById("page-builder");
  if (!root) return;

  const pendingImport = Boolean(store.getState()?.builder?.wizardPendingImport);
  if (pendingImport){
    store.setState((s) => ({
      ...s,
      builder: { ...(s.builder || {}), wizardPendingImport: false },
    }));
    openConfirmImportModal(store);
  }

  const toggleChildFields = () => {
    const isNew = document.getElementById("tree-child-mode-new")?.checked === true;
    document.querySelectorAll('[data-child-mode="new"]').forEach((el) => el.classList.toggle("is-hidden", !isNew));
    document.querySelectorAll('[data-child-mode="existing"]').forEach((el) => el.classList.toggle("is-hidden", isNew));
  };
  const toggleSpouseFields = () => {
    const isNew = document.getElementById("tree-spouse-mode-new")?.checked === true;
    document.querySelectorAll('[data-spouse-mode="new"]').forEach((el) => el.classList.toggle("is-hidden", !isNew));
    document.querySelectorAll('[data-spouse-mode="existing"]').forEach((el) => el.classList.toggle("is-hidden", isNew));
  };
  const toggleParentFields = () => {
    const isNew = document.getElementById("tree-parent-mode-new")?.checked === true;
    document.querySelectorAll('[data-parent-mode="new"]').forEach((el) => el.classList.toggle("is-hidden", !isNew));
    // En parent modal, el select está siempre presente, solo se habilita en existing
    const sel = document.getElementById("tree-modal-existing");
    if (sel) sel.disabled = isNew;
  };

  toggleChildFields();
  toggleSpouseFields();
  toggleParentFields();

  const childMode = document.getElementById("tree-child-mode-new");
  if (childMode){
    document.querySelectorAll('input[name="child_mode"]').forEach((el) => {
      el.addEventListener("change", toggleChildFields);
    });
  }
  const spouseMode = document.getElementById("tree-spouse-mode-new");
  if (spouseMode){
    document.querySelectorAll('input[name="spouse_mode"]').forEach((el) => {
      el.addEventListener("change", toggleSpouseFields);
    });
  }
  const parentMode = document.getElementById("tree-parent-mode-new");
  if (parentMode){
    document.querySelectorAll('input[name="parent_mode"]').forEach((el) => {
      el.addEventListener("change", toggleParentFields);
    });
  }

  const searchEl = document.getElementById("tree-search");
  if (searchEl){
    searchEl.addEventListener("input", () => {
      const val = searchEl.value;
      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          ui: { ...(s.builder.ui || {}), search: val },
        },
      }));
    });
  }

  root.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-tree-action]") : null;
    if (!btn) return;

    const action = btn.getAttribute("data-tree-action");
    const personId = btn.getAttribute("data-person-id");
    const spouseId = btn.getAttribute("data-spouse-id");
    const parentKind = btn.getAttribute("data-parent-kind");
    const modalPersonId = btn.getAttribute("data-modal-person-id");
    const modalParentId = btn.getAttribute("data-modal-parent-id");
    const modalChildId = btn.getAttribute("data-modal-child-id");
    const modalParentKind = btn.getAttribute("data-modal-parent-kind");

    if (action === "modal-cancel"){
      closeTreeModal(store);
      return;
    }

    if (action === "create-person"){
      openCreateModal(store);
      return;
    }
    if (action === "modal-create-person"){
      commitCreatePerson(store);
      return;
    }

    if (action === "edit" && personId){
      openEditModal(store, personId);
      return;
    }
    if (action === "modal-save-edit" && modalPersonId){
      commitSaveEdit(store, modalPersonId);
      return;
    }

    if (action === "select" && personId){
      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          treeSelectedId: personId,
        },
      }));
      return;
    }

    if (action === "add-spouse" && personId){
      openAddSpouseModal(store, personId);
      return;
    }
    if (action === "modal-add-spouse" && modalPersonId){
      commitAddSpouse(store, modalPersonId);
      return;
    }
    if (action === "remove-spouse" && personId && spouseId){
      commitRemoveSpouseLink(store, personId, spouseId);
      return;
    }

    if (action === "add-child" && personId){
      openAddChildModal(store, personId);
      return;
    }

    if (action === "set-parent" && personId && parentKind){
      openSetParentModal(store, personId, parentKind);
      return;
    }

    if (action === "clear-parent" && personId && parentKind){
      commitClearParent(store, personId, parentKind);
      return;
    }

    if (action === "set-deceased" && personId){
      commitSetDeceased(store, personId);
      return;
    }

    if (action === "modal-add-child" && modalParentId){
      commitAddChild(store, modalParentId);
      return;
    }

    if (action === "modal-save-parent" && modalChildId && modalParentKind){
      commitSetParent(store, modalChildId, modalParentKind);
      return;
    }

    if (action === "confirm-import"){
      importWizardToTree(store);
      closeTreeModal(store);
      return;
    }

    if (action === "import-wizard"){
      importWizardToTree(store);
      return;
    }
  });
}

export function wireBuilderTree(store){
  // Persistencia
  const persisted = loadState();
  if (persisted){
    store.setState((s) => ({ ...s, ...persisted }));
  }

  applyWizardSyncTree(store);

  // Guardar en cada setState con meta.persist
  const originalSetState = store.setState.bind(store);
  store.setState = (updater, meta) => {
    originalSetState(updater, meta);
    if (meta && meta.persist){
      persistState(store.getState());
    }
  };
}
