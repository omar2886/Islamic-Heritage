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

function computeWizardHash(wizard){
  // Minimal stable hash for "wizard changed" banners.
  const w = wizard && typeof wizard === "object" ? wizard : {};
  const payload = {
    deceased_sex: w.deceased_sex || null,
    parents: w.parents || null,
    spouse: w.spouse || null,
    descendants: w.descendants || null,
  };
  try{
    return JSON.stringify(payload);
  }catch(_e){
    return String(Date.now());
  }
}

function applyWizardToTree(tree, wizard){
  const w = wizard && typeof wizard === "object" ? wizard : {};
  let t = ensureTree(tree, w);

  // Parents
  const parents = w.parents && typeof w.parents === "object" ? w.parents : {};
  const existingParents = getParents(t, t.deceasedId);

  if (parents.father === true && !existingParents.fatherId){
    const fatherId = `p${t.nextId}`;
    t = addPerson(t, { name: "Padre", sex: "male", alive: true });
    t = setParents(t, t.deceasedId, { fatherId, motherId: existingParents.motherId });
  }

  if (parents.mother === true && !existingParents.motherId){
    const now = getParents(t, t.deceasedId);
    const motherId = `p${t.nextId}`;
    t = addPerson(t, { name: "Madre", sex: "female", alive: true });
    t = setParents(t, t.deceasedId, { fatherId: now.fatherId, motherId });
  }

  // Spouse(s)
  const spouse = w.spouse && typeof w.spouse === "object" ? w.spouse : {};
  if (spouse.enabled === true){
    const d = t.people[t.deceasedId];
    const dSex = safeSex(d?.sex);
    if (dSex === "male"){
      const wivesCount = Number.isFinite(Number(spouse.wives_count)) ? Math.max(0, Math.trunc(Number(spouse.wives_count))) : 0;
      const already = getSpouses(t, t.deceasedId).length;
      const need = Math.max(0, wivesCount - already);
      for (let i = 0; i < need; i++){
        const wifeId = `p${t.nextId}`;
        t = addPerson(t, { name: `Esposa ${already + i + 1}`, sex: "female", alive: true });
        t = linkSpouses(t, t.deceasedId, wifeId);
      }
    }else if (dSex === "female"){
      const present = spouse.husband_present === true;
      const already = getSpouses(t, t.deceasedId).length;
      if (present && already === 0){
        const husbandId = `p${t.nextId}`;
        t = addPerson(t, { name: "Esposo", sex: "male", alive: true });
        t = linkSpouses(t, t.deceasedId, husbandId);
      }
    }
  }

  // Descendants: attach direct sons/daughters to deceased.
  const desc = w.descendants && typeof w.descendants === "object" ? w.descendants : {};
  const sons = Number.isFinite(Number(desc.son)) ? Math.max(0, Math.trunc(Number(desc.son))) : 0;
  const daughters = Number.isFinite(Number(desc.daughter)) ? Math.max(0, Math.trunc(Number(desc.daughter))) : 0;

  for (let i = 0; i < sons; i++){
    const sonId = `p${t.nextId}`;
    t = addPerson(t, { name: `Hijo ${i + 1}`, sex: "male", alive: true });
    const existing = getParents(t, sonId);
    t = setParents(t, sonId, {
      fatherId: safeSex(t.people[t.deceasedId]?.sex) === "male" ? t.deceasedId : existing.fatherId,
      motherId: safeSex(t.people[t.deceasedId]?.sex) === "female" ? t.deceasedId : existing.motherId
    });
  }

  for (let i = 0; i < daughters; i++){
    const daughterId = `p${t.nextId}`;
    t = addPerson(t, { name: `Hija ${i + 1}`, sex: "female", alive: true });
    const existing = getParents(t, daughterId);
    t = setParents(t, daughterId, {
      fatherId: safeSex(t.people[t.deceasedId]?.sex) === "male" ? t.deceasedId : existing.fatherId,
      motherId: safeSex(t.people[t.deceasedId]?.sex) === "female" ? t.deceasedId : existing.motherId
    });
  }

  // Grandchildren via son: attach all to the first son (deterministic).
  const grandSons = Number.isFinite(Number(desc.sons_son)) ? Math.max(0, Math.trunc(Number(desc.sons_son))) : 0;
  const grandDaughters = Number.isFinite(Number(desc.sons_daughter)) ? Math.max(0, Math.trunc(Number(desc.sons_daughter))) : 0;

  const sonsIds = getChildren(t, t.deceasedId).filter((id) => t.people[id]?.sex === "male");
  const anchorSonId = sonsIds.length ? sonsIds[0] : null;

  if (anchorSonId){
    for (let i = 0; i < grandSons; i++){
      const id = `p${t.nextId}`;
      t = addPerson(t, { name: `Nieto ${i + 1}`, sex: "male", alive: true });
      const existing = getParents(t, id);
      t = setParents(t, id, { fatherId: anchorSonId, motherId: existing.motherId });
    }
    for (let i = 0; i < grandDaughters; i++){
      const id = `p${t.nextId}`;
      t = addPerson(t, { name: `Nieta ${i + 1}`, sex: "female", alive: true });
      const existing = getParents(t, id);
      t = setParents(t, id, { fatherId: anchorSonId, motherId: existing.motherId });
    }
  }

  return t;
}

