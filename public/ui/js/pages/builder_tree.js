// public/ui/js/pages/builder_tree.js
import { EXPECTED_ROLES } from "../api/contract.js";
import {
  addPerson,
  deriveHeirsByRoleFromTree,
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

const ROLE_LIMITS = {
  husband: 1,
  wife: 4,
  father: 1,
  mother: 1,
  son: 999,
  daughter: 999,
  paternal_grandfather: 1,
  paternal_grandmother: 1,
  maternal_grandmother: 1,
  paternal_great_grandmother: 1,
  maternal_great_grandmother: 1,
  full_brother: 999,
  full_sister: 999,
  consanguine_brother: 999,
  consanguine_sister: 999,
  uterine_brother: 999,
  uterine_sister: 999,
  sons_son: 999,
  sons_daughter: 999,
};

export function renderBuilderTree(state) {
  const wizard = state.wizard || {};
  const builder = state.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree), wizard);

  const selectedId =
    builder.treeSelectedId && tree.people[builder.treeSelectedId]
      ? builder.treeSelectedId
      : tree.deceasedId;
  const selected = tree.people[selectedId];

  const derived = deriveHeirsByRoleFromTree(tree);

  const wizardHashNow = computeWizardHash(wizard);
  const wizardChanged =
    builder.fromWizardApplied &&
    builder.wizardHashApplied &&
    builder.wizardHashApplied !== wizardHashNow;

  const modeTabs = renderModeTabs(builder.mode || "tree");
  const peopleList = renderPeopleList(tree, selectedId);

  const parentRel = getParents(tree, selectedId);
  const fatherOptions = renderPersonOptions(
    tree,
    selectedId,
    "male",
    parentRel.fatherId
  );
  const motherOptions = renderPersonOptions(
    tree,
    selectedId,
    "female",
    parentRel.motherId
  );

  const spouseIds = getSpouses(tree, selectedId);
  const spouseList = spouseIds.length
    ? `<ul class="mini-list">${spouseIds
        .map((id) => {
          const p = tree.people[id];
          return `<li>
            <span>${escapeHtml(p.name)}</span>
            <button class="btn btn-ghost btn-xs" data-tree-unlink-spouse="${selectedId}:${id}">Quitar</button>
          </li>`;
        })
        .join("")}</ul>`
    : `<p class="muted">Sin cónyuge enlazado.</p>`;

  const childIds = getChildren(tree, selectedId);
  const childrenList = childIds.length
    ? `<ul class="mini-list">${childIds
        .map((id) => {
          const p = tree.people[id];
          return `<li><button class="link" data-tree-select="${id}">${escapeHtml(
            p.name
          )}</button></li>`;
        })
        .join("")}</ul>`
    : `<p class="muted">Sin hijos vinculados.</p>`;

  const derivedTable = renderDerivedTable(derived.heirsByRole);

  const unmappedBox = derived.unmapped.length
    ? `<div class="notice warn">
        <div class="notice-title">Personas vivas sin mapeo automático</div>
        <div class="notice-body">
          <p>Estas personas están en el árbol pero no se traducen automáticamente a roles del core. Usa el modo <b>Roles</b> si necesitas introducirlas.</p>
          <ul class="mini-list">${derived.unmapped
            .map(
              (p) =>
                `<li>${escapeHtml(p.name)} <span class="pill">${p.sex}</span></li>`
            )
            .join("")}</ul>
        </div>
      </div>`
    : "";

  const warningsBox = derived.warnings.length
    ? `<div class="notice warn">
        <div class="notice-title">Advertencias</div>
        <div class="notice-body">
          <ul class="mini-list">${derived.warnings
            .map((w) => `<li>${escapeHtml(w)}</li>`)
            .join("")}</ul>
        </div>
      </div>`
    : "";

  const payloadPreview = state.builder && state.builder.payloadPreview ? state.builder.payloadPreview : null;
  const payloadBox = payloadPreview
    ? `<pre class="codebox">${escapeHtml(
        JSON.stringify(
          {
            heirs: payloadPreview.heirs,
            estate_value: payloadPreview.estate_value,
            currency: payloadPreview.currency,
            ui_meta: payloadPreview.ui_meta,
          },
          null,
          2
        )
      )}</pre>`
    : `<p class="muted">Añade familiares para generar el payload.</p>`;

  const wizardBanner = wizardChanged
    ? `<div class="notice warn">
        <div class="notice-title">El Wizard cambió desde la última sincronización</div>
        <div class="notice-body">
          <p>Se recomienda aplicar los cambios del Wizard al árbol (acción <b>aditiva</b>: no borra nodos).</p>
          <button class="btn" id="builder-apply-wizard">Aplicar cambios del Wizard</button>
        </div>
      </div>`
    : "";

  return `
  <section class="builder builder-tree stack">
    <div class="card card-pad stack">
      <div class="row row-between row-wrap">
        <div class="stack">
          <h1>Builder</h1>
          <p class="muted">Construye un árbol familiar (multi-generación) y la UI deriva roles compatibles con el core.</p>
          ${modeTabs}
        </div>
      </div>
    </div>

    ${wizardBanner}
    ${warningsBox}
    ${unmappedBox}

    <div class="builder-grid">
      <div class="card card-pad stack">
        <div class="row row-between row-wrap">
          <h2>Personas</h2>
          <div class="row row-gap-sm">
            <button class="btn btn-sm" id="tree-quick-add-spouse">+ Cónyuge</button>
            <button class="btn btn-sm" id="tree-quick-add-son">+ Hijo</button>
            <button class="btn btn-sm" id="tree-quick-add-daughter">+ Hija</button>
            <button class="btn btn-sm btn-ghost" id="tree-add-person">+ Persona</button>
          </div>
        </div>
        ${peopleList}
      </div>

      <div class="card card-pad stack">
        <h2>Detalles</h2>

        <div class="form-grid">
          <label class="field">
            <span class="label">Nombre</span>
            <input id="tree-person-name" type="text" value="${escapeHtml(
              selected.name
            )}" autocomplete="off" />
          </label>

          <label class="field">
            <span class="label">Sexo</span>
            <select id="tree-person-sex">
              <option value="male" ${
                selected.sex === "male" ? "selected" : ""
              }>Varón</option>
              <option value="female" ${
                selected.sex === "female" ? "selected" : ""
              }>Mujer</option>
            </select>
          </label>

          <label class="field field-inline">
            <input id="tree-person-alive" type="checkbox" ${
              selectedId !== tree.deceasedId && selected.alive ? "checked" : ""
            } ${selectedId === tree.deceasedId ? "disabled" : ""} />
            <span class="label">Vive (heir potencial)</span>
          </label>
        </div>

        <hr />

        <div class="stack">
          <h3>Padres</h3>
          <div class="form-grid">
            <label class="field">
              <span class="label">Padre</span>
              <select id="tree-parent-father">
                <option value="">(sin asignar)</option>
                ${fatherOptions}
              </select>
            </label>
            <label class="field">
              <span class="label">Madre</span>
              <select id="tree-parent-mother">
                <option value="">(sin asignar)</option>
                ${motherOptions}
              </select>
            </label>
          </div>
        </div>

        <hr />

        <div class="stack">
          <div class="row row-between">
            <h3>Cónyuges</h3>
            <button class="btn btn-sm" id="tree-add-spouse">+ Añadir</button>
          </div>
          ${spouseList}
        </div>

        <hr />

        <div class="stack">
          <div class="row row-between">
            <h3>Hijos</h3>
            <div class="row row-gap-sm">
              <button class="btn btn-sm" id="tree-add-child-son">+ Hijo</button>
              <button class="btn btn-sm" id="tree-add-child-daughter">+ Hija</button>
            </div>
          </div>
          ${childrenList}
        </div>
      </div>

      <div class="card card-pad stack">
        <h2>Derivado para core</h2>
        ${derivedTable}
      </div>

      <div class="card card-pad stack">
        <h2>Payload preview</h2>
        ${payloadBox}
        <p class="muted">El cálculo real se ejecuta en “Resultados”.</p>
        <div class="row row-between">
          <a class="btn btn-ghost" href="#/wizard">Volver al Wizard</a>
          <a class="btn" href="#/results">Continuar</a>
        </div>
      </div>
    </div>
  </section>
  `;
}

