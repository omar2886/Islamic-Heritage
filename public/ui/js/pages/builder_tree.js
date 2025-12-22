// public/ui/js/pages/builder_tree.js
import { openModal } from "../ui/modal.js";
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

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll("\"","&quot;")
    .replaceAll("'","&#039;");
}

/**
 * UI runtime state for the edit modal.
 * This is intentionally not persisted and does not touch the store while editing.
 */
let MODAL_RT = null;

function computeWizardHash(wizard){
  // Minimal stable hash for "wizard changed" detection.
  const safe = wizard && typeof wizard === "object" ? wizard : {};
  const payload = {
    deceased_sex: safe.deceased_sex || null,
    spouse: safe.spouse || null,
    descendants: safe.descendants || null,
    parents: safe.parents || null,
  };
  return JSON.stringify(payload);
}

function ensureBuilderTreeState(state){
  const builder = state.builder || {};
  const ui = builder.treeUi && typeof builder.treeUi === "object" ? builder.treeUi : {};
  const modal = builder.treeModal && typeof builder.treeModal === "object" ? builder.treeModal : null;

  return {
    search: typeof ui.search === "string" ? ui.search : "",
    collapsedGens: Array.isArray(ui.collapsedGens) ? ui.collapsedGens : [],
    modal,
  };
}

function normalizeSex(v){
  return v === "male" || v === "female" ? v : null;
}

function indexTree(tree){
  const deceasedId = tree.deceasedId;

  // Build childrenByParent for O(1) child lookup.
  const childrenByParent = {};
  for (const [childId, rel] of Object.entries(tree.parents || {})){
    if (!rel || typeof rel !== "object") continue;
    if (rel.fatherId) (childrenByParent[rel.fatherId] ||= []).push(childId);
    if (rel.motherId) (childrenByParent[rel.motherId] ||= []).push(childId);
  }

  const genById = {};
  const q = [{ id: deceasedId, gen: 0 }];
  genById[deceasedId] = 0;

  while (q.length){
    const cur = q.shift();
    const curId = cur.id;
    const curGen = cur.gen;

    // Parents (up one generation).
    const pr = getParents(tree, curId);
    if (pr.fatherId && genById[pr.fatherId] === undefined){
      genById[pr.fatherId] = curGen - 1;
      q.push({ id: pr.fatherId, gen: curGen - 1 });
    }
    if (pr.motherId && genById[pr.motherId] === undefined){
      genById[pr.motherId] = curGen - 1;
      q.push({ id: pr.motherId, gen: curGen - 1 });
    }

    // Children (down one generation).
    const kids = childrenByParent[curId] || [];
    for (const kidId of kids){
      if (genById[kidId] !== undefined) continue;
      genById[kidId] = curGen + 1;
      q.push({ id: kidId, gen: curGen + 1 });
    }

    // Spouses (same generation).
    const spouseIds = getSpouses(tree, curId);
    for (const sid of spouseIds){
      if (genById[sid] !== undefined) continue;
      genById[sid] = curGen;
      q.push({ id: sid, gen: curGen });
    }
  }

  const groups = {};
  let minGen = 0;
  let maxGen = 0;

  for (const [id, gen] of Object.entries(genById)){
    (groups[gen] ||= []).push(id);
    minGen = Math.min(minGen, gen);
    maxGen = Math.max(maxGen, gen);
  }

  // Disconnected nodes (not reachable from deceased by parent/child/spouse edges).
  const disconnected = Object.keys(tree.people || {}).filter((id) => genById[id] === undefined);

  // Sort each generation deterministically.
  for (const [genStr, ids] of Object.entries(groups)){
    ids.sort((aId, bId) => {
      if (aId === deceasedId) return -1;
      if (bId === deceasedId) return 1;
      const a = tree.people[aId];
      const b = tree.people[bId];
      if ((a?.alive === true) !== (b?.alive === true)) return (a?.alive === true) ? -1 : 1;
      const an = String(a?.name || "").toLowerCase();
      const bn = String(b?.name || "").toLowerCase();
      return an.localeCompare(bn);
    });
    groups[genStr] = ids;
  }

  return { genById, groups, minGen, maxGen, disconnected, childrenByParent };
}

function renderGenPills(minGen, maxGen, collapsedSet, disabled){
  const pills = [];
  for (let g = minGen; g <= maxGen; g++){
    const isCollapsed = collapsedSet.has(String(g));
    const label = g === 0 ? "0" : (g > 0 ? `+${g}` : String(g));
    const cls = isCollapsed ? "pill" : "pill pill-on";
    pills.push(`<button class="${cls}" type="button" data-gen-pill="${g}"${disabled ? " disabled" : ""}>Gen ${escapeHtml(label)}</button>`);
  }
  return pills.join("");
}

