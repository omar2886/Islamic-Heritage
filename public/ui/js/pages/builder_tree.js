// public/ui/js/pages/builder_tree.js
import { sanitizeTree, ensureTree } from "../domain/familyTree.js";
import { openModal } from "../ui/modal.js";

/**
 * PR16b: Nuevo Tree Builder por generaciones (BFS desde deceasedId),
 * acciones inline por nodo, y edición en modal local (sin commits por tecla).
 *
 * Notas:
 * - Tree es la fuente de verdad.
 * - El Wizard solo se importa al árbol por acción explícita (botón "Importar del Wizard").
 * - NO se toca el core (public/app/).
 */

/* =========================
   Helpers
========================= */

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function personLabel(p){
  const name = p?.name ? String(p.name) : "(sin nombre)";
  return `${name} (${p?.id || "?"})`;
}

function normalizeTreeUi(treeUi){
  const safe = treeUi && typeof treeUi === "object" ? treeUi : {};
  const collapsed = safe.collapsed && typeof safe.collapsed === "object" ? safe.collapsed : {};
  return {
    search: typeof safe.search === "string" ? safe.search : "",
    collapsed,
    modal: safe.modal && typeof safe.modal === "object" ? safe.modal : null,
  };
}

function makeChildrenIndex(tree){
  const idx = {};
  const parents = tree.parents && typeof tree.parents === "object" ? tree.parents : {};
  for (const [childId, rel] of Object.entries(parents)){
    if (!rel || typeof rel !== "object") continue;
    const f = rel.fatherId;
    const m = rel.motherId;
    if (typeof f === "string"){
      if (!idx[f]) idx[f] = [];
      idx[f].push(childId);
    }
    if (typeof m === "string"){
      if (!idx[m]) idx[m] = [];
      idx[m].push(childId);
    }
  }
  return idx;
}

function getParentsOf(tree, personId){
  const rel = (tree.parents && typeof tree.parents === "object") ? tree.parents[personId] : null;
  const fatherId = rel && typeof rel.fatherId === "string" ? rel.fatherId : null;
  const motherId = rel && typeof rel.motherId === "string" ? rel.motherId : null;
  return { fatherId, motherId };
}

function getSpousesOf(tree, personId){
  const spouses = (tree.spouses && typeof tree.spouses === "object") ? tree.spouses[personId] : null;
  if (!Array.isArray(spouses)) return [];
  return spouses.filter((id) => typeof id === "string");
}

function computeGenerations(tree, rootId){
  const people = tree.people || {};
  const childrenIdx = makeChildrenIndex(tree);

  const genById = {};
  const visited = new Set();

  if (!people[rootId]) return { genById: {}, groups: [], visitedIds: [], disconnectedIds: Object.keys(people) };

  const queue = [rootId];
  genById[rootId] = 0;
  visited.add(rootId);

  while (queue.length){
    const cur = queue.shift();
    const g = genById[cur];

    // spouses at same generation
    for (const sid of getSpousesOf(tree, cur)){
      if (!people[sid]) continue;
      if (!(sid in genById)){
        genById[sid] = g;
        queue.push(sid);
        visited.add(sid);
      }
    }

    // parents are generation -1
    const { fatherId, motherId } = getParentsOf(tree, cur);
    for (const pid of [fatherId, motherId]){
      if (!pid || !people[pid]) continue;
      if (!(pid in genById)){
        genById[pid] = g - 1;
        queue.push(pid);
        visited.add(pid);
      }
    }

    // children are generation +1
    const children = Array.isArray(childrenIdx[cur]) ? childrenIdx[cur] : [];
    for (const cid of children){
      if (!people[cid]) continue;
      if (!(cid in genById)){
        genById[cid] = g + 1;
        queue.push(cid);
        visited.add(cid);
      }
    }
  }

  // build sorted groups
  const byGen = new Map();
  for (const [id, gen] of Object.entries(genById)){
    if (!byGen.has(gen)) byGen.set(gen, []);
    byGen.get(gen).push(id);
  }

  const gens = Array.from(byGen.keys()).sort((a, b) => a - b);
  const groups = gens.map((gen) => {
    const ids = byGen.get(gen);
    ids.sort((a, b) => {
      const pa = people[a];
      const pb = people[b];
      const na = (pa?.name || "").toLowerCase();
      const nb = (pb?.name || "").toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return a.localeCompare(b);
    });
    return { gen, ids };
  });

  const visitedIds = Array.from(visited);
  visitedIds.sort();

  const disconnectedIds = Object.keys(people).filter((id) => !visited.has(id));
  disconnectedIds.sort();

  return { genById, groups, visitedIds, disconnectedIds };
}

