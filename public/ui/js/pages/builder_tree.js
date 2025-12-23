// public/ui/js/pages/builder_tree.js
import {
  ensureTree,
  sanitizeTree,
  addPerson,
  updatePerson,
  removePerson,
  linkSpouses,
  unlinkSpouses,
  setParents,
  getParents,
  getSpouses,
  getChildren,
} from "../domain/familyTree.js";

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normStr(s){
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function safeSex(v){
  const s = String(v || "").trim();
  if (s === "male" || s === "female") return s;
  return null;
}

function computeWizardHash(w){
  try {
    return JSON.stringify(w || {});
  } catch {
    return String(Date.now());
  }
}

function getTreeFromState(state){
  const builder = state?.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree), null);
  return tree;
}

function getTreeUi(builder){
  const ui = builder?.treeUi || {};
  return {
    search: typeof ui.search === "string" ? ui.search : "",
    collapsedLevels: (ui.collapsedLevels && typeof ui.collapsedLevels === "object") ? ui.collapsedLevels : {},
    showDisconnected: ui.showDisconnected !== false,
    peopleListCollapsed: ui.peopleListCollapsed === true,
    modal: (ui.modal && typeof ui.modal === "object") ? ui.modal : null,
    selectedId: typeof ui.selectedId === "string" ? ui.selectedId : null,
  };
}

function setTreeUi(store, partial, { persist = true } = {}){
  store.setState((s) => {
    const builder = s.builder || {};
    const prevUi = getTreeUi(builder);
    return {
      ...s,
      builder: {
        ...builder,
        treeUi: { ...prevUi, ...partial },
      },
    };
  }, { persist });
}

function setTreeUiErr(state, msg){
  return {
    ...state,
    builder: {
      ...state.builder,
      treeUi: {
        ...getTreeUi(state.builder),
        modal: { ...(getTreeUi(state.builder).modal || {}), error: msg },
      },
    },
  };
}

function selectPerson(store, personId){
  setTreeUi(store, { selectedId: String(personId || "") }, { persist: true });
}

function openCreateModal(store){
  setTreeUi(
    store,
    { modal: { type: "create", fields: { name: "", sex: "", alive: true }, error: null } },
    { persist: false }
  );
}

function openEditModal(store, personId){
  const st = store.getState();
  const tree = getTreeFromState(st);
  const p = tree.people?.[personId] || {};
  setTreeUi(
    store,
    { modal: { type: "edit", personId, fields: { name: p.name || "", sex: p.sex || "", alive: p.alive !== false }, error: null } },
    { persist: false }
  );
}

function openAddSpouseModal(store, personId){
  setTreeUi(
    store,
    { modal: { type: "add-spouse", personId, fields: { name: "", sex: "", alive: true, existingId: "" }, error: null } },
    { persist: false }
  );
}

function openAddChildModal(store, parentId){
  setTreeUi(
    store,
    { modal: { type: "add-child", parentId, fields: { name: "", sex: "", alive: true, existingId: "" }, error: null } },
    { persist: false }
  );
}

function closeTreeModal(store){
  setTreeUi(store, { modal: null }, { persist: false });
}

function updateModalField(store, key, value){
  store.setState((s) => {
    const ui = getTreeUi(s.builder || {});
    const modal = ui.modal;
    if (!modal) return s;
    return {
      ...s,
      builder: {
        ...s.builder,
        treeUi: {
          ...ui,
          modal: {
            ...modal,
            fields: {
              ...(modal.fields || {}),
              [key]: value,
            },
          },
        },
      },
    };
  }, { persist: false });
}

function setDeceased(store, personId){
  const id = String(personId || "");
  store.setState((s) => {
    const builder = s.builder || {};
    const tree = getTreeFromState(s);
    if (!tree.people?.[id]) return s;

    const t = { ...tree, deceasedId: id };
    return {
      ...s,
      builder: {
        ...builder,
        tree: t,
        treeUi: {
          ...getTreeUi(builder),
          selectedId: id,
        },
      },
    };
  }, { persist: true });
}