function renderNodeCard(tree, id, selectedId){
  const p = tree.people[id];
  if (!p) return "";

  const isSelected = id === selectedId;
  const isDeceased = id === tree.deceasedId;
  const sex = normalizeSex(p.sex);
  const sexLabel = sex === "male" ? "M" : sex === "female" ? "F" : "?";
  const aliveLabel = isDeceased ? "fallecido" : (p.alive ? "vivo" : "fallecido");

  const cls = [
    "tree-node",
    "card",
    "card-pad",
    isSelected ? "is-selected" : "",
    isDeceased ? "is-deceased" : "",
    sex === "male" ? "is-male" : (sex === "female" ? "is-female" : "is-unknown"),
  ].filter(Boolean).join(" ");

  const parents = getParents(tree, id);
  const kids = getChildren(tree, id);
  const spouses = getSpouses(tree, id);

  const metaBits = [
    parents.fatherId || parents.motherId ? `Padres: ${[parents.fatherId, parents.motherId].filter(Boolean).length}` : "Padres: 0",
    `Hijos: ${kids.length}`,
    `Cónyuges: ${spouses.length}`,
  ].join(" · ");

  return `
    <div class="${cls}" data-person-id="${escapeHtml(id)}">
      <div class="row" style="justify-content:space-between; align-items:flex-start; gap:10px;">
        <div class="stack" style="gap:6px;">
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            <strong style="font-size:15px;">${escapeHtml(p.name || "Persona")}</strong>
            ${isDeceased ? `<span class="badge badge-danger">Causante</span>` : ""}
            <span class="badge">${escapeHtml(sexLabel)}</span>
            <span class="badge">${escapeHtml(aliveLabel)}</span>
          </div>
          <div class="tree-meta">${escapeHtml(metaBits)}</div>
        </div>
        <div class="tree-actions">
          <button class="btn btn-xs" type="button" data-tree-action="add-child" data-person-id="${escapeHtml(id)}">+ Hijo/a</button>
          <button class="btn btn-xs" type="button" data-tree-action="add-spouse" data-person-id="${escapeHtml(id)}">+ Cónyuge</button>
          <button class="btn btn-xs" type="button" data-tree-action="edit" data-person-id="${escapeHtml(id)}">Editar</button>
          ${isDeceased ? "" : `<button class="btn btn-xs" type="button" data-tree-action="set-deceased" data-person-id="${escapeHtml(id)}">Set causante</button>`}
        </div>
      </div>
    </div>
  `;
}