function nextPersonId(tree){
  let nextId = (typeof tree.nextId === "number" && tree.nextId >= 2) ? tree.nextId : 2;
  while (tree.people && tree.people[`p${nextId}`]) nextId += 1;
  return nextId;
}

function addPerson(tree, fields){
  const nextId = nextPersonId(tree);
  const id = `p${nextId}`;
  const people = { ...(tree.people || {}) };
  people[id] = {
    id,
    name: typeof fields.name === "string" ? fields.name : "",
    sex: (fields.sex === "male" || fields.sex === "female") ? fields.sex : "male",
    alive: fields.alive === false ? false : true,
  };
  return { ...tree, nextId: nextId + 1, people };
}

function updatePerson(tree, personId, patch){
  const p = tree.people?.[personId];
  if (!p) return tree;
  const next = { ...p };
  if (typeof patch.name === "string") next.name = patch.name;
  if (patch.sex === "male" || patch.sex === "female") next.sex = patch.sex;
  if (typeof patch.alive === "boolean") next.alive = patch.alive;
  const people = { ...tree.people, [personId]: next };
  return { ...tree, people };
}

function setDeceased(tree, personId){
  if (!tree.people?.[personId]) return tree;
  const people = { ...tree.people };
  for (const [id, p] of Object.entries(people)){
    if (id === personId){
      people[id] = { ...p, alive: false, name: p.name || "Causante" };
    } else {
      people[id] = { ...p };
    }
  }
  return { ...tree, deceasedId: personId, people };
}

function linkSpouses(tree, aId, bId){
  if (aId === bId) return tree;
  if (!tree.people?.[aId] || !tree.people?.[bId]) return tree;

  const spouses = { ...(tree.spouses || {}) };
  const a = Array.isArray(spouses[aId]) ? spouses[aId].slice() : [];
  const b = Array.isArray(spouses[bId]) ? spouses[bId].slice() : [];

  if (!a.includes(bId)) a.push(bId);
  if (!b.includes(aId)) b.push(aId);

  spouses[aId] = a;
  spouses[bId] = b;

  return { ...tree, spouses };
}

function setParentRelation(tree, childId, parentId){
  const child = tree.people?.[childId];
  const parent = tree.people?.[parentId];
  if (!child || !parent) return tree;

  const parents = { ...(tree.parents || {}) };
  const rel = parents[childId] && typeof parents[childId] === "object" ? { ...parents[childId] } : {};
  if (parent.sex === "male") rel.fatherId = parentId;
  if (parent.sex === "female") rel.motherId = parentId;
  parents[childId] = rel;

  return { ...tree, parents };
}

function setOtherParent(tree, childId, otherParentId){
  const child = tree.people?.[childId];
  const p = tree.people?.[otherParentId];
  if (!child || !p) return tree;

  const parents = { ...(tree.parents || {}) };
  const rel = parents[childId] && typeof parents[childId] === "object" ? { ...parents[childId] } : {};

  if (p.sex === "male") rel.fatherId = otherParentId;
  if (p.sex === "female") rel.motherId = otherParentId;

  parents[childId] = rel;
  return { ...tree, parents };
}

/* =========================
   Page render
========================= */

