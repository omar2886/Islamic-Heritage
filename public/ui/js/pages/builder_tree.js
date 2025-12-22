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
  </section>
  `;
}

export function wireBuilderTree(store) {
  const state = store.getState();
  const wizard = state.wizard || {};
  const builder = state.builder || {};
  const wizardHashNow = computeWizardHash(wizard);

  // Seed once from wizard if never applied.
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
    return;
  }

  // Selection
  document.querySelectorAll("[data-tree-select]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-tree-select");
      const s = store.getState();
      store.setState({ builder: { ...s.builder, treeSelectedId: id } });
    });
  });

  // Add generic person
  const addBtn = document.getElementById("tree-add-person");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const name = prompt("Nombre de la persona:", "Nueva persona") || "Nueva persona";
      const sex = prompt("Sexo (male/female):", "male") || "male";
      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
      const t2 = addPerson(tree, { name, sex, alive: true });
      const newId = `p${t2.nextId - 1}`;
      store.setState({ builder: { ...s.builder, tree: t2, treeSelectedId: newId } });
    });
  }

  // Quick adds relative to deceased
  const quickSpouse = document.getElementById("tree-quick-add-spouse");
  if (quickSpouse) quickSpouse.addEventListener("click", () => quickAddRelative(store, "spouse"));
  const quickSon = document.getElementById("tree-quick-add-son");
  if (quickSon) quickSon.addEventListener("click", () => quickAddRelative(store, "son"));
  const quickDau = document.getElementById("tree-quick-add-daughter");
  if (quickDau) quickDau.addEventListener("click", () => quickAddRelative(store, "daughter"));

  // Edit selected person
  const nameEl = document.getElementById("tree-person-name");
  if (nameEl) {
    nameEl.addEventListener("input", (e) => {
      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
      const id = s.builder.treeSelectedId || tree.deceasedId;
      const t2 = updatePerson(tree, id, { name: e.target.value });
      store.setState({ builder: { ...s.builder, tree: t2 } });
    });
  }

  const sexEl = document.getElementById("tree-person-sex");
  if (sexEl) {
    sexEl.addEventListener("change", (e) => {
      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
      const id = s.builder.treeSelectedId || tree.deceasedId;
      const t2 = updatePerson(tree, id, { sex: e.target.value });
      store.setState({ builder: { ...s.builder, tree: t2 } });
    });
  }

  const aliveEl = document.getElementById("tree-person-alive");
  if (aliveEl) {
    aliveEl.addEventListener("change", (e) => {
      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
      const id = s.builder.treeSelectedId || tree.deceasedId;
      const t2 = updatePerson(tree, id, { alive: Boolean(e.target.checked) });
      store.setState({ builder: { ...s.builder, tree: t2 } });
    });
  }

  // Parents
  const fatherEl = document.getElementById("tree-parent-father");
  if (fatherEl) {
    fatherEl.addEventListener("change", (e) => {
      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
      const id = s.builder.treeSelectedId || tree.deceasedId;
      const cur = getParents(tree, id);
      const t2 = setParents(tree, id, { ...cur, fatherId: e.target.value || null });
      store.setState({ builder: { ...s.builder, tree: t2 } });
    });
  }
  const motherEl = document.getElementById("tree-parent-mother");
  if (motherEl) {
    motherEl.addEventListener("change", (e) => {
      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
      const id = s.builder.treeSelectedId || tree.deceasedId;
      const cur = getParents(tree, id);
      const t2 = setParents(tree, id, { ...cur, motherId: e.target.value || null });
      store.setState({ builder: { ...s.builder, tree: t2 } });
    });
  }

  // Spouses
  const addSpouseEl = document.getElementById("tree-add-spouse");
  if (addSpouseEl) {
    addSpouseEl.addEventListener("click", () => {
      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
      const id = s.builder.treeSelectedId || tree.deceasedId;
      const sel = tree.people[id];
      const spouseSex = sel.sex === "male" ? "female" : "male";
      const t1 = addPerson(tree, { name: "Cónyuge", sex: spouseSex, alive: true });
      const newId = `p${t1.nextId - 1}`;
      const t2 = linkSpouses(t1, id, newId);
      store.setState({ builder: { ...s.builder, tree: t2, treeSelectedId: newId } });
    });
  }

  document.querySelectorAll("[data-tree-unlink-spouse]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const pair = e.currentTarget.getAttribute("data-tree-unlink-spouse");
      const [aId, bId] = pair.split(":");
      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
      const t2 = unlinkSpouses(tree, aId, bId);
      store.setState({ builder: { ...s.builder, tree: t2 } });
    });
  });

  // Add child relative to selected
  const addSonBtn = document.getElementById("tree-add-child-son");
  const addDauBtn = document.getElementById("tree-add-child-daughter");
  if (addSonBtn) addSonBtn.addEventListener("click", () => addChild(store, "male"));
  if (addDauBtn) addDauBtn.addEventListener("click", () => addChild(store, "female"));
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
          const isSel = p.id === selectedId;
          const isDeceased = p.id === tree.deceasedId;
          const badge = isDeceased
            ? `<span class="pill pill-dark">Causante</span>`
            : p.alive
            ? `<span class="pill">Vive</span>`
            : `<span class="pill pill-dark">Fallecido</span>`;
          return `
          <button class="tree-person ${isSel ? "is-selected" : ""}" data-tree-select="${p.id}">
            <span class="tree-person-name">${escapeHtml(p.name)}</span>
            <span class="tree-person-meta">${badge} <span class="pill">${p.sex}</span></span>
          </button>
        `;
        })
        .join("")}
    </div>
  `;
}

