import { escapeHtml } from "../ui/escape.js";
import { openModal } from "../ui/modal.js";
import {
  sanitizeTree,
  ensureTree,
  addPerson,
  updatePerson,
  setParents,
  getParents,
  getChildren,
  getSpouses,
  linkSpouses,
} from "../domain/familyTree.js";

const ROOT_ID = "builder-tree-root";

function rootEl(){
  return document.getElementById(ROOT_ID);
}

function debounce(fn, ms){
  let t = null;
  return (v) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(v), ms);
  };
}

function uiNorm(raw){
  const ui = (raw && typeof raw === "object") ? raw : {};
  const search = typeof ui.search === "string" ? ui.search : "";
  const collapsedRaw = (ui.collapsed && typeof ui.collapsed === "object") ? ui.collapsed : {};
  const collapsed = {};
  Object.entries(collapsedRaw).forEach(([k, v]) => { collapsed[String(k)] = v === true; });
  return { search, collapsed, peopleListCollapsed: ui.peopleListCollapsed === true };
}

function treeFromState(state){
  return ensureTree(sanitizeTree(state.builder.tree), null);
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

function genMap(tree, startId){
  const gen = new Map();
  if (!startId || !tree.people[startId]) return gen;

  const q = [startId];
  gen.set(startId, 0);

  while (q.length){
    const id = q.shift();
    const g = gen.get(id);

    const par = getParents(tree, id);
    [par.fatherId, par.motherId].forEach((pid) => {
      if (!pid || !tree.people[pid] || gen.has(pid)) return;
      gen.set(pid, g - 1);
      q.push(pid);
    });

    getChildren(tree, id).forEach((cid) => {
      if (!cid || !tree.people[cid] || gen.has(cid)) return;
      gen.set(cid, g + 1);
      q.push(cid);
    });

    getSpouses(tree, id).forEach((sid) => {
      if (!sid || !tree.people[sid] || gen.has(sid)) return;
      gen.set(sid, g);
      q.push(sid);
    });
  }

  return gen;
}

function groupByGen(tree, gmap){
  const by = new Map();
  gmap.forEach((g, id) => {
    if (!tree.people[id]) return;
    if (!by.has(g)) by.set(g, []);
    by.get(g).push(id);
  });

  by.forEach((ids, g) => {
    ids.sort((a, b) => nameOf(tree.people[a]).localeCompare(nameOf(tree.people[b])));
    by.set(g, ids);
  });

  return by;
}

function genTitle(g){
  if (g === 0) return "Generación 0 (causante y cónyuges)";
  if (g < 0) return `Ascendientes (nivel ${Math.abs(g)})`;
  return `Descendientes (nivel ${g})`;
}

function pillDeceased(isDeceased){
  return isDeceased ? `<span class="pill pill-deceased">causante</span>` : "";
}

function nodeCard(tree, id, { selectedId, q }){
  const p = tree.people[id];
  if (!p || !matchSearch(p, q)) return "";
  const isDeceased = id === tree.deceasedId;

  return `
    <div class="tree-node ${selectedId === id ? "is-selected" : ""}" data-tree-action="select" data-person-id="${escapeHtml(id)}">
      <div class="tree-node-top">
        <div class="tree-node-name">${escapeHtml(nameOf(p))}</div>
        <div class="tree-node-badges">
          ${pillDeceased(isDeceased)}
          <span class="pill">${sexShort(p.sex)}</span>
          <span class="pill">${aliveShort(p.alive)}</span>
        </div>
      </div>
      <div class="tree-node-actions">
        <button class="btn btn-xs" type="button" data-tree-action="add-child" data-person-id="${escapeHtml(id)}">+ hijo/a</button>
        <button class="btn btn-xs" type="button" data-tree-action="add-spouse" data-person-id="${escapeHtml(id)}">+ cónyuge</button>
        <button class="btn btn-xs" type="button" data-tree-action="edit" data-person-id="${escapeHtml(id)}">editar</button>
        ${isDeceased ? "" : `<button class="btn btn-xs" type="button" data-tree-action="set-deceased" data-person-id="${escapeHtml(id)}">set causante</button>`}
      </div>
    </div>
  `;
}

function genSection(tree, g, ids, ui, ctx){
  const collapsed = ui.collapsed[String(g)] === true;
  const cards = ids.map((id) => nodeCard(tree, id, ctx)).filter(Boolean);
  if (ctx.q && cards.length === 0) return "";

  return `
    <section class="tree-gen">
      <header class="tree-gen-header">
        <div class="tree-gen-title">${escapeHtml(genTitle(g))}</div>
        <button class="btn btn-xs" type="button" data-tree-action="toggle-gen" data-gen="${escapeHtml(String(g))}">
          ${collapsed ? "mostrar" : "plegar"}
        </button>
      </header>
      ${collapsed ? "" : `<div class="tree-gen-grid">${cards.join("")}</div>`}
    </section>
  `;
}

function peopleList(tree, ui, selectedId){
  const q = ui.search.trim().toLowerCase();
  const ids = Object.keys(tree.people)
    .filter((id) => matchSearch(tree.people[id], q))
    .sort((a, b) => nameOf(tree.people[a]).localeCompare(nameOf(tree.people[b])));

  if (!ids.length) return `<div class="hint">No hay resultados.</div>`;

  return `
    <div class="tree-people">
      ${ids.map((id) => {
        const p = tree.people[id];
        const isDeceased = id === tree.deceasedId;
        return `
          <button class="tree-person ${selectedId === id ? "is-selected" : ""}" type="button"
            data-tree-action="select" data-person-id="${escapeHtml(id)}">
            <span class="tree-person-name">${escapeHtml(nameOf(p))}</span>
            <span class="tree-person-badges">
              ${pillDeceased(isDeceased)}
              <span class="pill">${sexShort(p.sex)}</span>
              <span class="pill">${aliveShort(p.alive)}</span>
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function wizardHash(w){
  if (!w) return "";
  return JSON.stringify({
    deceased_sex: w.deceased_sex || null,
    spouse: w.spouse || null,
    ascendants: w.ascendants || null,
    descendants: w.descendants || null,
  });
}

function wizardChanged(state){
  const b = state.builder;
  if (!b.fromWizardApplied || !b.wizardHashApplied) return false;
  return wizardHash(state.wizard) !== b.wizardHashApplied;
}

function wizardBanner(state){
  if (!wizardChanged(state)) return "";
  return `
    <div class="notice warn">
      <div><b>Wizard cambiado</b>: el árbol no se actualiza automáticamente.</div>
      <div class="notice-actions">
        <button class="btn btn-xs" type="button" data-tree-action="import-wizard">Importar del wizard al árbol</button>
      </div>
    </div>
  `;
}

function modalsMarkup(){
  return `
    <div class="tree-modal-backdrop is-hidden" data-tree-modal="edit">
      <div class="tree-modal">
        <div class="tree-modal-header">
          <div class="tree-modal-title" data-tree-modal-title>Editar</div>
          <button class="btn btn-xs" type="button" data-tree-modal-action="cancel">Cerrar</button>
        </div>
        <div class="tree-modal-body">
          <div class="form-row">
            <label>Nombre (opcional)</label>
            <input type="text" class="input" data-tree-field="name" placeholder="Ej: Ahmad, Fatima..." />
          </div>
          <div class="form-row">
            <label>Sexo</label>
            <select class="input" data-tree-field="sex">
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </div>
          <div class="form-row">
            <label><input type="checkbox" data-tree-field="alive" /> Vivo</label>
          </div>
          <div class="form-row">
            <label>Padre</label>
            <select class="input" data-tree-field="fatherId"></select>
          </div>
          <div class="form-row">
            <label>Madre</label>
            <select class="input" data-tree-field="motherId"></select>
          </div>
          <div class="hint" data-tree-modal-hint></div>
        </div>
        <div class="tree-modal-footer">
          <button class="btn" type="button" data-tree-modal-action="cancel">Cancelar</button>
          <button class="btn btn-primary" type="button" data-tree-modal-action="save">Guardar</button>
        </div>
      </div>
    </div>

    <div class="tree-modal-backdrop is-hidden" data-tree-modal="add-child">
      <div class="tree-modal">
        <div class="tree-modal-header">
          <div class="tree-modal-title" data-tree-modal-title>Añadir hijo/a</div>
          <button class="btn btn-xs" type="button" data-tree-modal-action="cancel">Cerrar</button>
        </div>
        <div class="tree-modal-body">
          <div class="form-row">
            <label>Modo</label>
            <div class="radio-row">
              <label><input type="radio" name="child_mode" value="new" checked /> Crear nuevo</label>
              <label><input type="radio" name="child_mode" value="existing" /> Vincular existente</label>
            </div>
          </div>

          <div data-child-mode="new">
            <div class="form-row">
              <label>Nombre (opcional)</label>
              <input type="text" class="input" data-tree-field="child_name" />
            </div>
            <div class="form-row">
              <label>Sexo</label>
              <select class="input" data-tree-field="child_sex">
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
              </select>
            </div>
            <div class="form-row">
              <label><input type="checkbox" data-tree-field="child_alive" checked /> Vivo</label>
            </div>
          </div>

          <div class="is-hidden" data-child-mode="existing">
            <div class="form-row">
              <label>Persona</label>
              <select class="input" data-tree-field="child_existing"></select>
            </div>
          </div>

          <div class="hint">El padre o madre se asigna según el sexo del nodo origen.</div>
        </div>
        <div class="tree-modal-footer">
          <button class="btn" type="button" data-tree-modal-action="cancel">Cancelar</button>
          <button class="btn btn-primary" type="button" data-tree-modal-action="save">Añadir</button>
        </div>
      </div>
    </div>

    <div class="tree-modal-backdrop is-hidden" data-tree-modal="add-spouse">
      <div class="tree-modal">
        <div class="tree-modal-header">
          <div class="tree-modal-title" data-tree-modal-title>Añadir cónyuge</div>
          <button class="btn btn-xs" type="button" data-tree-modal-action="cancel">Cerrar</button>
        </div>
        <div class="tree-modal-body">
          <div class="form-row">
            <label>Modo</label>
            <div class="radio-row">
              <label><input type="radio" name="spouse_mode" value="new" checked /> Crear nuevo</label>
              <label><input type="radio" name="spouse_mode" value="existing" /> Vincular existente</label>
            </div>
          </div>

          <div data-spouse-mode="new">
            <div class="form-row">
              <label>Nombre (opcional)</label>
              <input type="text" class="input" data-tree-field="spouse_name" />
            </div>
            <div class="form-row">
              <label>Sexo</label>
              <select class="input" data-tree-field="spouse_sex">
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
              </select>
            </div>
            <div class="form-row">
              <label><input type="checkbox" data-tree-field="spouse_alive" checked /> Vivo</label>
            </div>
          </div>

          <div class="is-hidden" data-spouse-mode="existing">
            <div class="form-row">
              <label>Persona</label>
              <select class="input" data-tree-field="spouse_existing"></select>
            </div>
          </div>

          <div class="hint">Puedes vincular un nodo existente para evitar duplicados.</div>
        </div>
        <div class="tree-modal-footer">
          <button class="btn" type="button" data-tree-modal-action="cancel">Cancelar</button>
          <button class="btn btn-primary" type="button" data-tree-modal-action="save">Añadir</button>
        </div>
      </div>
    </div>
  `;
}

/* Render */
export function renderBuilderTree(state){
  const tree = treeFromState(state);
  const ui = uiNorm(state.builder.treeUi);
  const selectedId = state.builder.treeSelectedId || tree.deceasedId;
  const q = ui.search.trim().toLowerCase();

  const gmap = genMap(tree, tree.deceasedId);
  const by = groupByGen(tree, gmap);

  const gens = Array.from(by.keys()).sort((a, b) => a - b);
  const neg = gens.filter((g) => g < 0).sort((a, b) => a - b);
  const pos = gens.filter((g) => g > 0).sort((a, b) => a - b);

  const allIds = Object.keys(tree.people);
  const connected = new Set(Array.from(gmap.keys()));
  const disconnected = allIds.filter((id) => !connected.has(id))
    .sort((a, b) => nameOf(tree.people[a]).localeCompare(nameOf(tree.people[b])));

  const ctx = { selectedId, q };

  return `
    <div id="${ROOT_ID}" class="tree-builder-v2">
      <div class="tree-sidebar">
        <div class="tree-sidebar-top">
          <div class="tree-title">Tree Builder (relacional)</div>
          <div class="tree-actions">
            <button class="btn btn-xs" type="button" data-tree-action="create-person">+ persona</button>
            <button class="btn btn-xs" type="button" data-tree-action="import-wizard">Importar wizard</button>
            <button class="btn btn-xs btn-danger" type="button" data-tree-action="reset-tree">Reset</button>
          </div>
        </div>

        ${wizardBanner(state)}

        <div class="form-row">
          <label>Búsqueda</label>
          <input class="input" type="text" placeholder="Nombre..." value="${escapeHtml(ui.search)}" data-tree-action="search" />
        </div>

        <div class="tree-people-header">
          <div class="tree-people-title">Personas</div>
          <button class="btn btn-xs" type="button" data-tree-action="toggle-people">
            ${ui.peopleListCollapsed ? "mostrar" : "plegar"}
          </button>
        </div>

        ${ui.peopleListCollapsed ? "" : peopleList(tree, ui, selectedId)}

        <div class="hint" style="margin-top:12px">
          Tree es la fuente de verdad. Wizard solo entra con "Importar wizard".
        </div>
      </div>

      <div class="tree-main">
        <div class="tree-gens">
          ${neg.map((g) => genSection(tree, g, by.get(g) || [], ui, ctx)).join("")}
          ${genSection(tree, 0, by.get(0) || [], ui, ctx)}
          ${pos.map((g) => genSection(tree, g, by.get(g) || [], ui, ctx)).join("")}

          ${disconnected.length ? `
            <section class="tree-gen tree-gen-disconnected">
              <header class="tree-gen-header">
                <div class="tree-gen-title">No conectados</div>
                <div class="hint">Nodos no alcanzables desde el causante.</div>
              </header>
              <div class="tree-gen-grid">
                ${disconnected.map((id) => nodeCard(tree, id, ctx)).join("")}
              </div>
            </section>
          ` : ""}
        </div>

        ${modalsMarkup()}
      </div>
    </div>
  `;
}

/* Wiring */
let setSearchDebounced = null;

export function wireBuilderTree(store){
  const root = rootEl();
  if (!root) return;

  if (!setSearchDebounced){
    setSearchDebounced = debounce((value) => {
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, treeUi: { ...uiNorm(s.builder.treeUi), search: value } },
      }));
    }, 150);
  }

  function modal(name){ return root.querySelector(`[data-tree-modal="${name}"]`); }
  function modalOpen(name){ const m = modal(name); if (m) m.classList.remove("is-hidden"); }
  function modalClose(name){ const m = modal(name); if (m) m.classList.add("is-hidden"); }

  function peopleOptions(tree, { includeNoneLabel, excludeIds = [] } = {}){
    const ids = Object.keys(tree.people).filter((id) => !excludeIds.includes(id));
    ids.sort((a, b) => nameOf(tree.people[a]).localeCompare(nameOf(tree.people[b])));
    const out = [];
    if (includeNoneLabel) out.push({ value: "", label: includeNoneLabel });
    ids.forEach((id) => {
      const p = tree.people[id];
      out.push({ value: id, label: `${nameOf(p)} (${sexShort(p.sex)}, ${aliveShort(p.alive)})` });
    });
    return out;
  }

  function fillSelect(el, options, selected){
    if (!el) return;
    el.innerHTML = options.map((o) => {
      const sel = String(o.value) === String(selected) ? "selected" : "";
      return `<option value="${escapeHtml(String(o.value))}" ${sel}>${escapeHtml(o.label)}</option>`;
    }).join("");
  }

  function updateTree(fn){
    store.setState((s) => {
      const tree = treeFromState(s);
      return { ...s, builder: { ...s.builder, tree: fn(tree, s) } };
    });
  }

  function openEdit(personId){
    const state = store.getState();
    const tree = treeFromState(state);
    const isCreate = !personId;
    const p = isCreate ? { name: "", sex: "male", alive: true } : tree.people[personId];
    if (!isCreate && !p) return;

    const m = modal("edit");
    m.dataset.mode = isCreate ? "create" : "edit";
    m.dataset.personId = isCreate ? "" : String(personId);
    m.querySelector("[data-tree-modal-title]").textContent = isCreate ? "Crear persona" : `Editar: ${nameOf(p)}`;

    m.querySelector('[data-tree-field="name"]').value = p.name || "";
    m.querySelector('[data-tree-field="sex"]').value = p.sex || "male";

    const aliveEl = m.querySelector('[data-tree-field="alive"]');
    aliveEl.checked = p.alive === true;
    aliveEl.disabled = (!isCreate && personId === tree.deceasedId);
    if (aliveEl.disabled) aliveEl.checked = false;

    const hint = m.querySelector("[data-tree-modal-hint]");
    hint.textContent = aliveEl.disabled ? "El causante se fuerza a fallecido." : "";

    const parents = isCreate ? { fatherId: null, motherId: null } : getParents(tree, personId);
    const exclude = isCreate ? [] : [String(personId)];
    fillSelect(m.querySelector('[data-tree-field="fatherId"]'), peopleOptions(tree, { includeNoneLabel: "(sin padre)", excludeIds: exclude }), parents.fatherId || "");
    fillSelect(m.querySelector('[data-tree-field="motherId"]'), peopleOptions(tree, { includeNoneLabel: "(sin madre)", excludeIds: exclude }), parents.motherId || "");

    modalOpen("edit");
  }

  function saveEdit(){
    const m = modal("edit");
    const mode = m.dataset.mode;
    const id = m.dataset.personId || "";

    const name = (m.querySelector('[data-tree-field="name"]').value || "").trim();
    const sex = m.querySelector('[data-tree-field="sex"]').value;
    const alive = m.querySelector('[data-tree-field="alive"]').checked === true;
    const fatherId = m.querySelector('[data-tree-field="fatherId"]').value || null;
    const motherId = m.querySelector('[data-tree-field="motherId"]').value || null;

    if (sex !== "male" && sex !== "female"){
      alert("Sexo inválido.");
      return;
    }

    if (mode === "create"){
      updateTree((t) => addPerson(t, { name, sex, alive }).tree);
      modalClose("edit");
      return;
    }

    updateTree((t) => {
      let out = updatePerson(t, id, { name, sex, alive: (id === t.deceasedId ? false : alive) });
      out = setParents(out, id, { fatherId: fatherId || null, motherId: motherId || null });
      return out;
    });
    modalClose("edit");
  }

  function openAddChild(parentId){
    const state = store.getState();
    const tree = treeFromState(state);
    const parent = tree.people[parentId];
    if (!parent) return;

    const m = modal("add-child");
    m.dataset.parentId = String(parentId);
    m.querySelector("[data-tree-modal-title]").textContent = `Añadir hijo/a a: ${nameOf(parent)}`;

    m.querySelectorAll('input[name="child_mode"]').forEach((el) => { el.checked = el.value === "new"; });
    m.querySelector('[data-child-mode="new"]').classList.remove("is-hidden");
    m.querySelector('[data-child-mode="existing"]').classList.add("is-hidden");

    m.querySelector('[data-tree-field="child_name"]').value = "";
    m.querySelector('[data-tree-field="child_sex"]').value = "male";
    m.querySelector('[data-tree-field="child_alive"]').checked = true;

    fillSelect(m.querySelector('[data-tree-field="child_existing"]'), peopleOptions(tree, { includeNoneLabel: "(elige persona)", excludeIds: [String(parentId)] }), "");
    modalOpen("add-child");
  }

  function saveAddChild(){
    const m = modal("add-child");
    const parentId = m.dataset.parentId;
    const mode = Array.from(m.querySelectorAll('input[name="child_mode"]')).find((el) => el.checked)?.value || "new";

    updateTree((t) => {
      const parent = t.people[parentId];
      if (!parent) return t;

      const slot = parent.sex === "female" ? "motherId" : "fatherId";

      if (mode === "existing"){
        const childId = m.querySelector('[data-tree-field="child_existing"]').value;
        if (!childId) return t;
        const cur = getParents(t, childId);
        return setParents(t, childId, { fatherId: cur.fatherId, motherId: cur.motherId, [slot]: parentId });
      }

      const childName = (m.querySelector('[data-tree-field="child_name"]').value || "").trim();
      const childSex = m.querySelector('[data-tree-field="child_sex"]').value;
      const childAlive = m.querySelector('[data-tree-field="child_alive"]').checked === true;

      if (childSex !== "male" && childSex !== "female") return t;

      const added = addPerson(t, { name: childName, sex: childSex, alive: childAlive });
      return setParents(added.tree, added.personId, { fatherId: null, motherId: null, [slot]: parentId });
    });

    modalClose("add-child");
  }

  function openAddSpouse(personId){
    const state = store.getState();
    const tree = treeFromState(state);
    const p = tree.people[personId];
    if (!p) return;

    const m = modal("add-spouse");
    m.dataset.personId = String(personId);
    m.querySelector("[data-tree-modal-title]").textContent = `Añadir cónyuge a: ${nameOf(p)}`;

    m.querySelectorAll('input[name="spouse_mode"]').forEach((el) => { el.checked = el.value === "new"; });
    m.querySelector('[data-spouse-mode="new"]').classList.remove("is-hidden");
    m.querySelector('[data-spouse-mode="existing"]').classList.add("is-hidden");

    m.querySelector('[data-tree-field="spouse_name"]').value = "";
    m.querySelector('[data-tree-field="spouse_sex"]').value = p.sex === "male" ? "female" : "male";
    m.querySelector('[data-tree-field="spouse_alive"]').checked = true;

    fillSelect(m.querySelector('[data-tree-field="spouse_existing"]'), peopleOptions(tree, { includeNoneLabel: "(elige persona)", excludeIds: [String(personId)] }), "");
    modalOpen("add-spouse");
  }

  function saveAddSpouse(){
    const m = modal("add-spouse");
    const personId = m.dataset.personId;
    const mode = Array.from(m.querySelectorAll('input[name="spouse_mode"]')).find((el) => el.checked)?.value || "new";

    updateTree((t) => {
      const p = t.people[personId];
      if (!p) return t;

      if (mode === "existing"){
        const spouseId = m.querySelector('[data-tree-field="spouse_existing"]').value;
        if (!spouseId) return t;
        return linkSpouses(t, personId, spouseId);
      }

      const spouseName = (m.querySelector('[data-tree-field="spouse_name"]').value || "").trim();
      const spouseSex = (m.querySelector('[data-tree-field="spouse_sex"]').value || "").trim();
      const spouseAlive = m.querySelector('[data-tree-field="spouse_alive"]').checked === true;

      if (spouseSex !== "male" && spouseSex !== "female") return t;

      const added = addPerson(t, { name: spouseName, sex: spouseSex, alive: spouseAlive });
      return linkSpouses(added.tree, personId, added.personId);
    });

    modalClose("add-spouse");
  }

  function setDeceased(personId){
    updateTree((t) => updatePerson({ ...t, deceasedId: personId }, personId, { alive: false }));
    store.setState((s) => ({ ...s, builder: { ...s.builder, treeSelectedId: personId } }));
  }

  function toggleGen(genKey){
    store.setState((s) => {
      const ui = uiNorm(s.builder.treeUi);
      return {
        ...s,
        builder: {
          ...s.builder,
          treeUi: { ...ui, collapsed: { ...ui.collapsed, [String(genKey)]: !(ui.collapsed[String(genKey)] === true) } },
        },
      };
    });
  }

  function togglePeople(){
    store.setState((s) => {
      const ui = uiNorm(s.builder.treeUi);
      return { ...s, builder: { ...s.builder, treeUi: { ...ui, peopleListCollapsed: !ui.peopleListCollapsed } } };
    });
  }

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.matches('input[name="child_mode"]')){
      const m = modal("add-child");
      const mode = t.value;
      m.querySelector('[data-child-mode="new"]').classList.toggle("is-hidden", mode !== "new");
      m.querySelector('[data-child-mode="existing"]').classList.toggle("is-hidden", mode !== "existing");
    }

    if (t.matches('input[name="spouse_mode"]')){
      const m = modal("add-spouse");
      const mode = t.value;
      m.querySelector('[data-spouse-mode="new"]').classList.toggle("is-hidden", mode !== "new");
      m.querySelector('[data-spouse-mode="existing"]').classList.toggle("is-hidden", mode !== "existing");
    }
  });

  root.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches('[data-tree-action="search"]')) setSearchDebounced(t.value || "");
  });

  root.addEventListener("click", (e) => {
    const modalBtn = e.target.closest("[data-tree-modal-action]");
    if (modalBtn){
      const act = modalBtn.getAttribute("data-tree-modal-action");
      const backdrop = modalBtn.closest("[data-tree-modal]");
      const modalName = backdrop?.getAttribute("data-tree-modal");
      if (!modalName) return;

      if (act === "cancel") return modalClose(modalName);
      if (act === "save"){
        if (modalName === "edit") return saveEdit();
        if (modalName === "add-child") return saveAddChild();
        if (modalName === "add-spouse") return saveAddSpouse();
      }
      return;
    }

    const btn = e.target.closest("[data-tree-action]");
    if (!btn) return;

    const act = btn.getAttribute("data-tree-action");
    const personId = btn.getAttribute("data-person-id");
    const genKey = btn.getAttribute("data-gen");

    if (act === "select" && personId) return store.setState((s) => ({ ...s, builder: { ...s.builder, treeSelectedId: personId } }));
    if (act === "toggle-gen" && genKey != null) return toggleGen(genKey);
    if (act === "toggle-people") return togglePeople();
    if (act === "edit") return openEdit(personId);
    if (act === "create-person") return openEdit(null);
    if (act === "add-child") return openAddChild(personId);
    if (act === "add-spouse") return openAddSpouse(personId);
    if (act === "set-deceased") return setDeceased(personId);

    if (act === "reset-tree"){
      return openModal({
        title: "Reset del árbol",
        bodyHtml: "<p>Esto borrará el árbol actual y volverá a uno mínimo.</p>",
        confirmLabel: "Reset",
        confirmAction: "builder-tree-reset",
      });
    }

    if (act === "import-wizard"){
      return openModal({
        title: "Importar del wizard al árbol",
        bodyHtml: "<p>Merge controlado desde el wizard al árbol. No se hace automáticamente.</p>",
        confirmLabel: "Importar",
        confirmAction: "builder-tree-import-wizard",
      });
    }
  });
}