function commitCreatePerson(store){
  const state = store.getState();
  const builder = state.builder || {};
  const tree = getTreeFromState(state);
  const ui = getTreeUi(builder);
  const modal = ui.modal;

  if (!modal || modal.type !== "create") return;

  const name = String(modal.fields?.name || "").trim();
  const sex = modal.fields?.sex === "female" ? "female" : (modal.fields?.sex === "male" ? "male" : "");
  const alive = modal.fields?.alive === false ? false : true;

  if (!name){
    setTreeUi(store, { modal: { ...modal, error: "Nombre requerido." } }, { persist: false });
    return;
  }

  store.setState((s) => {
    const b = s.builder || {};
    const t0 = getTreeFromState(s);
    const r = addPerson(t0, { name, sex, alive });

    return {
      ...s,
      builder: {
        ...b,
        tree: r.tree,
        treeUi: {
          ...getTreeUi(b),
          selectedId: String(r.id),
          modal: null,
        },
      },
    };
  }, { persist: true });
}

function commitSaveEdit(store){
  const st = store.getState();
  const ui = getTreeUi(st.builder || {});
  const modal = ui.modal;
  if (!modal || modal.type !== "edit" || !modal.personId) return;

  const personId = modal.personId;
  const fields = modal.fields || {};

  store.setState((s) => {
    const tree0 = getTreeFromState(s);
    if (!tree0.people?.[personId]) return setTreeUiErr(s, "Persona inválida.");

    const isDeceased = personId === tree0.deceasedId;
    const patch = {
      name: String(fields.name || "").trim() || tree0.people[personId].name || "Persona",
      alive: isDeceased ? false : (fields.alive !== false),
    };

    const sx = safeSex(fields.sex);
    if (!isDeceased && sx) patch.sex = sx;

    const t1 = updatePerson(tree0, personId, patch);

    return {
      ...s,
      builder: {
        ...s.builder,
        tree: t1,
      },
    };
  }, { persist: true });

  setTreeUi(store, { modal: null }, { persist: false });
}

function commitAddSpouse(store){
  const st = store.getState();
  const ui = getTreeUi(st.builder || {});
  const modal = ui.modal;
  if (!modal || modal.type !== "add-spouse" || !modal.personId) return;

  const personId = String(modal.personId);
  const fields = modal.fields || {};
  const existingIdRaw = String(fields.existingId || "").trim();

  store.setState((s) => {
    let tree0 = getTreeFromState(s);
    if (!tree0.people?.[personId]) return setTreeUiErr(s, "Persona inválida.");

    let targetId = null;

    if (existingIdRaw){
      if (!tree0.people?.[existingIdRaw]) return setTreeUiErr(s, "Persona a reusar inválida.");
      if (existingIdRaw === personId) return setTreeUiErr(s, "No puedes ser tu propio cónyuge.");

      const spouses = getSpouses(tree0, personId);
      if (spouses.includes(existingIdRaw)) return setTreeUiErr(s, "Estas dos personas ya están enlazadas como cónyuges.");

      targetId = existingIdRaw;
    } else {
      const name = String(fields.name || "").trim() || "Cónyuge";
      const sex = safeSex(fields.sex);
      const alive = fields.alive !== false;

      const r = addPerson(tree0, { name, sex, alive });
      tree0 = r.tree;
      targetId = String(r.id);
    }

    const t1 = linkSpouses(tree0, personId, targetId);

    return {
      ...s,
      builder: {
        ...s.builder,
        tree: t1,
        treeUi: {
          ...getTreeUi(s.builder),
          selectedId: targetId,
          modal: null,
        },
      },
    };
  }, { persist: true });

  setTreeUi(store, { modal: null }, { persist: false });
}

