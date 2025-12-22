// public/ui/js/pages/builder_tree.js
import { openModal, closeModal } from "../ui/modal.js";
import {
  addPerson,
  ensureTree,
  getChildren,
  getParents,
  getSpouses,
  linkSpouses,
  sanitizeTree,
  setParents,
  unlinkSpouses,
  updatePerson,
} from "../domain/familyTree.js";

/*
  Tree Builder v2
  - Tree is the source of truth.
  - Wizard can be merged into the tree only via explicit user action (import).
  - Render by generations using BFS from deceasedId:
      parents: level -1, children: +1, spouses: same level.
  - Edits happen in a modal, committed on Save (no per-keystroke store writes).
*/

const MODAL_TYPES = Object.freeze({
  EDIT: "edit",
  CREATE: "create",
  ADD_CHILD: "add_child",
  ADD_SPOUSE: "add_spouse",
});

function normStr(v){
  return (v === null || v === undefined) ? "" : String(v);
}

function escapeHtml(raw){
  return normStr(raw)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeSex(sex){
  return sex === "male" || sex === "female" ? sex : null;
}

function labelSex(sex){
  if (sex === "male") return "Varón";
  if (sex === "female") return "Mujer";
  return "Sin sexo";
}

function labelAlive(alive){
  return alive ? "Vivo" : "Fallecido";
}

function nameOf(p){
  const n = (p && typeof p.name === "string") ? p.name.trim() : "";
  return n || "(sin nombre)";
}

function sexShort(sex){ return sex === "female" ? "F" : "M"; }
function aliveShort(alive){ return alive ? "vivo" : "fallecido"; }

function matchSearch(p, q){
  if (!q) return true;
  const hay = `${nameOf(p)}`.toLowerCase();
  return hay.includes(q);
}

function normalizeTreeUi(treeUi){
  const safe = treeUi && typeof treeUi === "object" ? treeUi : {};
  const collapsed = safe.collapsedLevels && typeof safe.collapsedLevels === "object" ? safe.collapsedLevels : {};
  return {
    search: typeof safe.search === "string" ? safe.search : "",
    collapsedLevels: collapsed,
    showDisconnected: safe.showDisconnected !== false,
    modal: safe.modal && typeof safe.modal === "object" ? safe.modal : null,
  };
}

function getTreeFromState(state){
  const builder = state && typeof state.builder === "object" ? state.builder : {};
  const wizard = state && typeof state.wizard === "object" ? state.wizard : null;
  const treeRaw = builder.tree ? builder.tree : null;
  const tree = ensureTree(sanitizeTree(treeRaw), wizard);
  return tree;
}

function getTreeUi(builder){
  const ui = builder && typeof builder === "object" && builder.treeUi && typeof builder.treeUi === "object" ? builder.treeUi : {};
  return {
    search: typeof ui.search === "string" ? ui.search : "",
    collapsedLevels: ui.collapsedLevels && typeof ui.collapsedLevels === "object" ? ui.collapsedLevels : {},
    showDisconnected: ui.showDisconnected !== false,
    modal: ui.modal && typeof ui.modal === "object" ? ui.modal : null,
  };
}

function setTreeUi(store, patch, meta = {}){
  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      treeUi: {
        ...(s.builder?.treeUi || {}),
        ...patch,
      },
    },
  }), meta);
}

function setModal(store, modal){
  setTreeUi(store, { modal }, { persist: false });
}

function setModalError(store, message){
  const state = store.getState();
  const builder = state.builder || {};
  const ui = getTreeUi(builder);
  const modal = ui.modal && typeof ui.modal === "object" ? { ...ui.modal, error: message } : null;
  setModal(store, modal);
}

function closeTreeModal(store){
  setTreeUi(store, { modal: null }, { persist: false });
}

function setTreeInState(store, nextTree, patch = {}, meta = {}){
  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      ...patch,
      tree: nextTree,
    },
  }), meta);
}

function selectPerson(store, personId){
  store.setState((s) => ({
    ...s,
    builder: { ...s.builder, treeSelectedId: personId },
  }), { persist: false });
}