function buildGenerationIndex(tree){
  const t = ensureTree(tree, null);
  const levels = {};
  const q = [];
  const startId = t.deceasedId;
  levels[startId] = 0;
  q.push(startId);

  while (q.length){
    const id = q.shift();
    const baseLevel = levels[id];
    if (baseLevel === null || baseLevel === undefined) continue;

    // spouses: same level
    for (const sid of getSpouses(t, id)){
      if (!(sid in levels)){
        levels[sid] = baseLevel;
        q.push(sid);
      }
    }

    // parents: -1
    const parents = getParents(t, id);
    for (const pid of [parents.fatherId, parents.motherId]){
      if (pid && !(pid in levels)){
        levels[pid] = baseLevel - 1;
        q.push(pid);
      }
    }

    // children: +1
    for (const cid of getChildren(t, id)){
      if (!(cid in levels)){
        levels[cid] = baseLevel + 1;
        q.push(cid);
      }
    }
  }

  const used = new Set(Object.keys(levels));
  const disconnected = Object.keys(t.people).filter((id) => !used.has(id));

  const byLevel = {};
  for (const [id, level] of Object.entries(levels)){
    if (!byLevel[level]) byLevel[level] = [];
    byLevel[level].push(id);
  }

  const levelNums = Object.keys(byLevel).map((k) => Number(k)).sort((a, b) => a - b);

  const groups = levelNums.map((level) => ({
    level,
    ids: byLevel[level].slice(),
  }));

  return { groups, levels, disconnected };
}

function sortPeopleIds(tree, ids, selectedId){
  const t = ensureTree(tree, null);
  return ids.slice().sort((a, b) => {
    if (a === t.deceasedId) return -1;
    if (b === t.deceasedId) return 1;
    if (a === selectedId) return -1;
    if (b === selectedId) return 1;

    const pa = t.people[a];
    const pb = t.people[b];

    const na = (pa?.name || a).toLowerCase();
    const nb = (pb?.name || b).toLowerCase();
    return na.localeCompare(nb);
  });
}

function matchesSearch(person, id, query){
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const name = (person?.name || "").toLowerCase();
  const pid = (id || "").toLowerCase();
  return name.includes(q) || pid.includes(q);
}