function commitAddChild(store){
  const st = store.getState();
  const ui = getTreeUi(st.builder || {});
  const modal = ui.modal;
  if (!modal || modal.type !== "add-child" || !modal.parentId) return;

  const parentId = String(modal.parentId);
  const fields = modal.fields || {};
  const existingIdRaw = String(fields.existingId || "").trim();

  store.setState((s) => {
    let tree0 = getTreeFromState(s);
    if (!tree0.people?.[parentId]) return setTreeUiErr(s, "Progenitor inválido.");

    let childId = null;

    if (existingIdRaw){
      if (!tree0.people?.[existingIdRaw]) return setTreeUiErr(s, "Persona a reusar inválida.");
      if (existingIdRaw === parentId) return setTreeUiErr(s, "No puedes ser tu propio hijo.");

      childId = existingIdRaw;
    } else {
      const name = String(fields.name || "").trim() || "Hijo";
      const sex = safeSex(fields.sex);
      const alive = fields.alive !== false;

      const r = addPerson(tree0, { name, sex, alive });
      tree0 = r.tree;
      childId = String(r.id);
    }

    const parent = tree0.people[parentId] || {};
    const parentSex = safeSex(parent.sex);

    const p = getParents(tree0, childId);
    const nextParents = { fatherId: p.fatherId || null, motherId: p.motherId || null };

    if (parentSex === "male") nextParents.fatherId = parentId;
    else if (parentSex === "female") nextParents.motherId = parentId;
    else nextParents.fatherId = parentId;

    const t1 = setParents(tree0, childId, nextParents);

    return {
      ...s,
      builder: {
        ...s.builder,
        tree: t1,
        treeUi: {
          ...getTreeUi(s.builder),
          selectedId: childId,
          modal: null,
        },
      },
    };
  }, { persist: true });

  setTreeUi(store, { modal: null }, { persist: false });
}

function commitDeletePerson(store, personId){
  const id = String(personId || "");
  store.setState((s) => {
    const tree0 = getTreeFromState(s);
    if (!tree0.people?.[id]) return s;

    if (id === tree0.deceasedId){
      return setTreeUiErr(s, "No puedes borrar el causante. Cámbialo primero.");
    }

    const t1 = removePerson(tree0, id);
    const selected = (getTreeUi(s.builder || {}).selectedId === id) ? tree0.deceasedId : getTreeUi(s.builder || {}).selectedId;

    return {
      ...s,
      builder: {
        ...s.builder,
        tree: t1,
        treeUi: {
          ...getTreeUi(s.builder),
          selectedId: selected,
        },
      },
    };
  }, { persist: true });
}

function commitUnlinkSpouse(store, personId, otherId){
  const a = String(personId || "");
  const b = String(otherId || "");
  if (!a || !b) return;

  store.setState((s) => {
    const tree0 = getTreeFromState(s);
    if (!tree0.people?.[a] || !tree0.people?.[b]) return s;
    const t1 = unlinkSpouses(tree0, a, b);
    return {
      ...s,
      builder: { ...s.builder, tree: t1 },
    };
  }, { persist: true });
}