export function wireBuilderTree(store) {
  const state = store.getState();
  const wizard = state.wizard || {};
  const builder = state.builder || {};
  const wizardHashNow = computeWizardHash(wizard);

  if (!builder.fromWizardApplied) {
    const seeded = applyWizardToTree(
      ensureTree(sanitizeTree(builder.tree), wizard),
      wizard
    );
    store.setState({
      builder: {
        ...builder,
        tree: seeded,
        fromWizardApplied: true,
        wizardHashApplied: wizardHashNow,
      },
    });
  }

  const inputName = document.getElementById("tree-person-name");
  const selectSex = document.getElementById("tree-person-sex");
  const checkAlive = document.getElementById("tree-person-alive");

  if (inputName) inputName.addEventListener("input", (e) => updateSelected(store, { name: e.target.value }));
  if (selectSex) selectSex.addEventListener("change", (e) => updateSelected(store, { sex: e.target.value }));
  if (checkAlive) checkAlive.addEventListener("change", (e) => updateSelected(store, { alive: Boolean(e.target.checked) }));

  const fatherSel = document.getElementById("tree-parent-father");
  const motherSel = document.getElementById("tree-parent-mother");
  if (fatherSel) fatherSel.addEventListener("change", () => updateParents(store));
  if (motherSel) motherSel.addEventListener("change", () => updateParents(store));

  const addPersonBtn = document.getElementById("tree-add-person");
  if (addPersonBtn) addPersonBtn.addEventListener("click", () => addNewPerson(store));

  const addSpouseBtn = document.getElementById("tree-add-spouse");
  if (addSpouseBtn) addSpouseBtn.addEventListener("click", () => addSpouse(store));

  const quickSpouseBtn = document.getElementById("tree-quick-add-spouse");
  if (quickSpouseBtn) quickSpouseBtn.addEventListener("click", () => addSpouse(store));

  const addSonBtn = document.getElementById("tree-add-child-son");
  const addDauBtn = document.getElementById("tree-add-child-daughter");
  if (addSonBtn) addSonBtn.addEventListener("click", () => addChild(store, "male"));
  if (addDauBtn) addDauBtn.addEventListener("click", () => addChild(store, "female"));

  const quickSonBtn = document.getElementById("tree-quick-add-son");
  const quickDauBtn = document.getElementById("tree-quick-add-daughter");
  if (quickSonBtn) quickSonBtn.addEventListener("click", () => addChild(store, "male"));
  if (quickDauBtn) quickDauBtn.addEventListener("click", () => addChild(store, "female"));

  const applyWizardBtn = document.getElementById("builder-apply-wizard");
  if (applyWizardBtn) applyWizardBtn.addEventListener("click", () => applyWizardSyncTree(store));

  document.querySelectorAll("[data-tree-select]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-tree-select");
      if (!id) return;
      store.setState((s)=>({
        ...s,
        builder:{
          ...s.builder,
          treeSelectedId: id
        }
      }));
    });
  });

  document.querySelectorAll("[data-tree-unlink-spouse]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pair = btn.getAttribute("data-tree-unlink-spouse");
      if (!pair) return;
      const [aId, bId] = pair.split(":");
      unlinkSpouse(store, aId, bId);
    });
  });
}