export function renderBuilderTree(state){
  const builder = state.builder || {};
  const treeUi = normalizeTreeUi(builder.treeUi);

  const tree = ensureTree(sanitizeTree(builder.tree));
  const deceasedId = tree.deceasedId;
  const selectedId = (typeof builder.treeSelectedId === "string" && tree.people?.[builder.treeSelectedId]) ? builder.treeSelectedId : deceasedId;

  const search = treeUi.search.trim().toLowerCase();
  const { groups, disconnectedIds } = computeGenerations(tree, deceasedId);

  const peopleIds = Object.keys(tree.people || {}).sort((a, b) => a.localeCompare(b));
  const filteredPeopleIds = search
    ? peopleIds.filter((id) => {
      const p = tree.people[id];
      const hay = `${p?.name || ""} ${id}`.toLowerCase();
      return hay.includes(search);
    })
    : peopleIds;

  const modalHtml = renderLocalModal(treeUi.modal, tree);

  return `
    <div id="page-builder-tree" class="builder-grid">
      <div class="card card-pad">
        <div class="row" style="justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div>
            <div style="font-weight:800; font-size:18px;">Tree Builder</div>
            <div style="color:var(--muted); margin-top:4px;">Fuente de verdad: árbol relacional (padre/madre, cónyuge).</div>
          </div>

          <div class="row" style="flex-wrap:wrap;">
            <button class="btn" type="button" data-tree-action="create-person">Añadir persona</button>
            <button class="btn" type="button" data-tree-action="import-wizard">Importar del Wizard</button>
            <button class="btn" type="button" data-tree-action="reset">Reset</button>
          </div>
        </div>

        <div class="row" style="margin-top:12px; flex-wrap:wrap;">
          <input class="input" id="tree-search" type="search" placeholder="Buscar por nombre o id (p12)..." value="${escapeHtml(treeUi.search)}" style="min-width:260px; flex:1;">
          <div class="pill pill-dark">Causante: <strong>${escapeHtml(personLabel(tree.people[deceasedId]))}</strong></div>
          <div class="pill pill-dark">Seleccionado: <strong>${escapeHtml(personLabel(tree.people[selectedId]))}</strong></div>
        </div>
      </div>

      <div class="card card-pad builder-list">
        <div class="row" style="justify-content:space-between; align-items:center;">
          <strong>Personas</strong>
          <span style="color:var(--muted); font-size:12px;">${filteredPeopleIds.length}/${peopleIds.length}</span>
        </div>
        <div class="tree-list" style="margin-top:10px;">
          ${filteredPeopleIds.map((id) => renderPersonListRow(tree, id, selectedId, deceasedId, disconnectedIds.includes(id))).join("")}
        </div>
      </div>

      <div class="card card-pad builder-right">
        <div class="row" style="justify-content:space-between; align-items:center;">
          <strong>Vista por generaciones</strong>
          <span style="color:var(--muted); font-size:12px;">BFS desde el causante</span>
        </div>

        ${groups.length === 0 ? `
          <div class="notice warn" style="margin-top:12px;">
            <div class="notice-title">Árbol vacío o inválido</div>
            <div>Usa "Añadir persona" o "Importar del Wizard" para empezar.</div>
          </div>
        ` : ""}

        <div class="tree-gen-wrap" style="margin-top:12px;">
          ${groups.map((g) => renderGenerationGroup(tree, g, treeUi, selectedId)).join("")}
        </div>

        <div class="notice" style="margin-top:12px;">
          <div class="notice-title">MVP actual</div>
          <ul class="mini-list">
            <li>Construcción del árbol relacional (acciones inline por nodo).</li>
            <li>Importación explícita desde Wizard (no automático).</li>
            <li>Derivación roles y warnings se aborda en PR16c.</li>
          </ul>
        </div>
      </div>

      ${modalHtml}
    </div>
  `;
}

function renderPersonListRow(tree, id, selectedId, deceasedId, isDisconnected){
  const p = tree.people[id];
  const isSelected = id === selectedId;
  const isDeceased = id === deceasedId;
  const pills = [
    `<span class="pill">${escapeHtml(p.sex || "?")}</span>`,
    `<span class="pill ${p.alive ? "pill-dark" : ""}">${p.alive ? "vivo" : "fallecido"}</span>`,
    isDeceased ? `<span class="pill pill-dark">causante</span>` : "",
    isDisconnected ? `<span class="pill">desconectado</span>` : "",
  ].filter(Boolean).join("");

  return `
    <button class="tree-person ${isSelected ? "is-selected" : ""}" type="button" data-tree-action="select" data-person-id="${escapeHtml(id)}">
      <span>
        <span class="tree-person-name">${escapeHtml(p.name || "(sin nombre)")}</span>
        <span style="color:var(--muted); font-size:12px; margin-left:6px;">${escapeHtml(id)}</span>
      </span>
      <span class="tree-person-meta">${pills}</span>
    </button>
  `;
}

function genKey(gen){
  return `g${gen}`;
}

function genTitle(gen){
  if (gen === 0) return "Generación 0 (causante y cónyuges)";
  if (gen < 0) return `Generación ${gen} (ascendientes)`;
  return `Generación +${gen} (descendientes)`;
}

function renderGenerationGroup(tree, group, treeUi, selectedId){
  const g = group.gen;
  const key = genKey(g);
  const collapsed = !!treeUi.collapsed?.[key];

  return `
    <div class="tree-gen card card-pad">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <strong>${escapeHtml(genTitle(g))}</strong>
        <button class="btn" type="button" data-tree-action="toggle-gen" data-gen-key="${escapeHtml(key)}">${collapsed ? "Desplegar" : "Plegar"}</button>
      </div>

      ${collapsed ? "" : `
        <div class="tree-nodes">
          ${group.ids.map((id) => renderNodeCard(tree, id, selectedId)).join("")}
        </div>
      `}
    </div>
  `;
}