function renderPill(label, kind = "neutral"){
  const cls = kind === "warn" ? "pill pill-warn" : kind === "ok" ? "pill pill-ok" : "pill";
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

function computeWizardHash(wizard){
  // Minimal stable hash for "wizard changed" banners.
  const w = wizard && typeof wizard === "object" ? wizard : {};
  const payload = {
    deceased_sex: safeSex(w.deceased_sex) || "",
    spouse_enabled: w.spouse?.enabled === true,
    spouse_count: Number.isFinite(Number(w.spouse?.count)) ? Math.trunc(Number(w.spouse.count)) : 0,
    father_alive: w.ascendants?.father?.alive === true,
    mother_alive: w.ascendants?.mother?.alive === true,
    sons: Number.isFinite(Number(w.descendants?.sons)) ? Math.trunc(Number(w.descendants.sons)) : 0,
    daughters: Number.isFinite(Number(w.descendants?.daughters)) ? Math.trunc(Number(w.descendants.daughters)) : 0,
  };
  try{
    return JSON.stringify(payload);
  }catch(_e){
    return String(Date.now());
  }
}

function applyWizardToTree(tree, wizard){
  const w = wizard && typeof wizard === "object" ? wizard : {};
  let t = ensureTree(tree, null);

  function clampInt(v, min, max){
    const n = Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
    return Math.min(max, Math.max(min, n));
  }

  function addPersonWrap(tt, patch){
    const res = addPerson(tt, patch);
    if (res && typeof res === "object" && res.tree && typeof res.personId === "string"){
      return { tree: res.tree, personId: res.personId };
    }
    // Backwards-compat if addPerson returns the tree directly
    if (res && typeof res === "object" && res.people && typeof res.nextId === "number"){
      return { tree: res, personId: String(Math.max(1, res.nextId - 1)) };
    }
    return { tree: tt, personId: null };
  }

  const wizardDeceasedSex = safeSex(w.deceased_sex);
  const peopleCount = Object.keys(t.people || {}).length;
  const hasAnyLinks = Object.keys(t.parents || {}).length > 0 || Object.keys(t.spouses || {}).length > 0;
  if (wizardDeceasedSex && peopleCount === 1 && !hasAnyLinks){
    t = updatePerson(t, t.deceasedId, { sex: wizardDeceasedSex });
  }

  // Parents (only add if wizard says alive=true and missing in tree)
  const existingParents = getParents(t, t.deceasedId);

  if (w.ascendants?.father?.alive === true && !existingParents.fatherId){
    const r = addPersonWrap(t, { name: "Padre", sex: "male", alive: true });
    t = r.tree;
    t = setParents(t, t.deceasedId, { fatherId: r.personId, motherId: existingParents.motherId });
  }

  if (w.ascendants?.mother?.alive === true && !existingParents.motherId){
    const now = getParents(t, t.deceasedId);
    const r = addPersonWrap(t, { name: "Madre", sex: "female", alive: true });
    t = r.tree;
    t = setParents(t, t.deceasedId, { fatherId: now.fatherId, motherId: r.personId });
  }

  // Spouses (only add to reach the wizard count, never delete)
  const spouseEnabled = w.spouse?.enabled === true;
  const spouseCount = clampInt(w.spouse?.count ?? 0, 0, 4);

  if (spouseEnabled && spouseCount > 0){
    const d = t.people[t.deceasedId];
    const dSex = safeSex(d?.sex) || wizardDeceasedSex;

    const already = getSpouses(t, t.deceasedId).length;

    if (dSex === "male"){
      const need = Math.max(0, spouseCount - already);
      for (let i = 0; i < need; i++){
        const r = addPersonWrap(t, { name: `Esposa ${already + i + 1}`, sex: "female", alive: true });
        t = r.tree;
        if (r.personId){
          t = linkSpouses(t, t.deceasedId, r.personId);
        }
      }
    }else if (dSex === "female"){
      const target = spouseCount > 0 ? 1 : 0;
      const need = Math.max(0, target - already);
      for (let i = 0; i < need; i++){
        const r = addPersonWrap(t, { name: "Esposo", sex: "male", alive: true });
        t = r.tree;
        if (r.personId){
          t = linkSpouses(t, t.deceasedId, r.personId);
        }
      }
    }
  }

  // Descendants (only add to reach wizard counts, never delete)
  const sons = clampInt(w.descendants?.sons ?? 0, 0, 20);
  const daughters = clampInt(w.descendants?.daughters ?? 0, 0, 20);

  const d = t.people[t.deceasedId];
  const dSex = safeSex(d?.sex) || wizardDeceasedSex;

  const childFatherId = dSex === "male" ? t.deceasedId : null;
  const childMotherId = dSex === "female" ? t.deceasedId : null;

  const existingChildren = getChildren(t, t.deceasedId);
  const existingSons = existingChildren.filter((id) => t.people[id]?.sex === "male").length;
  const existingDaughters = existingChildren.filter((id) => t.people[id]?.sex === "female").length;

  const needSons = Math.max(0, sons - existingSons);
  const needDaughters = Math.max(0, daughters - existingDaughters);

  for (let i = 0; i < needSons; i++){
    const r = addPersonWrap(t, { name: `Hijo ${existingSons + i + 1}`, sex: "male", alive: true });
    t = r.tree;
    if (r.personId){
      t = setParents(t, r.personId, { fatherId: childFatherId, motherId: childMotherId });
    }
  }

  for (let i = 0; i < needDaughters; i++){
    const r = addPersonWrap(t, { name: `Hija ${existingDaughters + i + 1}`, sex: "female", alive: true });
    t = r.tree;
    if (r.personId){
      t = setParents(t, r.personId, { fatherId: childFatherId, motherId: childMotherId });
    }
  }

  return t;
}

function buildGenerationIndex(tree){
  const gen = new Map();

  const q = [tree.deceasedId];
  gen.set(tree.deceasedId, 0);

  while (q.length){
    const id = q.shift();
    const g = gen.get(id);

    // spouses: same generation
    for (const sid of getSpouses(tree, id)){
      if (!tree.people[sid]) continue;
      if (!gen.has(sid)){
        gen.set(sid, g);
        q.push(sid);
      }
    }

    // parents: -1
    const { fatherId, motherId } = getParents(tree, id);
    if (fatherId && tree.people[fatherId] && !gen.has(fatherId)){
      gen.set(fatherId, g - 1);
      q.push(fatherId);
    }
    if (motherId && tree.people[motherId] && !gen.has(motherId)){
      gen.set(motherId, g - 1);
      q.push(motherId);
    }

    // children: +1
    const kids = getChildren(tree, id);
    for (const cid of kids){
      if (!tree.people[cid]) continue;
      if (!gen.has(cid)){
        gen.set(cid, g + 1);
        q.push(cid);
      }
    }
  }

  return gen;
}

function groupByGeneration(tree, genMap){
  const groups = new Map(); // gen -> array of person objects
  for (const [id, g] of genMap.entries()){
    const p = tree.people[id];
    if (!p) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ ...p, id });
  }

  // sort inside groups by name then id
  for (const arr of groups.values()){
    arr.sort((a, b) => {
      const an = nameOf(a).toLowerCase();
      const bn = nameOf(b).toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  return groups;
}

function renderPersonCard(tree, person, { selectedId }){
  const isSelected = selectedId === person.id;
  const isDeceased = person.id === tree.deceasedId;

  const pills = [
    renderPill(`${sexShort(person.sex)} | ${aliveShort(person.alive)}`, person.alive ? "ok" : "warn"),
    isDeceased ? renderPill("CAUSANTE", "warn") : "",
  ].filter(Boolean).join(" ");

  const parents = getParents(tree, person.id);
  const father = parents.fatherId ? tree.people[parents.fatherId] : null;
  const mother = parents.motherId ? tree.people[parents.motherId] : null;

  const spouses = getSpouses(tree, person.id).map((sid) => ({ id: sid, p: tree.people[sid] })).filter((x) => x.p);
  const children = getChildren(tree, person.id).map((cid) => ({ id: cid, p: tree.people[cid] })).filter((x) => x.p);

  return `
    <div class="tree-card card card-pad ${isSelected ? "is-selected" : ""}">
      <div class="row" style="justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <div class="row" style="gap:10px; align-items:center;">
            <button class="link" type="button" data-tree-action="select" data-person-id="${escapeHtml(person.id)}">
              <strong>${escapeHtml(nameOf(person))}</strong>
            </button>
            <span class="muted">#${escapeHtml(person.id)}</span>
          </div>
          <div style="margin-top:6px;">${pills}</div>
        </div>

        <div class="row" style="gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="btn" type="button" data-tree-action="edit" data-person-id="${escapeHtml(person.id)}">Editar</button>
          <button class="btn" type="button" data-tree-action="add-spouse" data-person-id="${escapeHtml(person.id)}">Añadir cónyuge</button>
          <button class="btn" type="button" data-tree-action="add-child" data-person-id="${escapeHtml(person.id)}">Añadir hijo</button>
          ${!isDeceased ? `<button class="btn" type="button" data-tree-action="set-deceased" data-person-id="${escapeHtml(person.id)}">Marcar como causante</button>` : ""}
        </div>
      </div>

      <div class="grid3" style="margin-top:12px; gap:10px;">
        <div class="stack" style="gap:6px;">
          <div><span class="label">Padres</span></div>
          <div class="muted">
            Padre: ${father ? `<button class="link" type="button" data-tree-action="select" data-person-id="${escapeHtml(parents.fatherId)}">${escapeHtml(nameOf(father))}</button>` : "N/A"}
          </div>
          <div class="muted">
            Madre: ${mother ? `<button class="link" type="button" data-tree-action="select" data-person-id="${escapeHtml(parents.motherId)}">${escapeHtml(nameOf(mother))}</button>` : "N/A"}
          </div>
        </div>

        <div class="stack" style="gap:6px;">
          <div><span class="label">Cónyuges</span></div>
          ${spouses.length ? spouses.map((s) => `
            <div class="row" style="justify-content:space-between; gap:10px;">
              <button class="link" type="button" data-tree-action="select" data-person-id="${escapeHtml(s.id)}">${escapeHtml(nameOf(s.p))}</button>
              <button class="btn btn-sm" type="button" data-tree-action="unlink-spouse" data-person-id="${escapeHtml(person.id)}" data-other-id="${escapeHtml(s.id)}">Desvincular</button>
            </div>
          `).join("") : `<div class="muted">Sin cónyuges.</div>`}
        </div>

        <div class="stack" style="gap:6px;">
          <div><span class="label">Hijos</span></div>
          ${children.length ? children.map((c) => `
            <div class="row" style="justify-content:space-between; gap:10px;">
              <button class="link" type="button" data-tree-action="select" data-person-id="${escapeHtml(c.id)}">${escapeHtml(nameOf(c.p))}</button>
            </div>
          `).join("") : `<div class="muted">Sin hijos.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderLevelHeader(level, { collapsed }){
  const isCollapsed = collapsed[String(level)] === true;
  const label =
    level === 0 ? "Generación 0 (causante y cónyuges)" :
    level < 0 ? `Ascendientes (nivel ${level})` :
    `Descendientes (nivel +${level})`;

  return `
    <div class="row" style="justify-content:space-between; align-items:center;">
      <div class="row" style="gap:10px; align-items:center;">
        <strong>${escapeHtml(label)}</strong>
        <span class="muted">(${isCollapsed ? "plegado" : "desplegado"})</span>
      </div>
      <button class="btn" type="button" data-tree-action="toggle-level" data-level="${escapeHtml(String(level))}">
        ${isCollapsed ? "Desplegar" : "Plegar"}
      </button>
    </div>
  `;
}

function renderLevel(tree, level, persons, ui, selectedId){
  const isCollapsed = ui.collapsedLevels[String(level)] === true;

  const cards = isCollapsed
    ? `<div class="muted">Nivel plegado.</div>`
    : persons.map((p) => renderPersonCard(tree, p, { selectedId })).join("");

  return `
    <div class="card card-pad stack" style="gap:12px;">
      ${renderLevelHeader(level, { collapsed: ui.collapsedLevels })}
      ${cards}
    </div>
  `;
}

function renderDisconnected(tree, genMap, ui, selectedId, q){
  if (ui.showDisconnected !== true) return "";

  const allIds = Object.keys(tree.people || {});
  const disconnected = allIds
    .filter((id) => !genMap.has(id))
    .map((id) => ({ ...tree.people[id], id }))
    .filter((p) => matchSearch(p, q));

  if (!disconnected.length){
    return `<div class="muted">No hay nodos desconectados.</div>`;
  }

  return `
    <div class="card card-pad stack" style="gap:10px;">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <strong>Nodos no conectados</strong>
        <span class="muted">(${disconnected.length})</span>
      </div>
      ${disconnected.map((p) => renderPersonCard(tree, p, { selectedId })).join("")}
    </div>
  `;
}

function modalBase({ title, body, error }){
  return `
    <div class="tree-modal-backdrop" id="tree-modal-backdrop" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="tree-modal card card-pad">
        <div class="row" style="justify-content:space-between; align-items:center;">
          <strong>${escapeHtml(title)}</strong>
          <button class="btn" type="button" data-tree-action="modal-cancel">Cerrar</button>
        </div>
        <div class="tree-modal-body" style="margin-top:12px;">
          ${error ? `<div class="notice warn" style="margin-bottom:10px;">${escapeHtml(error)}</div>` : ""}
          ${body}
        </div>
      </div>
    </div>
  `;
}

function renderModalCreatePerson(){
  const body = `
    <div class="grid2">
      <label class="field">
        <span class="label">Nombre</span>
        <input class="input" type="text" id="tree-modal-name" value="">
      </label>
      <label class="field">
        <span class="label">Sexo</span>
        <select class="input" id="tree-modal-sex">
          <option value="male" selected>male</option>
          <option value="female">female</option>
        </select>
      </label>
      <label class="field">
        <span class="label">Estado</span>
        <select class="input" id="tree-modal-alive">
          <option value="alive" selected>vivo</option>
          <option value="dead">fallecido</option>
        </select>
      </label>
    </div>

    <div class="row" style="justify-content:flex-end; margin-top:12px; flex-wrap:wrap; gap:10px;">
      <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" type="button" data-tree-action="modal-save">Crear</button>
    </div>
  `;
  return modalBase({ title: "Crear persona", body, error: null });
}

function renderModalEdit(tree, personId){
  const p = tree.people[personId];
  const disabled = personId === tree.deceasedId ? "disabled" : "";
  const body = `
    <div class="grid2">
      <label class="field">
        <span class="label">Nombre</span>
        <input class="input" type="text" id="tree-modal-name" value="${escapeHtml(p.name || "")}">
      </label>
      <label class="field">
        <span class="label">Sexo</span>
        <select class="input" id="tree-modal-sex" ${disabled}>
          <option value="male" ${p.sex === "male" ? "selected" : ""}>male</option>
          <option value="female" ${p.sex === "female" ? "selected" : ""}>female</option>
        </select>
      </label>
      <label class="field">
        <span class="label">Estado</span>
        <select class="input" id="tree-modal-alive" ${disabled}>
          <option value="alive" ${p.alive ? "selected" : ""}>vivo</option>
          <option value="dead" ${!p.alive ? "selected" : ""}>fallecido</option>
        </select>
      </label>
    </div>

    ${personId === tree.deceasedId ? `<div class="notice warn" style="margin-top:10px;">El causante siempre se marca como fallecido.</div>` : ""}

    <div class="row" style="justify-content:flex-end; margin-top:12px; flex-wrap:wrap; gap:10px;">
      <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" type="button" data-tree-action="modal-save" data-modal-person-id="${escapeHtml(personId)}">Guardar</button>
    </div>
  `;
  return modalBase({ title: `Editar: ${nameOf(p)} (#${personId})`, body, error: null });
}

function renderModalAddSpouse(tree, personId){
  const p = tree.people[personId];
  const existing = Object.keys(tree.people || {}).filter((id) => id !== personId).map((id) => ({ ...tree.people[id], id }));

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
            <span>Vincular existente</span>
          </label>
        </div>
      </div>

      <div data-spouse-mode="new">
        <div class="grid2">
          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" type="text" id="tree-modal-name" value="">
          </label>
          <label class="field">
            <span class="label">Sexo</span>
            <select class="input" id="tree-modal-sex">
              <option value="male" selected>male</option>
              <option value="female">female</option>
            </select>
          </label>
          <label class="field">
            <span class="label">Estado</span>
            <select class="input" id="tree-modal-alive">
              <option value="alive" selected>vivo</option>
              <option value="dead">fallecido</option>
            </select>
          </label>
        </div>
      </div>

      <div data-spouse-mode="existing" class="is-hidden">
        <label class="field">
          <span class="label">Persona existente</span>
          <select class="input" id="tree-modal-existing">
            <option value="">Selecciona...</option>
            ${existing.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(nameOf(x))} (#${escapeHtml(x.id)})</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="row" style="justify-content:flex-end; margin-top:6px; flex-wrap:wrap; gap:10px;">
        <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" type="button" data-tree-action="modal-add-spouse" data-modal-person-id="${escapeHtml(personId)}">Añadir</button>
      </div>
    </div>
  `;
  return modalBase({ title: "Añadir cónyuge", body, error: null });
}

function renderModalAddChild(tree, parentId){
  const p = tree.people[parentId];
  const existing = Object.keys(tree.people || {}).filter((id) => id !== parentId).map((id) => ({ ...tree.people[id], id }));

  const body = `
    <div class="stack" style="gap:10px;">
      <div class="muted">Añadir hijo a: <strong>${escapeHtml(nameOf(p))}</strong></div>

      <div class="card card-pad">
        <div class="row" style="gap:10px; flex-wrap:wrap;">
          <label class="row" style="gap:8px;">
            <input type="radio" name="child_mode" value="new" checked id="tree-child-mode-new">
            <span>Crear nuevo</span>
          </label>
          <label class="row" style="gap:8px;">
            <input type="radio" name="child_mode" value="existing" id="tree-child-mode-existing">
            <span>Vincular existente</span>
          </label>
        </div>
      </div>

      <div class="card card-pad">
        <div class="row" style="gap:10px; flex-wrap:wrap;">
          <label class="field" style="min-width:220px;">
            <span class="label">Este progenitor actúa como</span>
            <select class="input" id="tree-modal-parent-as">
              <option value="auto" selected>Auto (según sexo)</option>
              <option value="father">Padre</option>
              <option value="mother">Madre</option>
            </select>
          </label>
        </div>
      </div>

      <div data-child-mode="new">
        <div class="grid2">
          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" type="text" id="tree-modal-name" value="">
          </label>
          <label class="field">
            <span class="label">Sexo</span>
            <select class="input" id="tree-modal-sex">
              <option value="male" selected>male</option>
              <option value="female">female</option>
            </select>
          </label>
          <label class="field">
            <span class="label">Estado</span>
            <select class="input" id="tree-modal-alive">
              <option value="alive" selected>vivo</option>
              <option value="dead">fallecido</option>
            </select>
          </label>
        </div>
      </div>

      <div data-child-mode="existing" class="is-hidden">
        <label class="field">
          <span class="label">Persona existente</span>
          <select class="input" id="tree-modal-existing">
            <option value="">Selecciona...</option>
            ${existing.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(nameOf(x))} (#${escapeHtml(x.id)})</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="row" style="justify-content:flex-end; margin-top:6px; flex-wrap:wrap; gap:10px;">
        <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" type="button" data-tree-action="modal-add-child" data-modal-parent-id="${escapeHtml(parentId)}">Añadir</button>
      </div>
    </div>
  `;
  return modalBase({ title: "Añadir hijo", body, error: null });
}

function renderModal(tree, ui){
  const modal = ui.modal;
  if (!modal) return "";

  if (modal.type === MODAL_TYPES.CREATE){
    return renderModalCreatePerson();
  }
  if (modal.type === MODAL_TYPES.EDIT){
    return renderModalEdit(tree, modal.personId);
  }
  if (modal.type === MODAL_TYPES.ADD_SPOUSE){
    return renderModalAddSpouse(tree, modal.personId);
  }
  if (modal.type === MODAL_TYPES.ADD_CHILD){
    return renderModalAddChild(tree, modal.parentId);
  }

  return modalBase({ title: "Modal inválido", body: `<div class="muted">Modal inválido</div>`, error: null });
}

function readModalValues(){
  const name = document.getElementById("tree-modal-name")?.value ?? "";
  const sexRaw = document.getElementById("tree-modal-sex")?.value ?? "";
  const aliveRaw = document.getElementById("tree-modal-alive")?.value ?? "alive";
  const existingId = document.getElementById("tree-modal-existing")?.value ?? "";
  const parentAs = document.getElementById("tree-modal-parent-as")?.value ?? "auto";

  const childModeNew = document.getElementById("tree-child-mode-new");
  const spouseModeNew = document.getElementById("tree-spouse-mode-new");

  const linkModeChild = childModeNew ? (childModeNew.checked ? "new" : "existing") : "new";
  const linkModeSpouse = spouseModeNew ? (spouseModeNew.checked ? "new" : "existing") : "new";

  const linkMode = (childModeNew || spouseModeNew) ? (childModeNew ? linkModeChild : linkModeSpouse) : "new";

  return {
    name: normStr(name).trim(),
    sexRaw: normStr(sexRaw).trim(),
    alive: aliveRaw !== "dead",
    existingId: normStr(existingId).trim() || null,
    parentAs: normStr(parentAs).trim(),
    linkMode,
  };
}

function openCreateModal(store){
  setModal(store, { type: MODAL_TYPES.CREATE, error: null });
}

function openEditModal(store, personId){
  if (!personId) return;
  setModal(store, { type: MODAL_TYPES.EDIT, personId, error: null });
}

function openAddSpouseModal(store, personId){
  if (!personId) return;
  setModal(store, { type: MODAL_TYPES.ADD_SPOUSE, personId, error: null });
}

function openAddChildModal(store, parentId){
  if (!parentId) return;
  setModal(store, { type: MODAL_TYPES.ADD_CHILD, parentId, error: null });
}

function commitCreatePerson(store){
  const state = store.getState();
  const tree = getTreeFromState(state);

  const vals = readModalValues();
  const sex = safeSex(vals.sexRaw) || "male";

  const res = addPerson(tree, { name: vals.name || "Persona", sex, alive: !!vals.alive });
  const nextTree = (res && typeof res === "object" && res.tree) ? res.tree : res;
  const newId = (res && typeof res === "object" && typeof res.personId === "string") ? res.personId : null;

  setTreeInState(store, nextTree, { treeSelectedId: newId }, { persist: true });
  closeTreeModal(store);
}

function commitSaveEdit(store, personId){
  const state = store.getState();
  const tree = getTreeFromState(state);

  if (!personId || !tree.people[personId]){
    setModalError(store, "Persona inválida.");
    return;
  }

  const vals = readModalValues();

  // For deceased: lock alive=false, sex locked by UI in modal
  const isDeceased = personId === tree.deceasedId;

  const patch = {
    name: vals.name || tree.people[personId].name,
    alive: isDeceased ? false : !!vals.alive,
  };

  const sex = safeSex(vals.sexRaw);
  if (!isDeceased && sex) patch.sex = sex;

  const nextTree = updatePerson(tree, personId, patch);

  setTreeInState(store, nextTree, { treeSelectedId: personId }, { persist: true });
  closeTreeModal(store);
}

function commitAddSpouse(store, personId){
  const state = store.getState();
  const tree = getTreeFromState(state);

  const vals = readModalValues();
  if (!personId || !tree.people[personId]){
    setModalError(store, "Persona inválida.");
    return;
  }

  let nextTree = tree;

  if (vals.linkMode === "existing"){
    if (!vals.existingId || !tree.people[vals.existingId]){
      setModalError(store, "Selecciona una persona existente para reusar.");
      return;
    }
    if (vals.existingId === personId){
      setModalError(store, "No puedes ser tu propio cónyuge.");
      return;
    }
    const spouses = getSpouses(nextTree, personId);
    if (spouses.includes(vals.existingId)){
      setModalError(store, "Estas dos personas ya están enlazadas como cónyuges.");
      return;
    }
    nextTree = linkSpouses(nextTree, personId, vals.existingId);
    setTreeInState(store, nextTree, { treeSelectedId: vals.existingId }, { persist: true });
    closeTreeModal(store);
    return;
  }

  const sex = safeSex(vals.sexRaw) || "male";
  const res = addPerson(nextTree, { name: vals.name || "Cónyuge", sex, alive: !!vals.alive });
  nextTree = (res && typeof res === "object" && res.tree) ? res.tree : res;
  const newId = (res && typeof res === "object" && typeof res.personId === "string") ? res.personId : null;

  if (!newId || !nextTree.people?.[newId]){
    setModalError(store, "No se pudo crear el cónyuge.");
    return;
  }

  nextTree = linkSpouses(nextTree, personId, newId);

  setTreeInState(store, nextTree, { treeSelectedId: newId }, { persist: true });
  closeTreeModal(store);
}

function commitAddChild(store, parentId){
  const state = store.getState();
  const tree = getTreeFromState(state);

  if (!parentId || !tree.people[parentId]){
    setModalError(store, "Progenitor inválido.");
    return;
  }

  const vals = readModalValues();
  const parent = tree.people[parentId];

  let role = vals.parentAs;
  if (role === "auto"){
    const sx = safeSex(parent.sex);
    if (sx === "male") role = "father";
    else if (sx === "female") role = "mother";
    else role = "";
  }

  if (role !== "father" && role !== "mother"){
    setModalError(store, "Define el sexo del progenitor o elige si actúa como padre o madre.");
    return;
  }

  let nextTree = tree;

  const linkChild = (childId) => {
    const existing = getParents(nextTree, childId);
    const nextParents = {
      fatherId: role === "father" ? parentId : existing.fatherId,
      motherId: role === "mother" ? parentId : existing.motherId,
    };
    nextTree = setParents(nextTree, childId, nextParents);
    setTreeInState(store, nextTree, { treeSelectedId: childId }, { persist: true });
    closeTreeModal(store);
  };

  if (vals.linkMode === "existing"){
    if (!vals.existingId || !tree.people[vals.existingId]){
      setModalError(store, "Selecciona una persona existente para reusar.");
      return;
    }
    if (vals.existingId === parentId){
      setModalError(store, "No puedes ser tu propio hijo.");
      return;
    }
    linkChild(vals.existingId);
    return;
  }

  const sex = safeSex(vals.sexRaw) || "male";
  const res = addPerson(nextTree, { name: vals.name || "Hijo/a", sex, alive: !!vals.alive });
  nextTree = (res && typeof res === "object" && res.tree) ? res.tree : res;
  const newId = (res && typeof res === "object" && typeof res.personId === "string") ? res.personId : null;

  if (!newId || !nextTree.people?.[newId]){
    setModalError(store, "No se pudo crear el hijo.");
    return;
  }

  linkChild(newId);
}

function commitSetDeceased(store, personId){
  const state = store.getState();
  const tree = getTreeFromState(state);

  if (!personId || !tree.people[personId]) return;

  // Switch deceasedId and force alive=false for new deceased
  let nextTree = { ...tree, deceasedId: personId };
  nextTree = updatePerson(nextTree, personId, { alive: false });

  setTreeInState(store, nextTree, { treeSelectedId: personId }, { persist: true });
}

function commitUnlinkSpouse(store, personId, otherId){
  const state = store.getState();
  const tree = getTreeFromState(state);

  if (!personId || !otherId) return;

  const nextTree = unlinkSpouses(tree, personId, otherId);
  setTreeInState(store, nextTree, { treeSelectedId: personId }, { persist: true });
}

export function importWizardToTree(store){
  store.setState((s) => {
    const wizard = s.wizard || {};
    const builder = s.builder || {};
    const tree = ensureTree(sanitizeTree(builder.tree), null);

    const merged = applyWizardToTree(tree, wizard);

    return {
      ...s,
      builder: {
        ...builder,
        mode: "tree",
        tree: merged,
        treeSelectedId: merged.deceasedId,
        fromWizardApplied: true,
        wizardHashApplied: computeWizardHash(wizard),
      },
    };
  }, { persist: true });
}

function renderToolbar(state, tree, ui){
  const wizard = state.wizard || {};
  const wizardHash = computeWizardHash(wizard);
  const appliedHash = state.builder?.wizardHashApplied || null;
  const changed = appliedHash && wizardHash !== appliedHash;

  return `
    <div class="row" style="justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <div class="row" style="gap:10px; flex-wrap:wrap;">
        <button class="btn btn-primary" type="button" data-tree-action="new-person">Nueva persona</button>
        <button class="btn" type="button" data-tree-action="toggle-disconnected">
          ${ui.showDisconnected ? "Ocultar no conectados" : "Mostrar no conectados"}
        </button>
      </div>

      <div class="row" style="gap:10px; flex-wrap:wrap; align-items:center;">
        ${changed ? `<span class="pill pill-warn">Wizard cambiado</span>` : ""}
        <button class="btn" type="button" data-tree-action="import-wizard">Importar del wizard</button>
        <button class="btn" type="button" data-tree-action="reset-tree">Reset árbol</button>
      </div>
    </div>
  `;
}

function renderSearch(ui){
  return `
    <div class="row" style="gap:10px; align-items:center; flex-wrap:wrap;">
      <label class="field" style="min-width:260px;">
        <span class="label">Buscar</span>
        <input class="input" id="tree-search" type="text" placeholder="Nombre..." value="${escapeHtml(ui.search)}">
      </label>
    </div>
  `;
}

export function renderBuilderTree(state){
  const tree = getTreeFromState(state);
  const builder = state.builder || {};
  const ui = getTreeUi(builder);

  const selectedId = builder.treeSelectedId || tree.deceasedId;
  const q = ui.search.trim().toLowerCase();

  const genMap = buildGenerationIndex(tree);
  const groups = groupByGeneration(tree, genMap);

  const gens = Array.from(groups.keys()).sort((a, b) => a - b);

  const levelsHtml = gens.map((g) => {
    const persons = groups.get(g).filter((p) => matchSearch(p, q));
    if (!persons.length) return "";
    return renderLevel(tree, g, persons, ui, selectedId);
  }).join("");

  const disconnectedHtml = renderDisconnected(tree, genMap, ui, selectedId, q);
  const modalHtml = renderModal(tree, ui);

  return `
    <div class="stack" style="gap:12px;">
      ${renderToolbar(state, tree, ui)}
      ${renderSearch(ui)}
      <div id="builder-tree-root" class="stack" style="gap:12px;">
        ${levelsHtml}
        ${disconnectedHtml}
      </div>
      ${modalHtml}
    </div>
  `;
}

export function bindBuilderTreeEvents(store){
  // Toggle modal mode blocks
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

  toggleChildFields();
  toggleSpouseFields();

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

  const searchEl = document.getElementById("tree-search");
  if (searchEl){
    searchEl.addEventListener("input", (e) => {
      const value = normStr(e.target?.value).trimStart();
      setTreeUi(store, { search: value }, { persist: true });
    });
  }

  const root = document.getElementById("builder-tree-root");
  if (root){
    root.addEventListener("click", (e) => {
      const btn = e.target?.closest("[data-tree-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-tree-action");
      const personId = btn.getAttribute("data-person-id");
      const level = btn.getAttribute("data-level");
      const otherId = btn.getAttribute("data-other-id");
      const modalPersonId = btn.getAttribute("data-modal-person-id");
      const modalParentId = btn.getAttribute("data-modal-parent-id");

      if (action === "select" && personId){
        selectPerson(store, personId);
        return;
      }

      if (action === "toggle-level" && level !== null){
        store.setState((s) => {
          const ui = getTreeUi(s.builder || {});
          const k = String(level);
          const isCollapsed = ui.collapsedLevels[k] === true;
          const next = { ...(s.builder?.treeUi?.collapsedLevels || {}) };
          next[k] = !isCollapsed;
          return {
            ...s,
            builder: {
              ...s.builder,
              treeUi: { ...(s.builder?.treeUi || {}), collapsedLevels: next },
            },
          };
        }, { persist: true });
        return;
      }

      if (action === "toggle-disconnected"){
        store.setState((s) => ({
          ...s,
          builder: {
            ...s.builder,
            treeUi: {
              ...(s.builder?.treeUi || {}),
              showDisconnected: !(s.builder?.treeUi?.showDisconnected !== false),
            },
          },
        }), { persist: true });
        return;
      }

      if (action === "new-person"){
        openCreateModal(store);
        return;
      }

      if (action === "edit" && personId){
        openEditModal(store, personId);
        return;
      }

      if (action === "add-spouse" && personId){
        openAddSpouseModal(store, personId);
        return;
      }

      if (action === "add-child" && personId){
        openAddChildModal(store, personId);
        return;
      }

      if (action === "set-deceased" && personId){
        commitSetDeceased(store, personId);
        return;
      }

      if (action === "unlink-spouse" && personId && otherId){
        commitUnlinkSpouse(store, personId, otherId);
        return;
      }

      if (action === "import-wizard"){
        openModal(store, {
          title: "Importar del wizard",
          body: "Esto hará un merge controlado del wizard al árbol actual. No es automático. ¿Continuar?",
          confirmAction: "builder-tree-import-wizard",
          confirmLabel: "Importar",
        });
        return;
      }

      if (action === "reset-tree"){
        openModal(store, {
          title: "Reset del árbol",
          body: "Se borrará el árbol actual del builder (solo UI). ¿Continuar?",
          confirmAction: "builder-tree-reset",
          confirmLabel: "Reset",
        });
        return;
      }

      if (action === "modal-cancel"){
        closeTreeModal(store);
        return;
      }

      if (action === "modal-save"){
        const state = store.getState();
        const ui = getTreeUi(state.builder || {});
        if (!ui.modal){
          closeTreeModal(store);
          return;
        }
        if (ui.modal.type === MODAL_TYPES.CREATE){
          commitCreatePerson(store);
          return;
        }
        if (ui.modal.type === MODAL_TYPES.EDIT && modalPersonId){
          commitSaveEdit(store, modalPersonId);
          return;
        }
        closeTreeModal(store);
        return;
      }

      if (action === "modal-add-spouse" && modalPersonId){
        commitAddSpouse(store, modalPersonId);
        return;
      }

      if (action === "modal-add-child" && modalParentId){
        commitAddChild(store, modalParentId);
        return;
      }
    });
  }

  const backdrop = document.getElementById("tree-modal-backdrop");
  if (backdrop){
    backdrop.addEventListener("click", (e) => {
      if (e.target && e.target.id === "tree-modal-backdrop"){
        closeTreeModal(store);
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){
      const state = store.getState();
      const ui = getTreeUi(state.builder || {});
      if (ui.modal) closeTreeModal(store);
    }
  }, { once: true });
}