function renderEditModal(tree, modal){
  if (!modal || modal.type !== "edit" || !modal.personId) return "";
  const id = modal.personId;
  const p = tree.people[id];
  if (!p) return "";

  const parents = getParents(tree, id);
  const spouses = getSpouses(tree, id);

  const peopleIds = Object.keys(tree.people || {});
  const fatherOptions = peopleIds
    .filter((pid) => pid !== id)
    .map((pid) => tree.people[pid])
    .filter((pp) => pp && normalizeSex(pp.sex) === "male")
    .sort((a,b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((pp) => `<option value="${escapeHtml(pp.id)}"${parents.fatherId === pp.id ? " selected" : ""}>${escapeHtml(pp.name || pp.id)}</option>`)
    .join("");

  const motherOptions = peopleIds
    .filter((pid) => pid !== id)
    .map((pid) => tree.people[pid])
    .filter((pp) => pp && normalizeSex(pp.sex) === "female")
    .sort((a,b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((pp) => `<option value="${escapeHtml(pp.id)}"${parents.motherId === pp.id ? " selected" : ""}>${escapeHtml(pp.name || pp.id)}</option>`)
    .join("");

  const spousePickOptions = peopleIds
    .filter((pid) => pid !== id && !spouses.includes(pid))
    .map((pid) => tree.people[pid])
    .filter(Boolean)
    .sort((a,b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((pp) => `<option value="${escapeHtml(pp.id)}">${escapeHtml(pp.name || pp.id)}</option>`)
    .join("");

  const spouseList = spouses.length
    ? `<div class="stack" style="gap:6px;">
        ${spouses.map((sid) => {
          const sp = tree.people[sid];
          return `
            <label class="row tree-spouse-row">
              <input type="checkbox" data-spouse-remove="${escapeHtml(sid)}" />
              <span>${escapeHtml(sp?.name || sid)}</span>
              <span class="badge">${escapeHtml(normalizeSex(sp?.sex) === "male" ? "M" : "F")}</span>
              <span class="badge">${escapeHtml(sp?.alive ? "vivo" : "fallecido")}</span>
            </label>
          `;
        }).join("")}
        <p class="wizard-hint" style="margin:0;">Marca para desvincular (se aplica al guardar).</p>
      </div>`
    : `<p class="wizard-hint" style="margin:0;">Sin cónyuges.</p>`;

  const sex = normalizeSex(p.sex) || "male";

  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Editar persona">
      <div class="modal card card-pad tree-modal">
        <div class="row" style="justify-content:space-between; gap:12px; align-items:center;">
          <strong>Editar: ${escapeHtml(p.name || id)}</strong>
          <button class="btn" type="button" id="tree-modal-cancel">Cerrar</button>
        </div>

        <div class="stack" style="gap:12px; margin-top:10px;">
          <div class="wizard-fields">
            <label class="stack" style="gap:6px;">
              <span class="wizard-hint">Nombre (opcional)</span>
              <input class="input" id="tree-edit-name" type="text" value="${escapeHtml(p.name || "" )}" autocomplete="off" />
            </label>

            <label class="stack" style="gap:6px;">
              <span class="wizard-hint">Sexo</span>
              <select class="input" id="tree-edit-sex">
                <option value="male"${sex === "male" ? " selected" : ""}>Masculino</option>
                <option value="female"${sex === "female" ? " selected" : ""}>Femenino</option>
              </select>
            </label>

            <label class="row" style="gap:10px; align-items:center; margin-top:18px;">
              <input id="tree-edit-alive" type="checkbox"${p.alive ? " checked" : ""} />
              <span>Vivo</span>
            </label>

            <label class="row" style="gap:10px; align-items:center; margin-top:18px;">
              <input id="tree-edit-set-deceased" type="checkbox"${id === tree.deceasedId ? " checked" : ""} />
              <span>Es causante</span>
            </label>
          </div>

          <hr class="hr" />

          <div class="stack" style="gap:10px;">
            <strong style="font-size:14px;">Vínculos (reusar nodos existentes)</strong>

            <div class="wizard-fields">
              <label class="stack" style="gap:6px;">
                <span class="wizard-hint">Padre</span>
                <select class="input" id="tree-edit-father">
                  <option value="">(sin padre)</option>
                  ${fatherOptions}
                </select>
              </label>

              <label class="stack" style="gap:6px;">
                <span class="wizard-hint">Madre</span>
                <select class="input" id="tree-edit-mother">
                  <option value="">(sin madre)</option>
                  ${motherOptions}
                </select>
              </label>
            </div>

            <div class="stack" style="gap:8px;">
              <div class="row" style="justify-content:space-between; gap:10px; align-items:center;">
                <span class="wizard-hint" style="margin:0;">Cónyuges actuales</span>
              </div>
              ${spouseList}
            </div>

            <div class="stack" style="gap:8px;">
              <span class="wizard-hint" style="margin:0;">Añadir cónyuge existente</span>
              <div class="row" style="gap:8px; align-items:center;">
                <select class="input" id="tree-edit-spouse-pick" style="flex:1;">
                  <option value="">(selecciona)</option>
                  ${spousePickOptions}
                </select>
                <button class="btn" type="button" id="tree-edit-spouse-add">Añadir</button>
              </div>
              <div class="stack" id="tree-edit-spouse-pending" style="gap:6px;"></div>
            </div>
          </div>

          <div class="row" style="justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:6px;">
            <button class="btn" type="button" id="tree-modal-save">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDisconnected(tree, disconnected, selectedId){
  if (!disconnected || disconnected.length === 0) return "";
  const items = disconnected
    .map((id) => tree.people[id])
    .filter(Boolean)
    .sort((a,b) => String(a.name || "").localeCompare(String(b.name || "")))
    .map((p) => {
      const isSel = p.id === selectedId;
      const cls = isSel ? "tree-dis-item is-selected" : "tree-dis-item";
      return `<button class="${cls}" type="button" data-tree-action="select" data-person-id="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</button>`;
    })
    .join("");
  return `
    <section class="card card-pad stack">
      <h3 style="margin:0;">No conectados</h3>
      <p class="wizard-hint" style="margin:0;">Personas que no están conectadas al causante por parentesco o matrimonio.</p>
      <div class="tree-dis-list">${items}</div>
    </section>
  `;
}

function renderPayloadPreview(builder){
  const payload = builder.payloadPreview || { heirs: [] };
  const json = JSON.stringify(payload, null, 2);
  return `
    <section class="card card-pad stack">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">Payload preview</h3>
        <button class="btn" type="button" id="builder-copy-json">Copiar JSON</button>
      </div>
      <pre class="codebox" id="builder-json">${escapeHtml(json)}</pre>
      <p class="wizard-hint" style="margin:0;">Vista previa. Se enviará a calc.php desde results.</p>
    </section>
  `;
}

export function renderBuilderTree(state){
  const builder = state.builder || {};
  const wizard = state.wizard || {};
  const tree = ensureTree(sanitizeTree(builder.tree));
  const uiState = ensureBuilderTreeState(state);

  const selectedId = (typeof builder.treeSelectedId === "string" && tree.people[builder.treeSelectedId])
    ? builder.treeSelectedId
    : tree.deceasedId;

  const idx = indexTree(tree);
  const collapsedSet = new Set((uiState.collapsedGens || []).map(String));
  const search = (uiState.search || "").trim().toLowerCase();

  const wizardHashNow = computeWizardHash(wizard);
  const wizardChanged = !!builder.fromWizardApplied && (wizardHashNow !== (builder.wizardHashApplied || null));

  const gensHtml = [];
  for (let g = idx.minGen; g <= idx.maxGen; g++){
    const ids = idx.groups[String(g)] || [];
    const visibleIds = search
      ? ids.filter((id) => String(tree.people[id]?.name || "").toLowerCase().includes(search))
      : ids;

    if (visibleIds.length === 0) continue;

    const isCollapsed = collapsedSet.has(String(g));
    const label = g === 0 ? "0" : (g > 0 ? `+${g}` : String(g));
    gensHtml.push(`
      <section class="tree-gen">
        <div class="tree-gen-head">
          <button class="btn btn-xs" type="button" data-gen-toggle="${g}">${isCollapsed ? "Desplegar" : "Plegar"}</button>
          <strong>Generación ${escapeHtml(label)}</strong>
          <span class="badge">${visibleIds.length}</span>
        </div>
        ${isCollapsed ? "" : `
          <div class="tree-gen-body">
            ${visibleIds.map((id) => renderNodeCard(tree, id, selectedId)).join("")}
          </div>
        `}
      </section>
    `);
  }

  const modalHtml = renderEditModal(tree, uiState.modal);

  return `
    <div id="builder-tree-root">
      <section class="stack">
        <div class="card card-pad builder-banner">
          <div class="row" style="justify-content:space-between; align-items:center; gap:12px;">
            <div class="stack">
              <h1 style="margin:0;">Tree Builder (v2)</h1>
              <p class="wizard-hint" style="margin:0;">
                Árbol relacional. Acciones por nodo: hijo/a, cónyuge, editar, set causante.
              </p>
              <div class="segmented" role="tablist" aria-label="Modo de builder">
                <button class="segmented-btn is-active" id="builder-mode-tree" type="button">Árbol</button>
                <button class="segmented-btn" id="builder-mode-roles" type="button">Roles</button>
              </div>
            </div>
            <span class="badge">Local only</span>
          </div>
        </div>

        ${wizardChanged ? `
          <div class="card card-pad builder-banner">
            <div class="row" style="justify-content:space-between; align-items:flex-start; gap:12px;">
              <div class="stack" style="gap:6px;">
                <strong>Wizard actualizado</strong>
                <p class="wizard-hint" style="margin:0;">El wizard no se aplica automáticamente. Importa al árbol solo cuando lo pidas.</p>
              </div>
            </div>
          </div>
        ` : ""}

        <div class="row" style="justify-content:flex-end; gap:10px; flex-wrap:wrap;">
          <button class="btn" type="button" id="tree-import-wizard">Importar del wizard</button>
          <button class="btn" type="button" id="tree-reset-tree">Reset árbol</button>
          <button class="btn" type="button" id="tree-add-person">+ Persona</button>
        </div>

        <div class="builder-grid">
          <div class="stack builder-left">
            <section class="card card-pad stack">
              <div class="row" style="gap:10px; flex-wrap:wrap; align-items:center;">
                <input class="input" id="tree-search" type="search" placeholder="Buscar por nombre" value="${escapeHtml(uiState.search)}"${uiState.modal ? " disabled" : ""} />
                <div class="row" style="gap:8px; flex-wrap:wrap;">
                  ${renderGenPills(idx.minGen, idx.maxGen, collapsedSet, !!uiState.modal)}
                </div>
                <button class="btn btn-xs" type="button" id="tree-collapse-all"${uiState.modal ? " disabled" : ""}>Plegar todo</button>
                <button class="btn btn-xs" type="button" id="tree-expand-all"${uiState.modal ? " disabled" : ""}>Desplegar todo</button>
              </div>

              <div class="stack tree-gen-list">
                ${gensHtml.join("")}
              </div>
            </section>

            ${renderDisconnected(tree, idx.disconnected, selectedId)}
          </div>

          <div class="stack builder-right">
            ${renderPayloadPreview(builder)}
            <section class="card card-pad stack">
              <div class="row" style="gap:8px; flex-wrap:wrap;">
                <a class="btn" href="#/wizard">Volver al wizard</a>
                <a class="btn" href="#/results" id="builder-continue">Continuar a results</a>
              </div>
              <p class="wizard-hint" style="margin:0;">En PR16c se añade la sección unmapped/unsupported por nodo.</p>
            </section>
          </div>
        </div>

        ${modalHtml}
      </section>
    </div>
  `;
}

function setTreeUi(store, patch){
  store.setState((s) => ({
    ...s,
    builder: {
      ...(s.builder || {}),
      treeUi: {
        ...(((s.builder || {}).treeUi) || { search: "", collapsedGens: [] }),
        ...patch,
      },
    },
  }));
}

function openEdit(store, personId){
  MODAL_RT = {
    personId,
    spouseAdds: new Set(),
  };

  store.setState((s) => ({
    ...s,
    builder: {
      ...(s.builder || {}),
      treeModal: { type: "edit", personId },
    },
  }), { persist: false });
}

function closeEdit(store){
  MODAL_RT = null;
  store.setState((s) => ({
    ...s,
    builder: {
      ...(s.builder || {}),
      treeModal: null,
    },
  }), { persist: false });
}

function applyEditSave(store){
  const s = store.getState();
  const builder = s.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree));
  const modal = builder.treeModal;

  if (!modal || modal.type !== "edit" || !modal.personId) return;
  const id = modal.personId;
  if (!tree.people[id]) return;

  const elName = document.getElementById("tree-edit-name");
  const elSex = document.getElementById("tree-edit-sex");
  const elAlive = document.getElementById("tree-edit-alive");
  const elSetDeceased = document.getElementById("tree-edit-set-deceased");
  const elFather = document.getElementById("tree-edit-father");
  const elMother = document.getElementById("tree-edit-mother");

  const name = elName ? String(elName.value || "").trim() : "";
  const sex = elSex ? String(elSex.value || "") : "male";
  const alive = elAlive ? !!elAlive.checked : true;
  const setAsDeceased = elSetDeceased ? !!elSetDeceased.checked : false;

  const fatherId = elFather ? String(elFather.value || "") : "";
  const motherId = elMother ? String(elMother.value || "") : "";

  // Spouse removals from checkboxes.
  const removeIds = Array.from(document.querySelectorAll("[data-spouse-remove]"))
    .filter((el) => el && el.checked)
    .map((el) => String(el.getAttribute("data-spouse-remove") || ""))
    .filter(Boolean);

  const addIds = MODAL_RT && MODAL_RT.spouseAdds ? Array.from(MODAL_RT.spouseAdds) : [];

  store.setState((st) => {
    const b = st.builder || {};
    let t = ensureTree(sanitizeTree(b.tree));

    // Update person fields (do not allow deceased alive=true).
    t = updatePerson(t, id, {
      name: name || (t.people[id]?.name || "Persona"),
      sex: (sex === "male" || sex === "female") ? sex : "male",
      alive: setAsDeceased ? false : Boolean(alive),
    });

    // Parents (reuse existing nodes only).
    t = setParents(t, id, {
      fatherId: fatherId || null,
      motherId: motherId || null,
    });

    // Spouse adds/removals.
    for (const sid of addIds){
      if (!sid || !t.people[sid] || sid === id) continue;
      t = linkSpouses(t, id, sid);
    }
    for (const sid of removeIds){
      if (!sid || !t.people[sid] || sid === id) continue;
      t = unlinkSpouses(t, id, sid);
    }

    // Set causante.
    if (setAsDeceased){
      t = { ...t, deceasedId: id };
      t = updatePerson(t, id, { alive: false, name: t.people[id]?.name || "Causante" });
    }

    // Final schema and spouse symmetry.
    t = ensureTree(sanitizeTree(t));

    return {
      ...st,
      builder: {
        ...b,
        tree: t,
        treeSelectedId: id,
        treeModal: null,
      },
    };
  }, { persist: true });

  MODAL_RT = null;
}

function addPendingSpouse(store){
  const s = store.getState();
  const builder = s.builder || {};
  const modal = builder.treeModal;
  if (!modal || modal.type !== "edit") return;

  const pick = document.getElementById("tree-edit-spouse-pick");
  if (!pick) return;

  const sid = String(pick.value || "");
  if (!sid) return;

  MODAL_RT = MODAL_RT || { personId: modal.personId, spouseAdds: new Set() };
  if (!MODAL_RT.spouseAdds) MODAL_RT.spouseAdds = new Set();
  MODAL_RT.spouseAdds.add(sid);

  // Reflect in UI without touching the store.
  const box = document.getElementById("tree-edit-spouse-pending");
  if (box){
    const pill = document.createElement("div");
    pill.className = "tree-pending";
    pill.setAttribute("data-pending-spouse", sid);
    const st = store.getState();
    const t = ensureTree(sanitizeTree((st.builder || {}).tree));
    const sp = t.people[sid];
    const label = sp ? (sp.name || sid) : sid;
    pill.innerHTML = `<span>${escapeHtml(label)}</span><button class="btn btn-xs" type="button" data-pending-remove="${escapeHtml(sid)}">Quitar</button>`;
    box.appendChild(pill);
  }

  pick.value = "";
}

function wireModalRuntimeHandlers(root, store){
  const btnAdd = document.getElementById("tree-edit-spouse-add");
  if (btnAdd){
    btnAdd.addEventListener("click", (e) => {
      e.preventDefault();
      addPendingSpouse(store);
    });
  }

  const pendingBox = document.getElementById("tree-edit-spouse-pending");
  if (pendingBox){
    pendingBox.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("[data-pending-remove]") : null;
      if (!btn) return;
      const sid = String(btn.getAttribute("data-pending-remove") || "");
      if (!sid) return;
      if (MODAL_RT && MODAL_RT.spouseAdds) MODAL_RT.spouseAdds.delete(sid);
      const row = pendingBox.querySelector(`[data-pending-spouse="${CSS.escape(sid)}"]`);
      if (row) row.remove();
    });
  }
}

function createLinkedChild(store, parentId){
  const st0 = store.getState();
  const b0 = st0.builder || {};
  const base = ensureTree(sanitizeTree(b0.tree));

  const parent = base.people[parentId];
  const parentSex = normalizeSex(parent?.sex);

  const newId = `p${base.nextId}`;
  let t = addPerson(base, { name: "Hijo/a", sex: "male", alive: true });

  // If parent sex is known, set the corresponding parent pointer.
  if (parentSex === "male"){
    t = setParents(t, newId, { fatherId: parentId, motherId: null });
  } else if (parentSex === "female"){
    t = setParents(t, newId, { fatherId: null, motherId: parentId });
  }

  t = ensureTree(sanitizeTree(t));

  store.setState({
    ...st0,
    builder: {
      ...b0,
      tree: t,
      treeSelectedId: newId,
      treeModal: { type: "edit", personId: newId },
    },
  }, { persist: true });

  MODAL_RT = { personId: newId, spouseAdds: new Set() };
}

function createLinkedSpouse(store, personId){
  const st0 = store.getState();
  const b0 = st0.builder || {};
  const base = ensureTree(sanitizeTree(b0.tree));

  const p = base.people[personId];
  const sx = normalizeSex(p?.sex);

  const newId = `p${base.nextId}`;
  const spouseSex = sx === "male" ? "female" : (sx === "female" ? "male" : "female");

  let t = addPerson(base, { name: "Cónyuge", sex: spouseSex, alive: true });
  t = linkSpouses(t, personId, newId);
  t = ensureTree(sanitizeTree(t));

  store.setState({
    ...st0,
    builder: {
      ...b0,
      tree: t,
      treeSelectedId: newId,
      treeModal: { type: "edit", personId: newId },
    },
  }, { persist: true });

  MODAL_RT = { personId: newId, spouseAdds: new Set() };
}

function createStandalonePerson(store){
  const st0 = store.getState();
  const b0 = st0.builder || {};
  const base = ensureTree(sanitizeTree(b0.tree));

  const newId = `p${base.nextId}`;
  let t = addPerson(base, { name: "Persona", sex: "male", alive: true });
  t = ensureTree(sanitizeTree(t));

  store.setState({
    ...st0,
    builder: {
      ...b0,
      tree: t,
      treeSelectedId: newId,
      treeModal: { type: "edit", personId: newId },
    },
  }, { persist: true });

  MODAL_RT = { personId: newId, spouseAdds: new Set() };
}

function setDeceased(store, personId){
  store.setState((st) => {
    const b = st.builder || {};
    let t = ensureTree(sanitizeTree(b.tree));
    if (!t.people[personId]) return st;

    t = { ...t, deceasedId: personId };
    t = updatePerson(t, personId, { alive: false, name: t.people[personId]?.name || "Causante" });
    t = ensureTree(sanitizeTree(t));

    return {
      ...st,
      builder: {
        ...b,
        tree: t,
        treeSelectedId: personId,
      },
    };
  }, { persist: true });
}

function toggleGen(store, gen){
  store.setState((st) => {
    const b = st.builder || {};
    const ui = (b.treeUi && typeof b.treeUi === "object") ? b.treeUi : { search: "", collapsedGens: [] };
    const cur = new Set(Array.isArray(ui.collapsedGens) ? ui.collapsedGens.map(String) : []);
    const key = String(gen);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);

    return {
      ...st,
      builder: {
        ...b,
        treeUi: {
          ...ui,
          collapsedGens: Array.from(cur.values()),
        },
      },
    };
  }, { persist: true });
}

function collapseAll(store, mode){
  store.setState((st) => {
    const b = st.builder || {};
    const ui = (b.treeUi && typeof b.treeUi === "object") ? b.treeUi : { search: "", collapsedGens: [] };

    if (mode === "none"){
      return { ...st, builder: { ...b, treeUi: { ...ui, collapsedGens: [] } } };
    }

    // Derive generations from current tree.
    const t = ensureTree(sanitizeTree(b.tree));
    const idx = indexTree(t);

    const all = [];
    for (let g = idx.minGen; g <= idx.maxGen; g++){
      all.push(String(g));
    }

    return {
      ...st,
      builder: {
        ...b,
        treeUi: {
          ...ui,
          collapsedGens: all,
        },
      },
    };
  }, { persist: true });
}

function scrollToPerson(personId){
  if (!personId) return;
  setTimeout(() => {
    const el = document.querySelector(`[data-person-id="${CSS.escape(personId)}"]`);
    if (el && el.scrollIntoView){
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, 0);
}

export function wireBuilderTree(store){
  const root = document.getElementById("builder-tree-root");
  if (!root) return;

  // Wizard import (explicit).
  const btnImport = document.getElementById("tree-import-wizard");
  if (btnImport){
    btnImport.addEventListener("click", () => {
      openModal(store, {
        title: "Importar del wizard",
        body: "Se fusionará un seed mínimo del wizard dentro del árbol. No se aplica automáticamente en sanitize.",
        confirmAction: "builder-tree-import-wizard",
        confirmLabel: "Importar",
      });
    });
  }

  // Reset tree.
  const btnReset = document.getElementById("tree-reset-tree");
  if (btnReset){
    btnReset.addEventListener("click", () => {
      openModal(store, {
        title: "Reset del árbol",
        body: "Se borrará el árbol actual (solo UI local).",
        confirmAction: "builder-tree-reset",
        confirmLabel: "Reset",
      });
    });
  }

  // Add standalone person.
  const btnAdd = document.getElementById("tree-add-person");
  if (btnAdd){
    btnAdd.addEventListener("click", () => createStandalonePerson(store));
  }

  // Copy JSON.
  const btnCopy = document.getElementById("builder-copy-json");
  if (btnCopy){
    btnCopy.addEventListener("click", async () => {
      const s = store.getState();
      const payload = (s.builder && s.builder.payloadPreview) ? s.builder.payloadPreview : { heirs: [] };
      const text = JSON.stringify(payload, null, 2);
      try { await navigator.clipboard.writeText(text); } catch {}
    });
  }

  // Search input (debounced).
  let searchTimer = null;
  const input = document.getElementById("tree-search");
  if (input){
    input.addEventListener("input", () => {
      const value = String(input.value || "");
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => setTreeUi(store, { search: value }), 250);
    });
  }

  // Collapse controls.
  const btnCollapseAll = document.getElementById("tree-collapse-all");
  if (btnCollapseAll) btnCollapseAll.addEventListener("click", () => collapseAll(store, "all"));
  const btnExpandAll = document.getElementById("tree-expand-all");
  if (btnExpandAll) btnExpandAll.addEventListener("click", () => collapseAll(store, "none"));

  // Event delegation for node actions and generation toggles.
  root.addEventListener("click", (e) => {
    const target = e.target;

    const genBtn = target && target.closest ? target.closest("[data-gen-toggle]") : null;
    if (genBtn){
      const g = Number(genBtn.getAttribute("data-gen-toggle"));
      if (Number.isFinite(g)) toggleGen(store, g);
      return;
    }

    const genPill = target && target.closest ? target.closest("[data-gen-pill]") : null;
    if (genPill){
      const g = Number(genPill.getAttribute("data-gen-pill"));
      if (Number.isFinite(g)) toggleGen(store, g);
      return;
    }

    const actionBtn = target && target.closest ? target.closest("[data-tree-action]") : null;
    if (actionBtn){
      const action = actionBtn.getAttribute("data-tree-action");
      const id = actionBtn.getAttribute("data-person-id");
      if (!id) return;

      if (action === "add-child") return createLinkedChild(store, id);
      if (action === "add-spouse") return createLinkedSpouse(store, id);
      if (action === "edit") return openEdit(store, id);
      if (action === "set-deceased") return setDeceased(store, id);
      if (action === "select"){
        store.setState((st) => ({
          ...st,
          builder: { ...(st.builder || {}), treeSelectedId: id },
        }), { persist: true });
        scrollToPerson(id);
        return;
      }
    }

    // Clicking on a card selects it.
    const card = target && target.closest ? target.closest("[data-person-id]") : null;
    if (card && card.getAttribute){
      const id = card.getAttribute("data-person-id");
      if (id){
        store.setState((st) => ({
          ...st,
          builder: { ...(st.builder || {}), treeSelectedId: id },
        }), { persist: true });
        scrollToPerson(id);
      }
    }
  });

  // Modal buttons.
  const btnCancel = document.getElementById("tree-modal-cancel");
  if (btnCancel) btnCancel.addEventListener("click", () => closeEdit(store));
  const btnSave = document.getElementById("tree-modal-save");
  if (btnSave) btnSave.addEventListener("click", () => applyEditSave(store));

  // Runtime spouse list handlers.
  wireModalRuntimeHandlers(root, store);
}

/**
 * Explicit wizard import into the tree.
 * This function is called by app.js on modal confirm action "builder-tree-import-wizard".
 */
export function applyWizardSyncTree(store){
  const s = store.getState();
  const wizard = s.wizard || {};
  const wizardHashNow = computeWizardHash(wizard);

  store.setState((st) => {
    const b = st.builder || {};
    let t = sanitizeTree(b.tree);

    // If no tree yet, seed it with wizard deceased sex if provided, otherwise default.
    if (!t || !t.people || Object.keys(t.people).length === 0){
      const sex = (wizard.deceased_sex === "male" || wizard.deceased_sex === "female") ? wizard.deceased_sex : "male";
      t = ensureTree({ version: 1, deceasedId: "p1", nextId: 2, people: { p1: { id: "p1", name: "Causante", sex, alive: false } }, parents: {}, spouses: {} });
    } else {
      t = ensureTree(t);
    }

    // Merge: add minimal nodes reflecting wizard counts (aditive only).
    t = applyWizardToTree(t, wizard);

    t = ensureTree(sanitizeTree(t));

    return {
      ...st,
      builder: {
        ...b,
        tree: t,
        fromWizardApplied: true,
        wizardHashApplied: wizardHashNow,
      },
    };
  }, { persist: true });
}

export function importWizardToTree(store){
  return applyWizardSyncTree(store);
}

function applyWizardToTree(tree, wizard){
  const w = wizard && typeof wizard === "object" ? wizard : {};
  let t = ensureTree(tree);

  // Descendants seed: creates direct children of deceased (sons and daughters).
  const decId = t.deceasedId;
  const sons = Number(w?.descendants?.son ?? 0) || 0;
  const daughters = Number(w?.descendants?.daughter ?? 0) || 0;

  const dec = t.people[decId];
  const decSex = normalizeSex(dec?.sex) || "male";

  for (let i = 0; i < sons; i++){
    const childId = `p${t.nextId}`;
    t = addPerson(t, { name: `Hijo ${i + 1}`, sex: "male", alive: true });
    // Set deceased as parent if sex known.
    if (decSex === "male") t = setParents(t, childId, { fatherId: decId, motherId: null });
    else t = setParents(t, childId, { fatherId: null, motherId: decId });
  }
  for (let i = 0; i < daughters; i++){
    const childId = `p${t.nextId}`;
    t = addPerson(t, { name: `Hija ${i + 1}`, sex: "female", alive: true });
    if (decSex === "male") t = setParents(t, childId, { fatherId: decId, motherId: null });
    else t = setParents(t, childId, { fatherId: null, motherId: decId });
  }

  // Parents seed (alive flags only, create if missing).
  if (w?.parents?.enabled === true){
    const pr = getParents(t, decId);
    if (!pr.fatherId){
      const fid = `p${t.nextId}`;
      t = addPerson(t, { name: "Padre", sex: "male", alive: !!w.parents.father_alive });
      t = setParents(t, decId, { fatherId: fid, motherId: pr.motherId || null });
    } else {
      t = updatePerson(t, pr.fatherId, { alive: !!w.parents.father_alive });
    }

    if (!pr.motherId){
      const mid = `p${t.nextId}`;
      t = addPerson(t, { name: "Madre", sex: "female", alive: !!w.parents.mother_alive });
      const pr2 = getParents(t, decId);
      t = setParents(t, decId, { fatherId: pr2.fatherId || null, motherId: mid });
    } else {
      t = updatePerson(t, pr.motherId, { alive: !!w.parents.mother_alive });
    }
  }

  // Spouse seed: based on deceased sex from tree (wizard does not override).
  if (w?.spouse?.enabled === true){
    if (decSex === "male"){
      const wives = Number(w?.spouse?.wives_count ?? 0) || 0;
      for (let i = 0; i < wives; i++){
        const wid = `p${t.nextId}`;
        t = addPerson(t, { name: `Esposa ${i + 1}`, sex: "female", alive: true });
        t = linkSpouses(t, decId, wid);
      }
    } else if (decSex === "female"){
      const hasHusband = !!w?.spouse?.husband_present;
      if (hasHusband){
        const hid = `p${t.nextId}`;
        t = addPerson(t, { name: "Esposo", sex: "male", alive: true });
        t = linkSpouses(t, decId, hid);
      }
    }
  }

  // Never import wizard deceased_sex into the tree after creation.
  // The tree remains the source of truth.

  return t;
}