function renderNodeCard(tree, id, selectedId){
  const p = tree.people[id];
  const isDeceased = id === tree.deceasedId;
  const isSelected = id === selectedId;

  const spouses = getSpousesOf(tree, id).filter((sid) => !!tree.people?.[sid]);
  const { fatherId, motherId } = getParentsOf(tree, id);

  const badges = [
    `<span class="pill">${escapeHtml(p.sex || "?")}</span>`,
    `<span class="pill ${p.alive ? "pill-dark" : ""}">${p.alive ? "vivo" : "fallecido"}</span>`,
    isDeceased ? `<span class="pill pill-dark">causante</span>` : "",
  ].filter(Boolean).join("");

  const parentsLine = [fatherId, motherId].filter(Boolean).map((pid) => tree.people[pid]?.name ? escapeHtml(tree.people[pid].name) : escapeHtml(pid)).join(" · ");
  const spousesLine = spouses.map((sid) => tree.people[sid]?.name ? escapeHtml(tree.people[sid].name) : escapeHtml(sid)).join(" · ");

  return `
    <div class="tree-node ${isSelected ? "is-selected" : ""} ${isDeceased ? "is-deceased" : ""}" data-tree-action="select" data-person-id="${escapeHtml(id)}">
      <div class="tree-node-main">
        <div class="row" style="justify-content:space-between; align-items:flex-start; gap:10px;">
          <div>
            <div class="tree-node-title">${escapeHtml(p.name || "(sin nombre)")}</div>
            <div class="tree-node-sub">${escapeHtml(id)}</div>
          </div>
          <div class="tree-node-badges">${badges}</div>
        </div>

        <div class="tree-node-links">
          ${parentsLine ? `<div><span style="color:var(--muted);">Padres:</span> ${parentsLine}</div>` : ""}
          ${spousesLine ? `<div><span style="color:var(--muted);">Cónyuges:</span> ${spousesLine}</div>` : ""}
        </div>

        <div class="tree-node-actions row" style="justify-content:flex-end; flex-wrap:wrap;">
          <button class="btn" type="button" data-tree-action="add-child" data-person-id="${escapeHtml(id)}">+ hijo/a</button>
          <button class="btn" type="button" data-tree-action="add-spouse" data-person-id="${escapeHtml(id)}">+ cónyuge</button>
          <button class="btn" type="button" data-tree-action="edit" data-person-id="${escapeHtml(id)}">Editar</button>
          ${isDeceased ? "" : `<button class="btn" type="button" data-tree-action="set-deceased" data-person-id="${escapeHtml(id)}">Set causante</button>`}
        </div>
      </div>
    </div>
  `;
}

function renderLocalModal(modal, tree){
  if (!modal) return "";
  const type = modal.type;
  const ctxId = typeof modal.personId === "string" ? modal.personId : null;
  const title = (type === "edit") ? "Editar persona"
    : (type === "add-child") ? "Añadir hijo/a"
    : (type === "add-spouse") ? "Añadir cónyuge"
    : (type === "create-person") ? "Añadir persona"
    : "Modal";

  const body = (type === "edit" && ctxId) ? renderModalEdit(tree, ctxId)
    : (type === "add-child" && ctxId) ? renderModalAddChild(tree, ctxId)
    : (type === "add-spouse" && ctxId) ? renderModalAddSpouse(tree, ctxId)
    : (type === "create-person") ? renderModalCreatePerson(tree)
    : `<div style="color:var(--muted);">Modal inválido</div>`;

  return `
    <div class="tree-modal-backdrop" id="tree-modal-backdrop" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="tree-modal card card-pad">
        <div class="row" style="justify-content:space-between; align-items:center;">
          <strong>${escapeHtml(title)}</strong>
          <button class="btn" type="button" data-tree-action="modal-cancel">Cerrar</button>
        </div>
        <div class="tree-modal-body" style="margin-top:12px;">
          ${body}
        </div>
      </div>
    </div>
  `;
}

function renderModalEdit(tree, personId){
  const p = tree.people[personId];
  const disabled = personId === tree.deceasedId ? "disabled" : "";
  return `
    <div class="grid2">
      <label class="field">
        <span class="label">Nombre</span>
        <input class="input" type="text" id="tree-edit-name" value="${escapeHtml(p.name || "")}">
      </label>
      <label class="field">
        <span class="label">Sexo</span>
        <select class="input" id="tree-edit-sex" ${disabled}>
          <option value="male" ${p.sex === "male" ? "selected" : ""}>male</option>
          <option value="female" ${p.sex === "female" ? "selected" : ""}>female</option>
        </select>
      </label>
      <label class="field">
        <span class="label">Estado</span>
        <select class="input" id="tree-edit-alive" ${disabled}>
          <option value="alive" ${p.alive ? "selected" : ""}>vivo</option>
          <option value="dead" ${!p.alive ? "selected" : ""}>fallecido</option>
        </select>
      </label>
    </div>

    ${personId === tree.deceasedId ? `<div class="notice warn" style="margin-top:10px;">El causante siempre se marca como fallecido.</div>` : ""}

    <div class="row" style="justify-content:flex-end; margin-top:12px; flex-wrap:wrap;">
      <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
      <button class="btn" type="button" data-tree-action="modal-save-edit" data-person-id="${escapeHtml(personId)}">Guardar</button>
    </div>
  `;
}