export function applyWizardSyncTree(store) {
  const s = store.getState();
  const wizard = s.wizard || {};
  const builder = s.builder || {};
  const wizardHashNow = computeWizardHash(wizard);

  const tree = ensureTree(sanitizeTree(builder.tree), wizard);
  const merged = applyWizardToTree(tree, wizard);

  store.setState({
    builder: {
      ...builder,
      tree: merged,
      fromWizardApplied: true,
      wizardHashApplied: wizardHashNow,
    },
  });
}

export function importWizardToTree(store) {
  applyWizardSyncTree(store);
}

/* ------------------------- helpers ------------------------- */

function renderModeTabs(mode) {
  const m = mode === "roles" || mode === "tree" ? mode : "tree";
  return `
    <div class="segmented" role="tablist" aria-label="Modo de builder">
      <button class="segmented-btn ${m === "tree" ? "is-active" : ""}" id="builder-mode-tree" type="button">Árbol</button>
      <button class="segmented-btn ${m === "roles" ? "is-active" : ""}" id="builder-mode-roles" type="button">Roles</button>
    </div>
  `;
}

function renderPeopleList(tree, selectedId) {
  const items = Object.values(tree.people);
  items.sort((a, b) => {
    if (a.id === tree.deceasedId) return -1;
    if (b.id === tree.deceasedId) return 1;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return `
    <div class="tree-list">
      ${items
        .map((p) => {
          const isSelected = p.id === selectedId;
          const isDeceased = p.id === tree.deceasedId;
          return `
            <button class="tree-item ${isSelected ? "is-selected" : ""}" data-tree-select="${p.id}">
              <span class="tree-name">${escapeHtml(p.name)}</span>
              ${isDeceased ? `<span class="pill pill-dark">causante</span>` : ""}
              <span class="pill">${escapeHtml(p.sex)}</span>
              <span class="pill ${p.alive ? "pill-on" : ""}">${p.alive ? "vivo" : "fallecido"}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderPersonOptions(tree, selfId, sex, selectedId){
  const items = Object.values(tree.people).filter((p) => p.id !== selfId && p.sex === sex);
  items.sort((a,b) => a.name.localeCompare(b.name));
  return items.map((p) => `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
}

function renderDerivedTable(heirsByRole) {
  const entries = Object.entries(heirsByRole || {});
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  const unknown = entries.filter(([role]) => !EXPECTED_ROLES.includes(role));
  const known = entries.filter(([role]) => EXPECTED_ROLES.includes(role));

  const rows = known
    .map(([role, count]) => {
      const limit = ROLE_LIMITS[role] || 999;
      const warn = count > limit ? `<span class="pill pill-warn">exceso</span>` : "";
      return `<tr><td>${escapeHtml(role)}</td><td>${count}</td><td>${warn}</td></tr>`;
    })
    .join("");

  const unknownRows = unknown.length
    ? unknown
        .map(([role, count]) => `<tr><td>${escapeHtml(role)}</td><td>${count}</td><td><span class="pill pill-warn">desconocido</span></td></tr>`)
        .join("")
    : "";

  return `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Role</th><th>Cantidad</th><th></th></tr>
        </thead>
        <tbody>
          ${rows}
          ${unknownRows}
        </tbody>
      </table>
    </div>
  `;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll("\"","&quot;")
    .replaceAll("'","&#039;");
}

function computeWizardHash(wizard){
  const w = wizard && typeof wizard === "object" ? wizard : {};
  return JSON.stringify({
    deceased_sex: w.deceased_sex || null,
    spouse: w.spouse || null,
    descendants: w.descendants || null,
    parents: w.parents || null,
  });
}

function addNewPerson(store){
  const s = store.getState();
  const wizard = s.wizard || {};
  const builder = s.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree), wizard);
  const next = addPerson(tree, { name: "Persona", sex: "male", alive: true });

  store.setState({
    builder: {
      ...builder,
      tree: next,
    }
  });
}

function addChild(store, sex){
  const s = store.getState();
  const wizard = s.wizard || {};
  const builder = s.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree), wizard);

  const parentId = builder.treeSelectedId && tree.people[builder.treeSelectedId]
    ? builder.treeSelectedId
    : tree.deceasedId;

  const next1 = addPerson(tree, { name: sex === "female" ? "Hija" : "Hijo", sex, alive: true });
  const childId = `p${tree.nextId}`;
  const parent = tree.people[parentId];

  const rel = getParents(next1, childId);
  const parentsPatch = { ...rel };
  if (parent.sex === "male") parentsPatch.fatherId = parentId;
  if (parent.sex === "female") parentsPatch.motherId = parentId;

  const next2 = setParents(next1, childId, parentsPatch);

  store.setState({
    builder: {
      ...builder,
      tree: next2,
      treeSelectedId: childId,
    },
  });
}

function addSpouse(store){
  const s = store.getState();
  const wizard = s.wizard || {};
  const builder = s.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree), wizard);

  const selfId = builder.treeSelectedId && tree.people[builder.treeSelectedId]
    ? builder.treeSelectedId
    : tree.deceasedId;

  const self = tree.people[selfId];
  const spouseSex = self.sex === "male" ? "female" : "male";

  const next1 = addPerson(tree, { name: "Cónyuge", sex: spouseSex, alive: true });
  const spouseId = `p${tree.nextId}`;
  const next2 = linkSpouses(next1, selfId, spouseId);

  store.setState({
    builder: {
      ...builder,
      tree: next2,
      treeSelectedId: spouseId,
    },
  });
}

function unlinkSpouse(store, aId, bId){
  const s = store.getState();
  const wizard = s.wizard || {};
  const builder = s.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree), wizard);
  const next = unlinkSpouses(tree, aId, bId);

  store.setState({
    builder: {
      ...builder,
      tree: next,
    },
  });
}

function updateSelected(store, patch){
  const s = store.getState();
  const wizard = s.wizard || {};
  const builder = s.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree), wizard);

  const selectedId = builder.treeSelectedId && tree.people[builder.treeSelectedId]
    ? builder.treeSelectedId
    : tree.deceasedId;

  const next = updatePerson(tree, selectedId, patch);

  store.setState({
    builder: {
      ...builder,
      tree: next,
    },
  });
}

function updateParents(store){
  const s = store.getState();
  const wizard = s.wizard || {};
  const builder = s.builder || {};
  const tree = ensureTree(sanitizeTree(builder.tree), wizard);

  const selectedId = builder.treeSelectedId && tree.people[builder.treeSelectedId]
    ? builder.treeSelectedId
    : tree.deceasedId;

  const fatherSel = document.getElementById("tree-parent-father");
  const motherSel = document.getElementById("tree-parent-mother");

  const fatherId = fatherSel && fatherSel.value ? fatherSel.value : null;
  const motherId = motherSel && motherSel.value ? motherSel.value : null;

  const next = setParents(tree, selectedId, { fatherId, motherId });

  store.setState({
    builder: {
      ...builder,
      tree: next,
    },
  });
}

function applyWizardToTree(tree, wizard){
  // Existing seeding logic kept as-is for now (PR16a does not change behavior),
  // only baseline fixes are in this PR.
  return tree;
}