function renderPersonOptions(tree, selectedId, sexFilter, selectedValue) {
  const people = Object.values(tree.people)
    .filter((p) => p.id !== selectedId)
    .filter((p) => (sexFilter ? p.sex === sexFilter : true))
    .sort((a, b) => a.name.localeCompare(b.name));

  return people
    .map(
      (p) =>
        `<option value="${p.id}" ${
          p.id === selectedValue ? "selected" : ""
        }>${escapeHtml(p.name)}</option>`
    )
    .join("");
}

function renderDerivedTable(heirsByRole) {
  const rows = EXPECTED_ROLES.map((role) => {
    const n = heirsByRole[role] || 0;
    if (!n) return null;
    const limit = ROLE_LIMITS[role] || null;
    const note = limit ? `≤ ${limit}` : "";
    return `<tr><td><code>${role}</code></td><td>${n}</td><td class="muted">${note}</td></tr>`;
  }).filter(Boolean);

  if (!rows.length) return `<p class="muted">Aún no hay herederos derivados desde el árbol.</p>`;

  return `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Role</th><th>Count</th><th class="muted">Límite</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

function addChild(store, sex) {
  const s = store.getState();
  const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
  const parentId = s.builder.treeSelectedId || tree.deceasedId;
  const parent = tree.people[parentId];

  const t1 = addPerson(tree, {
    name: sex === "male" ? "Hijo" : "Hija",
    sex,
    alive: true,
  });
  const childId = `p${t1.nextId - 1}`;

  const cur = getParents(t1, childId);
  const newParents = { ...cur };
  if (parent.sex === "male") newParents.fatherId = parentId;
  else newParents.motherId = parentId;

  const t2 = setParents(t1, childId, newParents);
  store.setState({
    builder: { ...s.builder, tree: t2, treeSelectedId: childId },
  });
}

function quickAddRelative(store, kind) {
  const s = store.getState();
  const tree = ensureTree(sanitizeTree(s.builder.tree), s.wizard);
  const dId = tree.deceasedId;
  const d = tree.people[dId];

  if (kind === "spouse") {
    const spouseSex = d.sex === "male" ? "female" : "male";
    const t1 = addPerson(tree, { name: "Cónyuge", sex: spouseSex, alive: true });
    const spouseId = `p${t1.nextId - 1}`;
    const t2 = linkSpouses(t1, dId, spouseId);
    store.setState({ builder: { ...s.builder, tree: t2, treeSelectedId: spouseId } });
    return;
  }

  if (kind === "son" || kind === "daughter") {
    const sex = kind === "son" ? "male" : "female";
    const t1 = addPerson(tree, {
      name: kind === "son" ? "Hijo" : "Hija",
      sex,
      alive: true,
    });
    const childId = `p${t1.nextId - 1}`;
    const cur = getParents(t1, childId);
    const newParents = { ...cur };
    if (d.sex === "male") newParents.fatherId = dId;
    else newParents.motherId = dId;
    const t2 = setParents(t1, childId, newParents);
    store.setState({ builder: { ...s.builder, tree: t2, treeSelectedId: childId } });
  }
}

function computeWizardHash(wizard) {
  const w = wizard || {};
  const stable = {
    deceased_sex: w.deceased_sex || null,
    spouse: {
      enabled: Boolean(w.spouse && w.spouse.enabled),
      wives_count: Number((w.spouse && w.spouse.wives_count) || 0) || 0,
      husband_present: Boolean(w.spouse && w.spouse.husband_present),
    },
    descendants: {
      enabled: Boolean(w.descendants && w.descendants.enabled),
      son: Number((w.descendants && w.descendants.son) || 0) || 0,
      daughter: Number((w.descendants && w.descendants.daughter) || 0) || 0,
      sons_son: Number((w.descendants && w.descendants.sons_son) || 0) || 0,
      sons_daughter: Number((w.descendants && w.descendants.sons_daughter) || 0) || 0,
    },
    parents: {
      father: Boolean(w.parents && w.parents.father),
      mother: Boolean(w.parents && w.parents.mother),
    },
  };
  return JSON.stringify(stable);
}

function applyWizardToTree(tree, wizard) {
  const w = wizard || {};
  let t = ensureTree(tree, w);

  // Parents
  if (w.parents && w.parents.father) {
    const res = ensureParentNode(t, "father");
    t = res.tree;
    t = setParents(t, t.deceasedId, { ...getParents(t, t.deceasedId), fatherId: res.id });
  }
  if (w.parents && w.parents.mother) {
    const res = ensureParentNode(t, "mother");
    t = res.tree;
    t = setParents(t, t.deceasedId, { ...getParents(t, t.deceasedId), motherId: res.id });
  }

  // Spouse(s) only if spouse.enabled
  const d = t.people[t.deceasedId];
  const spouseEnabled = Boolean(w.spouse && w.spouse.enabled);
  if (spouseEnabled) {
    if (d.sex === "male") {
      const want = Number((w.spouse && w.spouse.wives_count) || 0) || 0;
      if (want > 0) {
        const existing = getSpouses(t, t.deceasedId).filter((id) => t.people[id].alive && t.people[id].sex === "female");
        let missing = want - existing.length;
        while (missing > 0) {
          t = addPerson(t, { name: "Esposa", sex: "female", alive: true });
          const newId = `p${t.nextId - 1}`;
          t = linkSpouses(t, t.deceasedId, newId);
          missing -= 1;
        }
      }
    } else {
      const want = Boolean(w.spouse && w.spouse.husband_present);
      if (want) {
        const existing = getSpouses(t, t.deceasedId).filter((id) => t.people[id].alive && t.people[id].sex === "male");
        if (!existing.length) {
          t = addPerson(t, { name: "Marido", sex: "male", alive: true });
          const newId = `p${t.nextId - 1}`;
          t = linkSpouses(t, t.deceasedId, newId);
        }
      }
    }
  }

  // Descendants only if descendants.enabled
  const descendantsEnabled = Boolean(w.descendants && w.descendants.enabled);
  const sonsCount = Number((w.descendants && w.descendants.son) || 0) || 0;
  const daughtersCount = Number((w.descendants && w.descendants.daughter) || 0) || 0;
  if (descendantsEnabled) {
    t = ensureDirectChildren(t, "male", sonsCount);
    t = ensureDirectChildren(t, "female", daughtersCount);
  }

  // Grandchildren via sons (placeholder anchor son if needed)
  const sonsSon = Number((w.descendants && w.descendants.sons_son) || 0) || 0;
  const sonsDau = Number((w.descendants && w.descendants.sons_daughter) || 0) || 0;
  const needGrand = descendantsEnabled && (sonsSon + sonsDau > 0);

  if (needGrand) {
    const sonIds = getChildren(t, t.deceasedId).filter((id) => t.people[id].alive && t.people[id].sex === "male");
    let anchorSonId = sonIds[0] || null;

    if (!anchorSonId) {
      t = addPerson(t, { name: "Hijo (placeholder)", sex: "male", alive: true });
      anchorSonId = `p${t.nextId - 1}`;
      const cur = getParents(t, anchorSonId);
      const newParents = { ...cur };
      if (t.people[t.deceasedId].sex === "male") newParents.fatherId = t.deceasedId;
      else newParents.motherId = t.deceasedId;
      t = setParents(t, anchorSonId, newParents);
    }

    t = ensureChildrenOfParent(t, anchorSonId, "male", sonsSon);
    t = ensureChildrenOfParent(t, anchorSonId, "female", sonsDau);
  }

  return t;
}

function ensureParentNode(tree, which) {
  const dId = tree.deceasedId;
  const rel = getParents(tree, dId);
  const current = which === "father" ? rel.fatherId : rel.motherId;
  if (current && tree.people[current]) return { tree, id: current };

  const sex = which === "father" ? "male" : "female";
  const name = which === "father" ? "Padre" : "Madre";
  const t1 = addPerson(tree, { name, sex, alive: true });
  const id = `p${t1.nextId - 1}`;
  return { tree: t1, id };
}

function ensureDirectChildren(tree, sex, wantCount) {
  if (!wantCount || wantCount <= 0) return tree;

  const dId = tree.deceasedId;
  const d = tree.people[dId];

  const existing = getChildren(tree, dId).filter((id) => tree.people[id].alive && tree.people[id].sex === sex);
  let missing = wantCount - existing.length;
  let t = tree;

  while (missing > 0) {
    t = addPerson(t, { name: sex === "male" ? "Hijo" : "Hija", sex, alive: true });
    const childId = `p${t.nextId - 1}`;
    const cur = getParents(t, childId);
    const newParents = { ...cur };
    if (d.sex === "male") newParents.fatherId = dId;
    else newParents.motherId = dId;
    t = setParents(t, childId, newParents);
    missing -= 1;
  }

  return t;
}

function ensureChildrenOfParent(tree, parentId, sex, wantCount) {
  if (!wantCount || wantCount <= 0) return tree;

  const existing = getChildren(tree, parentId).filter((id) => tree.people[id].alive && tree.people[id].sex === sex);
  let missing = wantCount - existing.length;
  let t = tree;

  while (missing > 0) {
    t = addPerson(t, { name: sex === "male" ? "Nieto" : "Nieta", sex, alive: true });
    const childId = `p${t.nextId - 1}`;
    const cur = getParents(t, childId);
    const newParents = { ...cur, fatherId: parentId };
    t = setParents(t, childId, newParents);
    missing -= 1;
  }

  return t;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