function renderModalCreatePerson(tree){
  return `
    <div class="grid2">
      <label class="field">
        <span class="label">Nombre</span>
        <input class="input" type="text" id="tree-create-name" value="">
      </label>
      <label class="field">
        <span class="label">Sexo</span>
        <select class="input" id="tree-create-sex">
          <option value="male" selected>male</option>
          <option value="female">female</option>
        </select>
      </label>
      <label class="field">
        <span class="label">Estado</span>
        <select class="input" id="tree-create-alive">
          <option value="alive" selected>vivo</option>
          <option value="dead">fallecido</option>
        </select>
      </label>
    </div>

    <div class="row" style="justify-content:flex-end; margin-top:12px; flex-wrap:wrap;">
      <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
      <button class="btn" type="button" data-tree-action="modal-save-create">Guardar</button>
    </div>
  `;
}

function renderModalAddChild(tree, parentId){
  const parent = tree.people[parentId];
  const peopleIds = Object.keys(tree.people || {}).sort((a, b) => a.localeCompare(b));

  const otherParentOptions = peopleIds
    .filter((id) => id !== parentId)
    .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(personLabel(tree.people[id]))}</option>`)
    .join("");

  const existingOptions = peopleIds
    .filter((id) => id !== parentId)
    .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(personLabel(tree.people[id]))}</option>`)
    .join("");

  return `
    <div class="notice" style="margin-bottom:10px;">
      <div class="notice-title">Progenitor</div>
      <div>${escapeHtml(personLabel(parent))}</div>
    </div>

    <div class="grid2">
      <label class="field">
        <span class="label">Modo</span>
        <select class="input" id="tree-child-mode">
          <option value="create" selected>Crear nuevo hijo/a</option>
          <option value="link">Vincular hijo/a existente</option>
        </select>
      </label>

      <label class="field">
        <span class="label">Otro progenitor (opcional)</span>
        <select class="input" id="tree-child-other-parent">
          <option value="">(ninguno)</option>
          ${otherParentOptions}
        </select>
      </label>
    </div>

    <div id="tree-child-create-fields" style="margin-top:10px;">
      <div class="grid2">
        <label class="field">
          <span class="label">Nombre del hijo/a</span>
          <input class="input" type="text" id="tree-child-name" value="">
        </label>
        <label class="field">
          <span class="label">Sexo del hijo/a</span>
          <select class="input" id="tree-child-sex">
            <option value="male" selected>male</option>
            <option value="female">female</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Estado</span>
          <select class="input" id="tree-child-alive">
            <option value="alive" selected>vivo</option>
            <option value="dead">fallecido</option>
          </select>
        </label>
      </div>
    </div>

    <div id="tree-child-link-fields" style="margin-top:10px; display:none;">
      <label class="field">
        <span class="label">Hijo/a existente</span>
        <select class="input" id="tree-child-existing">
          ${existingOptions}
        </select>
      </label>
    </div>

    <div class="row" style="justify-content:flex-end; margin-top:12px; flex-wrap:wrap;">
      <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
      <button class="btn" type="button" data-tree-action="modal-save-add-child" data-person-id="${escapeHtml(parentId)}">Guardar</button>
    </div>
  `;
}