function renderNodeCard(tree, id, selectedId){
  const t = ensureTree(tree, null);
  const p = t.people[id];
  if (!p) return "";

  const isSelected = id === selectedId;
  const isDeceased = id === t.deceasedId;

  const spousesCount = getSpouses(t, id).length;
  const childrenCount = getChildren(t, id).length;
  const parents = getParents(t, id);

  const cls = ["tree-node", isSelected ? "is-selected" : "", isDeceased ? "is-deceased" : ""].filter(Boolean).join(" ");

  const parentLine = (parents.fatherId || parents.motherId)
    ? `<div class="tree-node-meta">
        <span class="muted">Padres:</span>
        ${parents.fatherId ? `<button class="link" type="button" data-tree-select="${parents.fatherId}">${escapeHtml(t.people[parents.fatherId]?.name || parents.fatherId)}</button>` : `<span class="muted">-</span>`}
        <span class="muted">/</span>
        ${parents.motherId ? `<button class="link" type="button" data-tree-select="${parents.motherId}">${escapeHtml(t.people[parents.motherId]?.name || parents.motherId)}</button>` : `<span class="muted">-</span>`}
      </div>`
    : `<div class="tree-node-meta"><span class="muted">Padres:</span> <span class="muted">sin datos</span></div>`;

  return `
    <div class="${cls}" data-tree-select="${id}">
      <div class="tree-node-head">
        <div class="tree-node-title">
          <strong>${escapeHtml(p.name || id)}</strong>
          ${isDeceased ? `<span class="pill pill-accent">Causante</span>` : ""}
        </div>
        <div class="tree-node-badges">
          <span class="pill">${labelSex(p.sex)}</span>
          <span class="pill ${p.alive ? "" : "pill-warn"}">${labelAlive(p.alive)}</span>
        </div>
      </div>

      <div class="tree-node-sub">
        <span class="muted">ID:</span> <code>${escapeHtml(id)}</code>
        <span class="muted" style="margin-left:10px;">Cónyuges:</span> <span>${spousesCount}</span>
        <span class="muted" style="margin-left:10px;">Hijos:</span> <span>${childrenCount}</span>
      </div>

      ${parentLine}

      <div class="tree-node-actions">
        <button class="btn btn-sm" type="button" data-tree-action="add-child" data-id="${id}">+ hijo/a</button>
        <button class="btn btn-sm" type="button" data-tree-action="add-spouse" data-id="${id}">+ cónyuge</button>
        <button class="btn btn-sm" type="button" data-tree-action="edit" data-id="${id}">Editar</button>
        ${isDeceased ? "" : `<button class="btn btn-sm" type="button" data-tree-action="set-deceased" data-id="${id}">Set causante</button>`}
      </div>
    </div>
  `;
}

function renderGenerationGroup(tree, group, ui, selectedId, searchQuery){
  const levelKey = String(group.level);
  const collapsed = ui.collapsedLevels && ui.collapsedLevels[levelKey] === true;

  const label =
    group.level === 0
      ? "Causante (Gen 0)"
      : group.level < 0
        ? `Ascendientes (Gen ${group.level})`
        : `Descendientes (Gen +${group.level})`;

  const idsSorted = sortPeopleIds(tree, group.ids, selectedId);
  const visible = idsSorted.filter((id) => matchesSearch(tree.people[id], id, searchQuery) || id === selectedId || id === ensureTree(tree, null).deceasedId);

  if (searchQuery && visible.length === 0){
    return "";
  }

  return `
    <section class="tree-gen">
      <div class="tree-gen-head">
        <button class="btn btn-sm" type="button" data-tree-action="toggle-level" data-level="${escapeHtml(levelKey)}">${collapsed ? "Mostrar" : "Plegar"}</button>
        <strong>${escapeHtml(label)}</strong>
        <span class="muted">(${visible.length}/${group.ids.length})</span>
      </div>
      ${collapsed ? "" : `<div class="tree-gen-body">${visible.map((id) => renderNodeCard(tree, id, selectedId)).join("")}</div>`}
    </section>
  `;
}

function renderDisconnected(tree, ui, selectedId, searchQuery){
  const t = ensureTree(tree, null);
  if (!ui.showDisconnected) return "";
  const idx = buildGenerationIndex(t);
  const ids = sortPeopleIds(t, idx.disconnected, selectedId)
    .filter((id) => matchesSearch(t.people[id], id, searchQuery) || id === selectedId);

  if (ids.length === 0) return "";

  return `
    <section class="tree-gen tree-gen-disconnected">
      <div class="tree-gen-head">
        <strong>No conectados</strong>
        <span class="muted">(${ids.length})</span>
      </div>
      <div class="tree-gen-body">
        ${ids.map((id) => renderNodeCard(t, id, selectedId)).join("")}
      </div>
    </section>
  `;
}