function renderModal(state){
  const builder = state?.builder || {};
  const ui = getTreeUi(builder);
  const modal = ui.modal;

  if (!modal) return "";

  const tree = getTreeFromState(state);
  const allPeople = Object.entries(tree.people || {})
    .map(([id, p]) => ({ id, name: String(p?.name || id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const error = modal.error ? `<div class="tree-modal-error">${escapeHtml(modal.error)}</div>` : "";
  const nameVal = escapeHtml(modal.fields?.name || "");
  const aliveChecked = (modal.fields?.alive !== false) ? "checked" : "";

  const sexVal = String(modal.fields?.sex || "");
  const sexMaleSel = sexVal === "male" ? "selected" : "";
  const sexFemaleSel = sexVal === "female" ? "selected" : "";
  const sexUnknownSel = (!sexVal || (sexVal !== "male" && sexVal !== "female")) ? "selected" : "";

  const existingId = String(modal.fields?.existingId || "");
  const avoidId =
    modal.type === "add-child" ? String(modal.parentId || "") :
    modal.type === "add-spouse" ? String(modal.personId || "") :
    modal.type === "edit" ? String(modal.personId || "") :
    "";

  const existingOptions = allPeople
    .filter((p) => p.id !== avoidId)
    .map((p) => {
      const sel = (p.id === existingId) ? "selected" : "";
      return `<option value="${escapeHtml(p.id)}" ${sel}>${escapeHtml(p.name)} (${escapeHtml(p.id)})</option>`;
    })
    .join("");

  const showExisting =
    (modal.type === "add-child" || modal.type === "add-spouse") ? `
      <div class="tree-modal-row">
        <label>Reusar persona existente (opcional)</label>
        <select id="tree-modal-existing">
          <option value="">Crear nueva</option>
          ${existingOptions}
        </select>
        <div class="tree-modal-hint">Si eliges una persona existente, se ignorará el nombre y se enlazará directamente.</div>
      </div>
    ` : "";

  const title =
    modal.type === "create" ? "Crear persona" :
    modal.type === "edit" ? "Editar persona" :
    modal.type === "add-spouse" ? "Añadir cónyuge" :
    modal.type === "add-child" ? "Añadir hijo" :
    "Acción";

  const confirmLabel =
    modal.type === "create" ? "Crear" :
    modal.type === "edit" ? "Guardar" :
    modal.type === "add-spouse" ? "Añadir" :
    modal.type === "add-child" ? "Añadir" :
    "OK";

  return `
    <div class="tree-modal-backdrop">
      <div class="tree-modal">
        <div class="tree-modal-head">
          <div class="tree-modal-title">${escapeHtml(title)}</div>
          <button class="btn btn-secondary" data-action="tree-modal-close" type="button">Cerrar</button>
        </div>

        ${error}

        ${showExisting}

        <div class="tree-modal-row">
          <label>Nombre</label>
          <input id="tree-modal-name" value="${nameVal}" />
        </div>

        <div class="tree-modal-row">
          <label>Sexo</label>
          <select id="tree-modal-sex">
            <option value="" ${sexUnknownSel}>Desconocido</option>
            <option value="male" ${sexMaleSel}>Hombre</option>
            <option value="female" ${sexFemaleSel}>Mujer</option>
          </select>
        </div>

        <div class="tree-modal-row">
          <label>Vivo</label>
          <input id="tree-modal-alive" type="checkbox" ${aliveChecked} />
        </div>

        <div class="tree-modal-actions">
          <button class="btn" data-action="tree-modal-confirm" type="button">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    </div>
  `;
}

function renderTreePeopleList(tree, selectedId, search){
  const q = normStr(search);

  const items = Object.entries(tree.people || {})
    .map(([id, p]) => ({ id, name: String(p?.name || id), sex: p?.sex || "", alive: p?.alive !== false }))
    .filter((p) => !q || normStr(p.name).includes(q) || normStr(p.id).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const rows = items.map((p) => {
    const sel = p.id === selectedId ? "selected" : "";
    const tagSex = p.sex === "male" ? "H" : (p.sex === "female" ? "M" : "?");
    const tagAlive = p.alive ? "vivo" : "fallecido";
    return `
      <div class="tree-person-row ${sel}">
        <button class="tree-person-btn" data-action="tree-select" data-person-id="${escapeHtml(p.id)}" type="button">
          <span class="tree-person-name">${escapeHtml(p.name)}</span>
          <span class="tree-person-meta">${escapeHtml(tagSex)} · ${escapeHtml(tagAlive)} · ${escapeHtml(p.id)}</span>
        </button>
      </div>
    `;
  }).join("");

  return `
    <div class="tree-people-list">
      ${rows || `<div class="tree-empty">Sin personas</div>`}
    </div>
  `;
}

function renderSelectedPanel(tree, selectedId){
  const p = tree.people?.[selectedId];
  if (!p) return `<div class="tree-empty">Selecciona una persona</div>`;

  const spouses = getSpouses(tree, selectedId);
  const children = getChildren(tree, selectedId);
  const parents = getParents(tree, selectedId);

  const spousesHtml = spouses.map((id) => {
    const sp = tree.people[id];
    if (!sp) return "";
    return `
      <div class="tree-rel-row">
        <span>${escapeHtml(sp.name || id)}</span>
        <span class="tree-rel-actions">
          <button class="btn btn-secondary" data-action="tree-select" data-person-id="${escapeHtml(id)}" type="button">Ver</button>
          <button class="btn btn-secondary" data-action="tree-unlink-spouse" data-person-id="${escapeHtml(selectedId)}" data-other-id="${escapeHtml(id)}" type="button">Desenlazar</button>
        </span>
      </div>
    `;
  }).join("");

  const childrenHtml = children.map((id) => {
    const ch = tree.people[id];
    if (!ch) return "";
    return `
      <div class="tree-rel-row">
        <span>${escapeHtml(ch.name || id)}</span>
        <span class="tree-rel-actions">
          <button class="btn btn-secondary" data-action="tree-select" data-person-id="${escapeHtml(id)}" type="button">Ver</button>
        </span>
      </div>
    `;
  }).join("");

  const father = parents.fatherId && tree.people[parents.fatherId] ? tree.people[parents.fatherId] : null;
  const mother = parents.motherId && tree.people[parents.motherId] ? tree.people[parents.motherId] : null;

  return `
    <div class="tree-selected">
      <div class="tree-selected-head">
        <div>
          <div class="tree-selected-name">${escapeHtml(p.name || selectedId)}</div>
          <div class="tree-selected-meta">${escapeHtml(p.sex || "unknown")} · ${p.alive !== false ? "vivo" : "fallecido"} · ${escapeHtml(selectedId)}</div>
        </div>
        <div class="tree-selected-actions">
          <button class="btn btn-secondary" data-action="tree-edit" data-person-id="${escapeHtml(selectedId)}" type="button">Editar</button>
          <button class="btn btn-secondary" data-action="tree-add-spouse" data-person-id="${escapeHtml(selectedId)}" type="button">Añadir cónyuge</button>
          <button class="btn btn-secondary" data-action="tree-add-child" data-person-id="${escapeHtml(selectedId)}" type="button">Añadir hijo</button>
          <button class="btn btn-secondary" data-action="tree-set-deceased" data-person-id="${escapeHtml(selectedId)}" type="button">Marcar causante</button>
          <button class="btn btn-secondary" data-action="tree-delete" data-person-id="${escapeHtml(selectedId)}" type="button">Borrar</button>
        </div>
      </div>

      <div class="tree-selected-section">
        <h4>Cónyuges</h4>
        ${spousesHtml || `<div class="tree-empty">Sin cónyuges</div>`}
      </div>

      <div class="tree-selected-section">
        <h4>Hijos</h4>
        ${childrenHtml || `<div class="tree-empty">Sin hijos</div>`}
      </div>

      <div class="tree-selected-section">
        <h4>Padres</h4>
        <div class="tree-rel-row"><span>Padre</span><span>${father ? escapeHtml(father.name || parents.fatherId) : "No definido"}</span></div>
        <div class="tree-rel-row"><span>Madre</span><span>${mother ? escapeHtml(mother.name || parents.motherId) : "No definido"}</span></div>
      </div>
    </div>
  `;
}

export function renderBuilderTree(state){
  const builder = state?.builder || {};
  const ui = getTreeUi(builder);
  const tree = getTreeFromState(state);

  const selectedId = ui.selectedId || tree.deceasedId;

  const modalHtml = renderModal(state);

  return `
    <div class="builder-tree">
      <div class="builder-tree-toolbar">
        <div class="builder-tree-toolbar-left">
          <button class="btn" data-action="tree-create" type="button">Crear persona</button>
        </div>

        <div class="builder-tree-toolbar-right">
          <input id="tree-search" placeholder="Buscar..." value="${escapeHtml(ui.search)}" />
        </div>
      </div>

      <div class="builder-tree-body">
        <div class="builder-tree-left">
          ${renderTreePeopleList(tree, selectedId, ui.search)}
        </div>

        <div class="builder-tree-right">
          ${renderSelectedPanel(tree, selectedId)}
        </div>
      </div>

      ${modalHtml}
    </div>
  `;
}

export function wireBuilderTree(store){
  const root = document.getElementById("app");
  if (!root) return;

  root.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const personId = btn.getAttribute("data-person-id");
    const otherId = btn.getAttribute("data-other-id");

    if (action === "tree-create") openCreateModal(store);
    if (action === "tree-modal-close") closeTreeModal(store);
    if (action === "tree-select") selectPerson(store, personId);
    if (action === "tree-edit") openEditModal(store, personId);
    if (action === "tree-add-spouse") openAddSpouseModal(store, personId);
    if (action === "tree-add-child") openAddChildModal(store, personId);
    if (action === "tree-set-deceased") setDeceased(store, personId);
    if (action === "tree-delete") commitDeletePerson(store, personId);
    if (action === "tree-unlink-spouse") commitUnlinkSpouse(store, personId, otherId);

    if (action === "tree-modal-confirm"){
      const st = store.getState();
      const ui2 = getTreeUi(st.builder || {});
      const m = ui2.modal;

      if (!m) return;
      if (m.type === "create") commitCreatePerson(store);
      else if (m.type === "edit") commitSaveEdit(store);
      else if (m.type === "add-spouse") commitAddSpouse(store);
      else if (m.type === "add-child") commitAddChild(store);
    }
  });

  root.addEventListener("input", (e) => {
    const id = e.target?.id;
    if (id === "tree-search"){
      setTreeUi(store, { search: e.target.value }, { persist: true });
      return;
    }
    if (id === "tree-modal-name"){
      updateModalField(store, "name", e.target.value);
      return;
    }
  });

  root.addEventListener("change", (e) => {
    const id = e.target?.id;

    if (id === "tree-modal-sex"){
      updateModalField(store, "sex", e.target?.value ?? "");
      return;
    }
    if (id === "tree-modal-alive"){
      updateModalField(store, "alive", !!e.target?.checked);
      return;
    }
    if (id === "tree-modal-existing"){
      updateModalField(store, "existingId", e.target?.value ?? "");
      return;
    }
  });
}

function applyWizardToTree(tree, wizard){
  let t = tree;

  const did = t.deceasedId;
  if (!did) return t;

  const deceased = t.people[did] || {};
  const deceasedSex = (wizard?.deceased_sex === "male" || wizard?.deceased_sex === "female") ? wizard.deceased_sex : null;

  if (deceasedSex && deceased.sex !== deceasedSex){
    t = updatePerson(t, did, { sex: deceasedSex, alive: false });
  } else if (deceased.alive !== false){
    t = updatePerson(t, did, { alive: false });
  }

  function addOne(name, sex){
    const r = addPerson(t, { name, sex, alive: true });
    t = r.tree;
    return String(r.id);
  }

  const spouse = wizard?.spouse || {};
  if (spouse.enabled === true){
    if (deceasedSex === "male"){
      const count = clampCount(spouse.wives_count, 0, 4);
      for (let i = 0; i < count; i++){
        const wid = addOne(`Esposa ${i + 1}`, "female");
        t = linkSpouses(t, did, wid);
      }
    } else if (deceasedSex === "female"){
      if (spouse.husband_present === true){
        const hid = addOne("Esposo", "male");
        t = linkSpouses(t, did, hid);
      }
    }
  }

  const desc = wizard?.descendants || {};
  const sons = clampCount(desc.son, 0, 50);
  const daughters = clampCount(desc.daughter, 0, 50);

  for (let i = 0; i < sons; i++){
    const cid = addOne(`Hijo ${i + 1}`, "male");
    const p = getParents(t, cid);
    t = setParents(t, cid, { fatherId: deceasedSex === "male" ? did : p.fatherId, motherId: deceasedSex === "female" ? did : p.motherId });
  }
  for (let i = 0; i < daughters; i++){
    const cid = addOne(`Hija ${i + 1}`, "female");
    const p = getParents(t, cid);
    t = setParents(t, cid, { fatherId: deceasedSex === "male" ? did : p.fatherId, motherId: deceasedSex === "female" ? did : p.motherId });
  }

  const parents = wizard?.parents || {};
  if (parents.father === true){
    const fid = addOne("Padre", "male");
    t = setParents(t, did, { ...getParents(t, did), fatherId: fid });
  }
  if (parents.mother === true){
    const mid = addOne("Madre", "female");
    t = setParents(t, did, { ...getParents(t, did), motherId: mid });
  }

  return t;
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
        fromWizardApplied: true,
        wizardHashApplied: computeWizardHash(wizard),
        treeUi: {
          ...getTreeUi(builder),
          selectedId: merged.deceasedId,
          modal: null,
        },
      },
    };
  }, { persist: true });
}