function renderModalAddSpouse(tree, personId){
  const person = tree.people[personId];
  const peopleIds = Object.keys(tree.people || {}).sort((a, b) => a.localeCompare(b));

  const existingOptions = peopleIds
    .filter((id) => id !== personId)
    .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(personLabel(tree.people[id]))}</option>`)
    .join("");

  const defaultSpouseSex = person.sex === "male" ? "female" : "male";

  return `
    <div class="notice" style="margin-bottom:10px;">
      <div class="notice-title">Persona</div>
      <div>${escapeHtml(personLabel(person))}</div>
    </div>

    <div class="grid2">
      <label class="field">
        <span class="label">Modo</span>
        <select class="input" id="tree-spouse-mode">
          <option value="create" selected>Crear nuevo cónyuge</option>
          <option value="link">Vincular cónyuge existente</option>
        </select>
      </label>
    </div>

    <div id="tree-spouse-create-fields" style="margin-top:10px;">
      <div class="grid2">
        <label class="field">
          <span class="label">Nombre del cónyuge</span>
          <input class="input" type="text" id="tree-spouse-name" value="">
        </label>
        <label class="field">
          <span class="label">Sexo del cónyuge</span>
          <select class="input" id="tree-spouse-sex">
            <option value="male" ${defaultSpouseSex === "male" ? "selected" : ""}>male</option>
            <option value="female" ${defaultSpouseSex === "female" ? "selected" : ""}>female</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Estado</span>
          <select class="input" id="tree-spouse-alive">
            <option value="alive" selected>vivo</option>
            <option value="dead">fallecido</option>
          </select>
        </label>
      </div>
    </div>

    <div id="tree-spouse-link-fields" style="margin-top:10px; display:none;">
      <label class="field">
        <span class="label">Cónyuge existente</span>
        <select class="input" id="tree-spouse-existing">
          ${existingOptions}
        </select>
      </label>
    </div>

    <div class="row" style="justify-content:flex-end; margin-top:12px; flex-wrap:wrap;">
      <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
      <button class="btn" type="button" data-tree-action="modal-save-add-spouse" data-person-id="${escapeHtml(personId)}">Guardar</button>
    </div>
  `;
}

/* =========================
   Page wiring
========================= */

export function wireBuilderTree(store){
  const root = document.getElementById("page-builder-tree");
  if (!root) return;

  const toggleChildFields = () => {
    const modeEl = document.getElementById("tree-child-mode");
    if (!modeEl) return;
    const v = modeEl.value;
    const create = document.getElementById("tree-child-create-fields");
    const link = document.getElementById("tree-child-link-fields");
    if (create && link){
      create.style.display = v === "create" ? "" : "none";
      link.style.display = v === "link" ? "" : "none";
    }
  };

  const toggleSpouseFields = () => {
    const modeEl = document.getElementById("tree-spouse-mode");
    if (!modeEl) return;
    const v = modeEl.value;
    const create = document.getElementById("tree-spouse-create-fields");
    const link = document.getElementById("tree-spouse-link-fields");
    if (create && link){
      create.style.display = v === "create" ? "" : "none";
      link.style.display = v === "link" ? "" : "none";
    }
  };

  toggleChildFields();
  toggleSpouseFields();

  const childMode = document.getElementById("tree-child-mode");
  if (childMode) childMode.addEventListener("change", toggleChildFields);
  const spouseMode = document.getElementById("tree-spouse-mode");
  if (spouseMode) spouseMode.addEventListener("change", toggleSpouseFields);

  const searchEl = document.getElementById("tree-search");
  if (searchEl){
    searchEl.addEventListener("input", () => {
      const value = searchEl.value;
      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          treeUi: { ...normalizeTreeUi(s.builder.treeUi), search: value },
        },
      }));
    });
  }

  root.addEventListener("click", (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest("[data-tree-action]") : null;
    if (!btn) return;

    const action = btn.getAttribute("data-tree-action");
    const personId = btn.getAttribute("data-person-id");
    const gen = btn.getAttribute("data-gen-key");

    if (action === "select" && personId){
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, treeSelectedId: personId },
      }));
      return;
    }

    if (action === "toggle-gen" && gen){
      store.setState((s) => {
        const ui = normalizeTreeUi(s.builder.treeUi);
        const next = { ...ui.collapsed, [gen]: !ui.collapsed?.[gen] };
        return { ...s, builder: { ...s.builder, treeUi: { ...ui, collapsed: next } } };
      });
      return;
    }

    if (action === "create-person"){
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: { type: "create-person" } } },
      }), { persist: false });
      return;
    }

    if (action === "edit" && personId){
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: { type: "edit", personId } } },
      }), { persist: false });
      return;
    }

    if (action === "add-child" && personId){
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: { type: "add-child", personId } } },
      }), { persist: false });
      return;
    }

    if (action === "add-spouse" && personId){
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: { type: "add-spouse", personId } } },
      }), { persist: false });
      return;
    }

    if (action === "set-deceased" && personId){
      store.setState((s) => {
        const tree0 = ensureTree(sanitizeTree(s.builder.tree));
        const tree1 = setDeceased(tree0, personId);
        return { ...s, builder: { ...s.builder, tree: tree1, treeSelectedId: personId } };
      });
      return;
    }

    if (action === "modal-cancel"){
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: null } },
      }), { persist: false });
      return;
    }

    if (action === "modal-save-edit" && personId){
      const name = document.getElementById("tree-edit-name")?.value ?? "";
      const sex = document.getElementById("tree-edit-sex")?.value ?? "";
      const aliveRaw = document.getElementById("tree-edit-alive")?.value ?? "alive";
      const alive = aliveRaw === "alive";

      store.setState((s) => {
        const tree0 = ensureTree(sanitizeTree(s.builder.tree));
        let tree1 = updatePerson(tree0, personId, { name, sex, alive });
        if (personId === tree1.deceasedId){
          tree1 = setDeceased(tree1, personId);
        }
        return {
          ...s,
          builder: {
            ...s.builder,
            tree: tree1,
            treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: null },
          },
        };
      });
      return;
    }

    if (action === "modal-save-create"){
      const name = document.getElementById("tree-create-name")?.value ?? "";
      const sex = document.getElementById("tree-create-sex")?.value ?? "male";
      const aliveRaw = document.getElementById("tree-create-alive")?.value ?? "alive";
      const alive = aliveRaw === "alive";

      store.setState((s) => {
        const tree0 = ensureTree(sanitizeTree(s.builder.tree));
        const nextId = nextPersonId(tree0);
        const newId = `p${nextId}`;
        const tree1 = addPerson(tree0, { name, sex, alive });
        return {
          ...s,
          builder: {
            ...s.builder,
            tree: tree1,
            treeSelectedId: newId,
            treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: null },
          },
        };
      });
      return;
    }

    if (action === "modal-save-add-child" && personId){
      const mode = document.getElementById("tree-child-mode")?.value ?? "create";
      const otherParent = document.getElementById("tree-child-other-parent")?.value ?? "";
      const otherParentId = otherParent && typeof otherParent === "string" ? otherParent : null;

      store.setState((s) => {
        const tree0 = ensureTree(sanitizeTree(s.builder.tree));
        let tree1 = tree0;

        if (mode === "create"){
          const name = document.getElementById("tree-child-name")?.value ?? "";
          const sex = document.getElementById("tree-child-sex")?.value ?? "male";
          const aliveRaw = document.getElementById("tree-child-alive")?.value ?? "alive";
          const alive = aliveRaw === "alive";

          const nextId = nextPersonId(tree1);
          tree1 = addPerson(tree1, { name, sex, alive });
          const childId = `p${nextId}`;
          tree1 = setParentRelation(tree1, childId, personId);
          if (otherParentId) tree1 = setOtherParent(tree1, childId, otherParentId);

          return {
            ...s,
            builder: {
              ...s.builder,
              tree: tree1,
              treeSelectedId: childId,
              treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: null },
            },
          };
        }

        const existingId = document.getElementById("tree-child-existing")?.value ?? "";
        if (existingId && tree1.people?.[existingId]){
          tree1 = setParentRelation(tree1, existingId, personId);
          if (otherParentId) tree1 = setOtherParent(tree1, existingId, otherParentId);
          return {
            ...s,
            builder: {
              ...s.builder,
              tree: tree1,
              treeSelectedId: existingId,
              treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: null },
            },
          };
        }

        return {
          ...s,
          builder: { ...s.builder, treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: null } },
        };
      });

      return;
    }

    if (action === "modal-save-add-spouse" && personId){
      const mode = document.getElementById("tree-spouse-mode")?.value ?? "create";

      store.setState((s) => {
        const tree0 = ensureTree(sanitizeTree(s.builder.tree));
        let tree1 = tree0;

        if (mode === "create"){
          const name = document.getElementById("tree-spouse-name")?.value ?? "";
          const sex = document.getElementById("tree-spouse-sex")?.value ?? "female";
          const aliveRaw = document.getElementById("tree-spouse-alive")?.value ?? "alive";
          const alive = aliveRaw === "alive";

          const nextId = nextPersonId(tree1);
          tree1 = addPerson(tree1, { name, sex, alive });
          const spouseId = `p${nextId}`;
          tree1 = linkSpouses(tree1, personId, spouseId);

          return {
            ...s,
            builder: {
              ...s.builder,
              tree: tree1,
              treeSelectedId: spouseId,
              treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: null },
            },
          };
        }

        const existingId = document.getElementById("tree-spouse-existing")?.value ?? "";
        if (existingId && tree1.people?.[existingId]){
          tree1 = linkSpouses(tree1, personId, existingId);
          return {
            ...s,
            builder: {
              ...s.builder,
              tree: tree1,
              treeSelectedId: existingId,
              treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: null },
            },
          };
        }

        return {
          ...s,
          builder: { ...s.builder, treeUi: { ...normalizeTreeUi(s.builder.treeUi), modal: null } },
        };
      });

      return;
    }

    if (action === "import-wizard"){
      openModal(store, {
        title: "Importar del Wizard",
        body: "Aplicará un merge controlado Wizard -> Tree. Esto no ocurre automáticamente.",
        confirmAction: "builder-tree-import-wizard",
        confirmLabel: "Importar",
      });
      return;
    }

    if (action === "reset"){
      openModal(store, {
        title: "Reset del Tree Builder",
        body: "Esto reinicia el árbol en el Builder. No toca el core. Continuar?",
        confirmAction: "builder-tree-reset",
        confirmLabel: "Reset",
      });
      return;
    }
  });
}

/* =========================
   Wizard -> Tree import (explicit only)
========================= */

export function applyWizardSyncTree(store){
  store.setState((s) => {
    const wizard = s.wizard || {};
    const tree0 = ensureTree(sanitizeTree(s.builder.tree));
    const tree1 = applyWizardToTree(tree0, wizard);

    return {
      ...s,
      builder: {
        ...s.builder,
        tree: tree1,
        fromWizardApplied: true,
        wizardHashApplied: computeWizardHash(wizard),
      },
    };
  });
}

// PR16a baseline: app.js importa importWizardToTree
export const importWizardToTree = applyWizardSyncTree;

function computeWizardHash(wizard){
  const stable = {
    deceased_sex: wizard?.deceased_sex || null,
    spouse: wizard?.spouse || null,
    descendants: wizard?.descendants || null,
    parents: wizard?.parents || null,
  };
  return JSON.stringify(stable);
}

function applyWizardToTree(tree, wizard){
  let out = tree;

  const deceasedId = out.deceasedId;

  const spouse = wizard?.spouse && typeof wizard.spouse === "object" ? wizard.spouse : {};
  if (spouse.enabled === true){
    const d = out.people[deceasedId];
    if (d?.sex === "male"){
      const wives = Number(spouse.wives_count || 0);
      const count = Math.max(0, Math.min(4, Math.trunc(wives)));
      for (let i = 0; i < count; i++){
        out = addPerson(out, { name: `Esposa ${i + 1}`, sex: "female", alive: true });
        const wid = `p${(out.nextId - 1)}`;
        out = linkSpouses(out, deceasedId, wid);
      }
    }
    if (d?.sex === "female" && spouse.husband_present === true){
      out = addPerson(out, { name: "Esposo", sex: "male", alive: true });
      const hid = `p${(out.nextId - 1)}`;
      out = linkSpouses(out, deceasedId, hid);
    }
  }

  const parents = wizard?.parents && typeof wizard.parents === "object" ? wizard.parents : {};
  if (Number(parents.father || 0) > 0){
    out = addPerson(out, { name: "Padre", sex: "male", alive: true });
    const fid = `p${(out.nextId - 1)}`;
    const rel = out.parents?.[deceasedId] && typeof out.parents[deceasedId] === "object" ? { ...out.parents[deceasedId] } : {};
    rel.fatherId = fid;
    out = { ...out, parents: { ...(out.parents || {}), [deceasedId]: rel } };
  }
  if (Number(parents.mother || 0) > 0){
    out = addPerson(out, { name: "Madre", sex: "female", alive: true });
    const mid = `p${(out.nextId - 1)}`;
    const rel = out.parents?.[deceasedId] && typeof out.parents[deceasedId] === "object" ? { ...out.parents[deceasedId] } : {};
    rel.motherId = mid;
    out = { ...out, parents: { ...(out.parents || {}), [deceasedId]: rel } };
  }

  const descendants = wizard?.descendants && typeof wizard.descendants === "object" ? wizard.descendants : {};
  const sons = Math.max(0, Math.min(20, Math.trunc(Number(descendants.son || 0))));
  const daughters = Math.max(0, Math.min(20, Math.trunc(Number(descendants.daughter || 0))));

  for (let i = 0; i < sons; i++){
    out = addPerson(out, { name: `Hijo ${i + 1}`, sex: "male", alive: true });
    const cid = `p${(out.nextId - 1)}`;
    out = setParentRelation(out, cid, deceasedId);
  }
  for (let i = 0; i < daughters; i++){
    out = addPerson(out, { name: `Hija ${i + 1}`, sex: "female", alive: true });
    const cid = `p${(out.nextId - 1)}`;
    out = setParentRelation(out, cid, deceasedId);
  }

  out = setDeceased(out, deceasedId);

  return ensureTree(sanitizeTree(out));
}