function modalBase({ title, body, error }){
  return `
    <div class="tree-modal-backdrop" data-tree-action="modal-backdrop">
      <div class="tree-modal card card-pad" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="row" style="justify-content:space-between; align-items:center; gap:10px;">
          <strong>${escapeHtml(title)}</strong>
          <button class="btn btn-sm" type="button" data-tree-action="modal-cancel">Cerrar</button>
        </div>

        ${error ? `<div class="notice warn" style="margin-top:10px;"><div class="notice-body">${escapeHtml(error)}</div></div>` : ""}

        <div class="tree-modal-body">
          ${body}
        </div>

        <div class="row" style="justify-content:flex-end; gap:10px; margin-top:12px; flex-wrap:wrap;">
          <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
          <button class="btn primary" type="button" data-tree-action="modal-save">Guardar</button>
        </div>
      </div>
    </div>
  `;
}

function renderModal(tree, modal){
  const t = ensureTree(tree, null);
  if (!modal || typeof modal !== "object") return "";

  const type = modal.type;
  const id = typeof modal.id === "string" ? modal.id : null;
  const error = typeof modal.error === "string" ? modal.error : null;

  if (type === MODAL_TYPES.CREATE){
    const body = `
      <label class="field">
        <span class="label">Nombre (opcional)</span>
        <input id="tree-modal-name" type="text" placeholder="Nombre" value="">
      </label>

      <label class="field">
        <span class="label">Sexo</span>
        <select id="tree-modal-sex">
          <option value="">Sin sexo</option>
          <option value="male">Varón</option>
          <option value="female">Mujer</option>
        </select>
      </label>

      <label class="field field-inline">
        <input id="tree-modal-alive" type="checkbox" checked>
        <span>Vivo</span>
      </label>
    `;
    return modalBase({ title: "Nueva persona", body, error });
  }

  if (type === MODAL_TYPES.ADD_CHILD){
    const parentId = id;
    const parent = parentId ? t.people[parentId] : null;

    const candidates = Object.keys(t.people)
      .filter((pid) => pid !== parentId)
      .map((pid) => ({ id: pid, name: t.people[pid]?.name || pid }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentSex = safeSex(parent?.sex);
    const defaultAs = parentSex === "male" ? "father" : parentSex === "female" ? "mother" : "auto";

    const body = `
      <p class="muted">Progenitor: <strong>${escapeHtml(parent?.name || parentId || "")}</strong></p>

      <label class="field">
        <span class="label">Este progenitor actúa como</span>
        <select id="tree-modal-parent-as">
          <option value="auto" ${defaultAs === "auto" ? "selected" : ""}>Auto (según sexo)</option>
          <option value="father" ${defaultAs === "father" ? "selected" : ""}>Padre</option>
          <option value="mother" ${defaultAs === "mother" ? "selected" : ""}>Madre</option>
        </select>
      </label>

      <label class="field">
        <span class="label">Modo</span>
        <select id="tree-modal-link-mode">
          <option value="new" selected>Crear nuevo</option>
          <option value="existing">Reusar existente</option>
        </select>
      </label>

      <div class="tree-modal-split">
        <div>
          <label class="field">
            <span class="label">Persona existente</span>
            <select id="tree-modal-existing-id">
              <option value="">Selecciona...</option>
              ${candidates.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.id)})</option>`).join("")}
            </select>
          </label>
        </div>
        <div>
          <label class="field">
            <span class="label">Nombre (nuevo, opcional)</span>
            <input id="tree-modal-name" type="text" placeholder="Nombre" value="">
          </label>

          <label class="field">
            <span class="label">Sexo (nuevo)</span>
            <select id="tree-modal-sex">
              <option value="">Sin sexo</option>
              <option value="male">Varón</option>
              <option value="female">Mujer</option>
            </select>
          </label>

          <label class="field field-inline">
            <input id="tree-modal-alive" type="checkbox" checked>
            <span>Vivo</span>
          </label>
        </div>
      </div>
    `;
    return modalBase({ title: "Añadir hijo/a", body, error });
  }

  if (type === MODAL_TYPES.ADD_SPOUSE){
    const personId = id;
    const person = personId ? t.people[personId] : null;

    const candidates = Object.keys(t.people)
      .filter((pid) => pid !== personId && !getSpouses(t, personId).includes(pid))
      .map((pid) => ({ id: pid, name: t.people[pid]?.name || pid }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const defaultSex = safeSex(person?.sex) === "male" ? "female" : safeSex(person?.sex) === "female" ? "male" : "";

    const body = `
      <p class="muted">Persona: <strong>${escapeHtml(person?.name || personId || "")}</strong></p>

      <label class="field">
        <span class="label">Modo</span>
        <select id="tree-modal-link-mode">
          <option value="new" selected>Crear nuevo</option>
          <option value="existing">Reusar existente</option>
        </select>
      </label>

      <div class="tree-modal-split">
        <div>
          <label class="field">
            <span class="label">Persona existente</span>
            <select id="tree-modal-existing-id">
              <option value="">Selecciona...</option>
              ${candidates.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.id)})</option>`).join("")}
            </select>
          </label>
        </div>
        <div>
          <label class="field">
            <span class="label">Nombre (nuevo, opcional)</span>
            <input id="tree-modal-name" type="text" placeholder="Nombre" value="">
          </label>

          <label class="field">
            <span class="label">Sexo (nuevo)</span>
            <select id="tree-modal-sex">
              <option value="" ${defaultSex === "" ? "selected" : ""}>Sin sexo</option>
              <option value="male" ${defaultSex === "male" ? "selected" : ""}>Varón</option>
              <option value="female" ${defaultSex === "female" ? "selected" : ""}>Mujer</option>
            </select>
          </label>

          <label class="field field-inline">
            <input id="tree-modal-alive" type="checkbox" checked>
            <span>Vivo</span>
          </label>
        </div>
      </div>
    `;
    return modalBase({ title: "Añadir cónyuge", body, error });
  }

  if (type === MODAL_TYPES.EDIT){
    const personId = id;
    const p = personId ? t.people[personId] : null;
    if (!p) return "";

    const all = Object.keys(t.people).filter((pid) => pid !== personId);

    const fatherCandidates = all
      .filter((pid) => safeSex(t.people[pid]?.sex) === "male")
      .map((pid) => ({ id: pid, name: t.people[pid]?.name || pid }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const motherCandidates = all
      .filter((pid) => safeSex(t.people[pid]?.sex) === "female")
      .map((pid) => ({ id: pid, name: t.people[pid]?.name || pid }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parents = getParents(t, personId);
    const spouses = getSpouses(t, personId).map((sid) => ({ id: sid, name: t.people[sid]?.name || sid }));
    const children = getChildren(t, personId).map((cid) => ({ id: cid, name: t.people[cid]?.name || cid }));

    const body = `
      <label class="field">
        <span class="label">Nombre (opcional)</span>
        <input id="tree-modal-name" type="text" value="${escapeHtml(p.name || "")}">
      </label>

      <label class="field">
        <span class="label">Sexo</span>
        <select id="tree-modal-sex">
          <option value="" ${safeSex(p.sex) === null ? "selected" : ""}>Sin sexo</option>
          <option value="male" ${p.sex === "male" ? "selected" : ""}>Varón</option>
          <option value="female" ${p.sex === "female" ? "selected" : ""}>Mujer</option>
        </select>
      </label>

      <label class="field field-inline">
        <input id="tree-modal-alive" type="checkbox" ${p.alive ? "checked" : ""}>
        <span>Vivo</span>
      </label>

      <div class="tree-modal-divider"></div>

      <div class="tree-modal-split">
        <div>
          <label class="field">
            <span class="label">Padre</span>
            <select id="tree-modal-father">
              <option value="">(ninguno)</option>
              ${fatherCandidates.map((c) => `<option value="${escapeHtml(c.id)}" ${parents.fatherId === c.id ? "selected" : ""}>${escapeHtml(c.name)} (${escapeHtml(c.id)})</option>`).join("")}
            </select>
          </label>

          <label class="field">
            <span class="label">Madre</span>
            <select id="tree-modal-mother">
              <option value="">(ninguno)</option>
              ${motherCandidates.map((c) => `<option value="${escapeHtml(c.id)}" ${parents.motherId === c.id ? "selected" : ""}>${escapeHtml(c.name)} (${escapeHtml(c.id)})</option>`).join("")}
            </select>
          </label>
        </div>

        <div>
          <div class="stack" style="gap:6px;">
            <div><span class="label">Cónyuges</span></div>
            ${spouses.length ? spouses.map((s) => `
              <div class="row" style="justify-content:space-between; gap:10px;">
                <button class="link" type="button" data-tree-select="${escapeHtml(s.id)}">${escapeHtml(s.name)}</button>
                <button class="btn btn-sm" type="button" data-tree-action="unlink-spouse" data-id="${escapeHtml(personId)}" data-other="${escapeHtml(s.id)}">Quitar</button>
              </div>
            `).join("") : `<div class="muted">Sin cónyuges.</div>`}
          </div>

          <div class="stack" style="gap:6px; margin-top:10px;">
            <div><span class="label">Hijos</span></div>
            ${children.length ? children.map((c) => `
              <div class="row" style="justify-content:space-between; gap:10px;">
                <button class="link" type="button" data-tree-select="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>
              </div>
            `).join("") : `<div class="muted">Sin hijos.</div>`}
          </div>
        </div>
      </div>
    `;
    return modalBase({ title: `Editar: ${p.name || personId}`, body, error });
  }

  return "";
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
  setModal(store, null);
}

function getTreeFromState(state){
  const builder = state?.builder || {};
  return ensureTree(sanitizeTree(builder.tree), null);
}

function setTreeInState(store, tree, patchBuilder = {}, meta = {}){
  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      ...patchBuilder,
      tree,
    },
  }), meta);
}