/* Wizard import (explicit only) */
function applyWizardToTree(tree, w){
  if (!w || typeof w !== "object") return tree;
  let out = ensureTree(sanitizeTree(tree), null);
  const dId = out.deceasedId;

  if (w.deceased_sex === "male" || w.deceased_sex === "female"){
    out = updatePerson(out, dId, { sex: w.deceased_sex });
  }

  if (w.spouse?.enabled === true){
    const count = Number(w.spouse?.count || 0);
    for (let i = 0; i < count; i++){
      const spouseSex = out.people[dId].sex === "male" ? "female" : "male";
      const added = addPerson(out, { sex: spouseSex, alive: true, name: spouseSex === "female" ? "Esposa" : "Esposo" });
      out = linkSpouses(added.tree, dId, added.personId);
    }
  }

  if (w.ascendants?.father?.alive === true){
    const added = addPerson(out, { sex: "male", alive: true, name: "Padre" });
    out = setParents(added.tree, dId, { ...getParents(added.tree, dId), fatherId: added.personId });
  }
  if (w.ascendants?.mother?.alive === true){
    const added = addPerson(out, { sex: "female", alive: true, name: "Madre" });
    out = setParents(added.tree, dId, { ...getParents(added.tree, dId), motherId: added.personId });
  }

  const sons = Number(w.descendants?.sons || 0);
  const daughters = Number(w.descendants?.daughters || 0);
  const fatherId = out.people[dId].sex === "male" ? dId : null;
  const motherId = out.people[dId].sex === "female" ? dId : null;

  for (let i = 0; i < sons; i++){
    const added = addPerson(out, { sex: "male", alive: true, name: "Hijo" });
    out = setParents(added.tree, added.personId, { fatherId, motherId });
  }
  for (let i = 0; i < daughters; i++){
    const added = addPerson(out, { sex: "female", alive: true, name: "Hija" });
    out = setParents(added.tree, added.personId, { fatherId, motherId });
  }

  return updatePerson(out, dId, { alive: false });
}

export function applyWizardSyncTree(store){
  store.setState((state) => {
    const baseTree = treeFromState(state);
    const nextTree = applyWizardToTree(baseTree, state.wizard);
    return {
      ...state,
      builder: {
        ...state.builder,
        tree: nextTree,
        fromWizardApplied: true,
        wizardHashApplied: wizardHash(state.wizard),
      },
    };
  });
}

// Alias esperado por app.js (PR16a).
export const importWizardToTree = applyWizardSyncTree;