function openEditModal(store, id){
  setModal(store, { type: MODAL_TYPES.EDIT, id, error: null });
}

function openCreateModal(store){
  setModal(store, { type: MODAL_TYPES.CREATE, id: null, error: null });
}

function openAddChildModal(store, parentId){
  setModal(store, { type: MODAL_TYPES.ADD_CHILD, id: parentId, error: null });
}

function openAddSpouseModal(store, personId){
  setModal(store, { type: MODAL_TYPES.ADD_SPOUSE, id: personId, error: null });
}

function readModalValues(){
  const name = normStr(document.getElementById("tree-modal-name")?.value).trim();
  const sexRaw = normStr(document.getElementById("tree-modal-sex")?.value).trim();
  const alive = document.getElementById("tree-modal-alive") ? !!document.getElementById("tree-modal-alive").checked : true;

  const linkMode = normStr(document.getElementById("tree-modal-link-mode")?.value).trim() || "new";
  const existingId = normStr(document.getElementById("tree-modal-existing-id")?.value).trim() || "";

  const parentAs = normStr(document.getElementById("tree-modal-parent-as")?.value).trim() || "auto";

  const father = normStr(document.getElementById("tree-modal-father")?.value).trim() || "";
  const mother = normStr(document.getElementById("tree-modal-mother")?.value).trim() || "";

  return { name, sexRaw, alive, linkMode, existingId, parentAs, father, mother };
}

function commitCreatePerson(store){
  const state = store.getState();
  const tree = getTreeFromState(state);

  const vals = readModalValues();
  const id = `p${tree.nextId}`;
  const sex = safeSex(vals.sexRaw) || "male";

  const nextTree = addPerson(tree, { name: vals.name || "Persona", sex, alive: !!vals.alive });
  setTreeInState(store, nextTree, { treeSelectedId: id }, { persist: true });
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
      setModalError(store, "No puedes asignarte a ti mismo como cónyuge.");
      return;
    }
    nextTree = linkSpouses(nextTree, personId, vals.existingId);
    setTreeInState(store, nextTree, { treeSelectedId: vals.existingId }, { persist: true });
    closeTreeModal(store);
    return;
  }

  const newId = `p${nextTree.nextId}`;
  const sex = safeSex(vals.sexRaw) || "male";
  nextTree = addPerson(nextTree, { name: vals.name || "Cónyuge", sex, alive: !!vals.alive });
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

  const newId = `p${nextTree.nextId}`;
  const sex = safeSex(vals.sexRaw) || "male";
  nextTree = addPerson(nextTree, { name: vals.name || "Hijo/a", sex, alive: !!vals.alive });
  linkChild(newId);
}

function commitEditPerson(store, personId){
  const state = store.getState();
  const tree = getTreeFromState(state);

  if (!personId || !tree.people[personId]){
    setModalError(store, "Persona inválida.");
    return;
  }

  const vals = readModalValues();
  const nextSex = vals.sexRaw === "" ? null : safeSex(vals.sexRaw) || null;
  const nextName = vals.name;
  const nextAlive = !!vals.alive;

  let nextTree = tree;

  nextTree = updatePerson(nextTree, personId, {
    name: nextName,
    sex: nextSex || tree.people[personId].sex,
    alive: nextAlive,
  });

  const fatherId = vals.father || null;
  const motherId = vals.mother || null;

  if (fatherId === personId || motherId === personId){
    setModalError(store, "Una persona no puede ser su propio padre o madre.");
    return;
  }

  nextTree = setParents(nextTree, personId, { fatherId, motherId });

  setTreeInState(store, nextTree, { treeSelectedId: personId }, { persist: true });
  closeTreeModal(store);
}

function commitModalSave(store){
  const state = store.getState();
  const builder = state.builder || {};
  const ui = getTreeUi(builder);
  const modal = ui.modal;

  if (!modal) return;

  const type = modal.type;
  const id = modal.id;

  if (type === MODAL_TYPES.CREATE) return commitCreatePerson(store);
  if (type === MODAL_TYPES.ADD_CHILD) return commitAddChild(store, id);
  if (type === MODAL_TYPES.ADD_SPOUSE) return commitAddSpouse(store, id);
  if (type === MODAL_TYPES.EDIT) return commitEditPerson(store, id);

  closeTreeModal(store);
}

export function renderBuilderTree(state){
  const wizard = state?.wizard || {};
  const builder = state?.builder || {};
  const tree = getTreeFromState(state);

  const ui = getTreeUi(builder);
  const selectedId =
    builder.treeSelectedId && tree.people[builder.treeSelectedId]
      ? builder.treeSelectedId
      : tree.deceasedId;

  const idx = buildGenerationIndex(tree);
  const searchQuery = ui.search;

  const groupsHtml = idx.groups
    .map((g) => renderGenerationGroup(tree, g, ui, selectedId, searchQuery))
    .filter(Boolean)
    .join("");

  const modalHtml = renderModal(tree, ui.modal);

  const wizardHashNow = computeWizardHash(wizard);
  const wizardChanged = !!builder.wizardHashApplied && builder.wizardHashApplied !== wizardHashNow;

  const wizardControls = `
    <div class="row" style="gap:10px; flex-wrap:wrap;">
      <button class="btn" type="button" data-tree-action="new-person">Nueva persona</button>
      <button class="btn" type="button" data-tree-action="toggle-disconnected">${ui.showDisconnected ? "Ocultar no conectados" : "Mostrar no conectados"}</button>
      <button class="btn" type="button" data-tree-action="import-wizard">Importar del wizard al árbol</button>
      <button class="btn" type="button" data-tree-action="reset-tree">Reset tree</button>
    </div>
  `;

  const wizardBanner = wizardChanged
    ? `<div class="notice warn">
        <div class="notice-title">Wizard cambió</div>
        <div class="notice-body">Has modificado el wizard desde la última importación. Si lo necesitas, vuelve a importar manualmente.</div>
      </div>`
    : "";

  const modeTabs = `
    <div class="row" style="gap:10px; flex-wrap:wrap; margin-top:10px;">
      <button class="btn ${builder.mode === "tree" ? "is-active" : ""}" type="button" id="builder-mode-tree">Tree</button>
      <button class="btn ${builder.mode === "roles" ? "is-active" : ""}" type="button" id="builder-mode-roles">Roles</button>
    </div>
  `;

  return `
    <div class="builder-tree-v2 stack" id="builder-tree-root">
      <div class="card card-pad stack">
        <div class="row row-between row-wrap">
          <div class="stack">
            <h1>Tree Builder</h1>
            <p class="muted">Construye el árbol por nodos y relaciones (progenitor e cónyuge). El árbol es la fuente de verdad.</p>
            ${modeTabs}
          </div>
          <div style="min-width:260px; max-width:420px;">
            <label class="field" style="margin:0;">
              <span class="label">Búsqueda</span>
              <input id="tree-search" type="text" placeholder="Nombre o ID..." value="${escapeHtml(ui.search)}">
            </label>
          </div>
        </div>
      </div>

      ${wizardBanner}

      <div class="card card-pad stack">
        ${wizardControls}
      </div>

      <div class="tree-v2 stack">
        ${groupsHtml}
        ${renderDisconnected(tree, ui, selectedId, searchQuery)}
      </div>

      ${modalHtml}
    </div>
  `;
}

export function wireBuilderTree(store){
  const root = document.getElementById("builder-tree-root");
  if (!root) return;

  // Search input
  const searchEl = document.getElementById("tree-search");
  if (searchEl){
    searchEl.addEventListener("input", (e) => {
      const value = normStr(e.target?.value);
      setTreeUi(store, { search: value }, { persist: true });
    });
  }

  root.addEventListener("click", (e) => {
    const btn = e.target?.closest("[data-tree-action]");
    if (btn){
      const action = btn.getAttribute("data-tree-action");
      const id = btn.getAttribute("data-id");
      const level = btn.getAttribute("data-level");
      const other = btn.getAttribute("data-other");

      if (action === "toggle-level"){
        store.setState((s) => {
          const ui = getTreeUi(s.builder || {});
          const collapsed = ui.collapsedLevels && ui.collapsedLevels[String(level)] === true;
          const next = { ...(s.builder?.treeUi?.collapsedLevels || {}) };
          next[String(level)] = !collapsed;
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

      if (action === "new-person"){
        openCreateModal(store);
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

      if (action === "edit"){
        openEditModal(store, id);
        return;
      }

      if (action === "add-child"){
        openAddChildModal(store, id);
        return;
      }

      if (action === "add-spouse"){
        openAddSpouseModal(store, id);
        return;
      }

      if (action === "set-deceased"){
        const state = store.getState();
        const tree = getTreeFromState(state);
        if (!id || !tree.people[id]) return;

        const nextPeople = { ...tree.people, [id]: { ...tree.people[id], alive: false } };
        const nextTree = { ...tree, deceasedId: id, people: nextPeople };
        setTreeInState(store, nextTree, { treeSelectedId: id }, { persist: true });
        return;
      }

      if (action === "unlink-spouse"){
        const state = store.getState();
        const tree = getTreeFromState(state);
        if (!id || !other) return;
        const nextTree = unlinkSpouses(tree, id, other);
        setTreeInState(store, nextTree, { treeSelectedId: id }, { persist: true });
        return;
      }

      if (action === "modal-cancel" || action === "modal-backdrop"){
        closeTreeModal(store);
        return;
      }

      if (action === "modal-save"){
        commitModalSave(store);
        return;
      }

      return;
    }

    const selectBtn = e.target?.closest("[data-tree-select]");
    if (selectBtn){
      const id = selectBtn.getAttribute("data-tree-select");
      if (!id) return;

      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          treeSelectedId: id,
        },
      }), { persist: true });

      // If click came from inside the modal, keep it open.
      return;
    }

    const closeBtn = e.target?.closest("#btn-modal-close");
    if (closeBtn){
      closeModal(store);
    }
  });
}

// Kept for backward compatibility with builder.js applyWizardSync()
export function applyWizardSyncTree(store){
  return importWizardToTree(store);
}

// Called by app.js on confirmAction: "builder-tree-import-wizard"
export function importWizardToTree(store){
  const state = store.getState();
  const wizard = state?.wizard || {};
  const baseTree = getTreeFromState(state);
  const merged = applyWizardToTree(baseTree, wizard);
  const wizardHashApplied = computeWizardHash(wizard);

  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      tree: merged,
      fromWizardApplied: true,
      wizardHashApplied,
    },
  }), { persist: true });

  closeModal(store);
}
