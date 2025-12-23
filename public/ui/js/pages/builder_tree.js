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
import { runCalc } from "../actions/calc.js";
import { EXPECTED_ROLES } from "../api/contract.js";
import { deriveHeirsFromTree } from "../domain/treeRoles.js";

/*
  Tree Builder v2
  - Tree is the source of truth.
  - Wizard can be merged into the tree only via explicit user action (import).
  - Render by generations using BFS from deceasedId:
      parents: level -1, children: +1, spouses: same level.
*/

function escapeHtml(str){
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normStr(s){
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function safeSex(s){
  return (s === "male" || s === "female") ? s : null;
}

function computeWizardHash(wizard){
  try{
    return JSON.stringify(wizard || {});
  }catch{
    return String(Date.now());
  }
}

function getTreeUi(builder){
  const ui = builder?.treeUi && typeof builder.treeUi === "object" ? builder.treeUi : {};
  return {
    search: typeof ui.search === "string" ? ui.search : "",
    collapsedLevels: ui.collapsedLevels && typeof ui.collapsedLevels === "object" ? ui.collapsedLevels : {},
    showDisconnected: ui.showDisconnected !== false,
    peopleListCollapsed: ui.peopleListCollapsed === true,
    modal: ui.modal || null,
  };
}

function setTreeUi(store, partial, { persist = true } = {}){
  store.setState((s) => {
    const builder = s.builder || {};
    const ui = getTreeUi(builder);
    return {
      ...s,
      builder: {
        ...builder,
        treeUi: {
          ...ui,
          ...partial,
        },
      },
    };
  }, { persist });
}

function getTreeFromState(state){
  const builder = state?.builder || {};
  const treeRaw = builder.tree;
  // ensureTree ignores wizard by design
  return ensureTree(sanitizeTree(treeRaw), null);
}

function selectPerson(store, personId){
  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      treeSelectedId: personId,
    },
  }), { persist: true });
}

function buildGenerationIndex(tree){
  const did = tree.deceasedId;
  const gen = new Map();
  gen.set(did, 0);

  const q = [did];

  while (q.length){
    const cur = q.shift();
    const curGen = gen.get(cur) ?? 0;

    // spouses same level
    const spouses = getSpouses(tree, cur);
    for (const sid of spouses){
      if (!gen.has(sid)){
        gen.set(sid, curGen);
        q.push(sid);
      }
    }

    // parents one level up
    const p = getParents(tree, cur);
    for (const pid of [p.fatherId, p.motherId]){
      if (pid && !gen.has(pid)){
        gen.set(pid, curGen - 1);
        q.push(pid);
      }
    }

    // children one level down
    const kids = getChildren(tree, cur);
    for (const kid of kids){
      if (!gen.has(kid)){
        gen.set(kid, curGen + 1);
        q.push(kid);
      }
    }
  }

  return gen;
}

function groupByGeneration(tree, genMap){
  const out = new Map();
  for (const id of Object.keys(tree.people || {})){
    const g = genMap.has(id) ? genMap.get(id) : null;
    if (g === null) continue;
    const p = tree.people[id] || {};
    const row = { id, ...p };
    if (!out.has(g)) out.set(g, []);
    out.get(g).push(row);
  }

  for (const [g, list] of out){
    list.sort((a, b) => {
      if (a.id === tree.deceasedId) return -1;
      if (b.id === tree.deceasedId) return 1;
      const an = normStr(a.name || "");
      const bn = normStr(b.name || "");
      if (an < bn) return -1;
      if (an > bn) return 1;
      return String(a.id).localeCompare(String(b.id));
    });
    out.set(g, list);
  }

  return out;
}

function matchSearch(person, q){
  if (!q) return true;
  const name = normStr(person?.name || "");
  const id = normStr(person?.id || "");
  return name.includes(q) || id.includes(q);
}

function renderLevelHeader(level, ui){
  const isCollapsed = ui.collapsedLevels[String(level)] === true;
  const title = level === 0 ? "Generación 0 (causante)" : (level < 0 ? `Ascendentes (${level})` : `Descendentes (+${level})`);
  const btnLabel = isCollapsed ? "Desplegar" : "Plegar";
  return `
    <div class="row" style="justify-content:space-between; align-items:center; gap:10px;">
      <div class="row" style="gap:10px; align-items:center;">
        <span class="badge">${escapeHtml(title)}</span>
      </div>
      <button class="btn btn-small" type="button" data-tree-action="toggle-level" data-level="${escapeHtml(String(level))}">
        ${escapeHtml(btnLabel)}
      </button>
    </div>
  `;
}

function renderPersonCard(tree, person, { selectedId }){
  const id = person.id;
  const isSelected = id === selectedId;
  const isDeceased = id === tree.deceasedId;

  const sex = safeSex(person.sex);
  const sexLabel = sex === "male" ? "male" : (sex === "female" ? "female" : "sex?");
  const aliveLabel = person.alive === true ? "alive" : "deceased";
  const tag = isDeceased ? `<span class="pill pill-warn">causante</span>` : "";

  const cls = isSelected ? "card card-pad tree-node is-selected" : "card card-pad tree-node";

  return `
    <div class="${cls}">
      <div class="row" style="justify-content:space-between; gap:10px; align-items:flex-start;">
        <div class="stack" style="gap:4px; min-width:0;">
          <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap;">
            <div style="font-weight:800;">${escapeHtml(person.name || id)}</div>
            ${tag}
          </div>
          <div class="muted" style="font-size:12px;">
            <span>${escapeHtml(id)}</span>
            <span> | </span>
            <span>${escapeHtml(sexLabel)}</span>
            <span> | </span>
            <span>${escapeHtml(aliveLabel)}</span>
          </div>
        </div>

        <div class="row" style="gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="btn btn-small" type="button" data-tree-action="select" data-person-id="${escapeHtml(id)}">Seleccionar</button>
          <button class="btn btn-small" type="button" data-tree-action="edit" data-person-id="${escapeHtml(id)}">Editar</button>
          <button class="btn btn-small" type="button" data-tree-action="set-deceased" data-person-id="${escapeHtml(id)}">Set causante</button>
          <button class="btn btn-small" type="button" data-tree-action="add-child" data-person-id="${escapeHtml(id)}">+ hijo/a</button>
          <button class="btn btn-small" type="button" data-tree-action="add-spouse" data-person-id="${escapeHtml(id)}">+ cónyuge</button>
        </div>
      </div>
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
      ${renderLevelHeader(level, { collapsedLevels: ui.collapsedLevels })}
      ${cards}
    </div>
  `;
}

function renderDisconnected(tree, genMap, ui, selectedId, q){
  if (ui.showDisconnected !== true) return "";
  const disconnected = [];
  for (const id of Object.keys(tree.people || {})){
    if (genMap.has(id)) continue;
    const p = tree.people[id] || {};
    const row = { id, ...p };
    if (!matchSearch(row, q)) continue;
    disconnected.push(row);
  }
  if (!disconnected.length) return "";

  disconnected.sort((a, b) => normStr(a.name || "").localeCompare(normStr(b.name || "")));

  const items = disconnected.map((p) => renderPersonCard(tree, p, { selectedId })).join("");

  return `
    <div class="card card-pad stack" style="gap:12px;">
      <div class="row" style="justify-content:space-between; align-items:center; gap:10px;">
        <div class="row" style="gap:10px; align-items:center;">
          <span class="badge">Desconectados</span>
          <span class="muted" style="font-size:12px;">No alcanzables desde el causante por BFS.</span>
        </div>
      </div>
      ${items}
    </div>
  `;
}

function renderToolbar(state, tree, ui){
  const builder = state?.builder || {};
  const wizard = state?.wizard || {};

  const hashNow = computeWizardHash(wizard);
  const appliedHash = builder?.wizardHashApplied || null;
  const applied = appliedHash && appliedHash === hashNow;

  const appliedPill = applied ? `<span class="pill pill-ok">Wizard importado</span>` : `<span class="pill">Wizard no importado</span>`;

  return `
    <div class="card card-pad stack" style="gap:12px;">
      <div class="row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <div class="stack" style="gap:4px;">
          <div style="font-weight:800;">Tree Builder</div>
          <div class="muted" style="font-size:13px; line-height:1.35;">
            Fuente de verdad: tree. El wizard solo sirve como seed mediante import explícito.
          </div>
        </div>

        <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap;">
          ${appliedPill}
          <button class="btn" type="button" data-tree-action="import-wizard">Importar del wizard al árbol</button>
          <button class="btn" type="button" data-tree-action="create-person">+ persona</button>
        </div>
      </div>

      <div class="row" style="gap:10px; align-items:center; flex-wrap:wrap;">
        <label class="row" style="gap:8px; align-items:center;">
          <input type="checkbox" id="tree-show-disconnected" ${ui.showDisconnected ? "checked" : ""} />
          <span class="muted">Mostrar desconectados</span>
        </label>
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

function renderDerivedPanel(state, tree){
  const rawTree = state?.builder?.tree || tree;
  const derived = deriveHeirsFromTree(rawTree) || {};
  const roles = (derived.roles && typeof derived.roles === "object") ? derived.roles : {};
  const warnings = Array.isArray(derived.warnings) ? derived.warnings : [];
  const unmapped = Array.isArray(derived.unmapped) ? derived.unmapped : [];

  const mappedCount = Object.values(roles).reduce((acc, r) => acc + (Number(r?.count) || 0), 0);

  const warningHtml = warnings.length
    ? `
      <div class="notice warn" style="margin:0;">
        <div style="font-weight:700; margin-bottom:6px;">Warnings</div>
        <ul style="margin:0; padding-left:18px;">
          ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  const rolesTable = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th style="text-align:left;">Role</th>
            <th style="width:70px;">Count</th>
            <th style="text-align:left;">Personas (evidencia)</th>
          </tr>
        </thead>
        <tbody>
          ${EXPECTED_ROLES.map((role) => {
            const r = roles[role];
            const count = Number(r?.count) || 0;
            const people = Array.isArray(r?.people) ? r.people : [];
            const names = people.map((p) => `${escapeHtml(p.name)} <span class="muted">(${escapeHtml(p.id)})</span>`).join(", ");
            return `
              <tr>
                <td><code>${escapeHtml(role)}</code></td>
                <td>${count ? String(count) : ""}</td>
                <td>${names || `<span class="muted">-</span>`}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  const unmappedHtml = unmapped.length
    ? `
      <div class="stack" style="gap:8px;">
        <div style="font-weight:700;">Vivos no mapeados al contrato del core</div>
        <div class="muted" style="font-size:13px; line-height:1.35;">
          Estos nodos estan conectados al causante, pero no encajan en ninguno de los roles soportados por el core,
          o faltan datos suficientes (sexo, enlaces, etc). Se muestra un path BFS minimo desde el causante.
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="text-align:left;">Persona</th>
                <th style="text-align:left;">Path</th>
                <th style="text-align:left;">Motivo</th>
              </tr>
            </thead>
            <tbody>
              ${unmapped.map((u) => `
                <tr>
                  <td>
                    <div style="font-weight:700;">${escapeHtml(u.name)} <span class="muted">(${escapeHtml(u.id)})</span></div>
                    <div class="muted">${escapeHtml(u.sex)} | alive</div>
                  </td>
                  <td><code style="font-size:12px;">${escapeHtml(u.path || "")}</code></td>
                  <td class="muted">${escapeHtml(u.reason || "")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `
    : `<div class="muted" style="font-size:13px;">No hay vivos no mapeados.</div>`;

  const statusPills = [
    mappedCount ? `<span class="pill pill-ok">Mapped: ${mappedCount}</span>` : `<span class="pill">Mapped: 0</span>`,
    unmapped.length ? `<span class="pill pill-warn">Unmapped: ${unmapped.length}</span>` : `<span class="pill pill-ok">Unmapped: 0</span>`,
  ].join(" ");

  return `
    <div class="card card-pad stack" style="gap:12px;">
      <div class="row" style="justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap;">
        <div class="stack" style="gap:6px;">
          <div style="font-weight:800; font-size:16px;">Derivacion de roles (tree mode)</div>
          <div>${statusPills}</div>
        </div>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <button class="btn btn-primary" type="button" data-tree-action="run-calc">Calcular</button>
          <button class="btn" type="button" data-tree-action="go-results">Ir a resultados</button>
        </div>
      </div>

      ${warningHtml}

      <div class="stack" style="gap:10px;">
        <div style="font-weight:700;">Roles soportados por el core</div>
        <div class="muted" style="font-size:13px; line-height:1.35;">
          La UI deriva roles a partir del arbol sin inventar ninguno: solo roles presentes en el contrato.
        </div>
        ${rolesTable}
      </div>

      <hr class="hr" />

      ${unmappedHtml}
    </div>
  `;
}

function renderModal(_tree, ui){
  const modal = ui.modal;
  if (!modal) return "";

  const title = modal.type === "edit" ? "Editar persona" : (modal.type === "add-spouse" ? "Añadir cónyuge" : (modal.type === "add-child" ? "Añadir hijo/a" : "Nueva persona"));

  const name = modal.fields?.name ?? "";
  const sex = modal.fields?.sex ?? "";
  const alive = modal.fields?.alive === false ? false : true;

  const sexOpts = `
    <option value="" ${sex ? "" : "selected"}>Sin especificar</option>
    <option value="male" ${sex === "male" ? "selected" : ""}>Male</option>
    <option value="female" ${sex === "female" ? "selected" : ""}>Female</option>
  `;

  return `
    <div class="modal-backdrop tree-modal-backdrop" id="tree-modal-backdrop">
      <div class="modal tree-modal">
        <div class="modal-head">
          <div class="modal-title">${escapeHtml(title)}</div>
          <button class="btn btn-small" type="button" data-tree-action="close-modal">Cerrar</button>
        </div>
        <div class="modal-body tree-modal-body">
          <div class="field">
            <span class="label">Nombre</span>
            <input class="input" id="tree-modal-name" type="text" value="${escapeHtml(name)}" />
          </div>

          <div class="row" style="gap:10px; align-items:flex-end; flex-wrap:wrap;">
            <label class="field" style="min-width:220px;">
              <span class="label">Sexo</span>
              <select class="select" id="tree-modal-sex">
                ${sexOpts}
              </select>
            </label>

            <label class="row" style="gap:8px; align-items:center;">
              <input type="checkbox" id="tree-modal-alive" ${alive ? "checked" : ""} />
              <span class="muted">Vivo</span>
            </label>
          </div>

          <div class="row" style="gap:8px; justify-content:flex-end; margin-top:10px;">
            <button class="btn" type="button" data-tree-action="close-modal">Cancelar</button>
            <button class="btn btn-primary" type="button" data-tree-action="save-modal">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openCreateModal(store){
  setTreeUi(store, { modal: { type: "create", fields: { name: "", sex: "", alive: true } } }, { persist: false });
}

function openEditModal(store, personId){
  const st = store.getState();
  const tree = getTreeFromState(st);
  const p = tree.people?.[personId] || {};
  setTreeUi(store, { modal: { type: "edit", personId, fields: { name: p.name || "", sex: p.sex || "", alive: p.alive !== false } } }, { persist: false });
}

function openAddSpouseModal(store, personId){
  setTreeUi(store, { modal: { type: "add-spouse", personId, fields: { name: "", sex: "", alive: true } } }, { persist: false });
}

function openAddChildModal(store, parentId){
  setTreeUi(store, { modal: { type: "add-child", parentId, fields: { name: "", sex: "", alive: true } } }, { persist: false });
}

function commitCreatePerson(store){
  const st = store.getState();
  const builder = st.builder || {};
  const ui = getTreeUi(builder);
  const modal = ui.modal;
  if (!modal) return;

  const fields = modal.fields || {};
  store.setState((s) => {
    const tree0 = getTreeFromState(s);
    const r = addPerson(tree0, {
      name: String(fields.name || "").trim() || "Persona",
      sex: safeSex(fields.sex) || null,
      alive: fields.alive !== false,
    });
    return {
      ...s,
      builder: {
        ...s.builder,
        tree: r.tree,
        treeSelectedId: r.personId,
      },
    };
  }, { persist: true });

  setTreeUi(store, { modal: null }, { persist: false });
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
    const t1 = updatePerson(tree0, personId, {
      name: String(fields.name || "").trim() || "Persona",
      sex: safeSex(fields.sex) || null,
      alive: fields.alive !== false,
    });
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

  const personId = modal.personId;
  const fields = modal.fields || {};

  store.setState((s) => {
    let tree0 = getTreeFromState(s);

    // Reuse if exact name match (simple heuristic), else create new
    const wanted = normStr(String(fields.name || "").trim());
    let reuseId = null;

    if (wanted){
      for (const [id, p] of Object.entries(tree0.people || {})){
        const n = normStr(p?.name || "");
        if (n && n === wanted){
          reuseId = id;
          break;
        }
      }
    }

    if (!reuseId){
      const r = addPerson(tree0, {
        name: String(fields.name || "").trim() || "Cónyuge",
        sex: safeSex(fields.sex) || null,
        alive: fields.alive !== false,
      });
      tree0 = r.tree;
      reuseId = r.personId;
    }

    const t1 = linkSpouses(tree0, personId, reuseId);

    return {
      ...s,
      builder: {
        ...s.builder,
        tree: t1,
        treeSelectedId: reuseId,
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

  const parentId = modal.parentId;
  const fields = modal.fields || {};

  store.setState((s) => {
    let tree0 = getTreeFromState(s);

    const wanted = normStr(String(fields.name || "").trim());
    let reuseId = null;

    if (wanted){
      for (const [id, p] of Object.entries(tree0.people || {})){
        const n = normStr(p?.name || "");
        if (n && n === wanted){
          reuseId = id;
          break;
        }
      }
    }

    if (!reuseId){
      const r = addPerson(tree0, {
        name: String(fields.name || "").trim() || "Hijo/a",
        sex: safeSex(fields.sex) || null,
        alive: fields.alive !== false,
      });
      tree0 = r.tree;
      reuseId = r.personId;
    }

    const parent = tree0.people[parentId] || {};
    const parentSex = safeSex(parent.sex);
    const p = getParents(tree0, reuseId);

    const nextParents = { fatherId: p.fatherId || null, motherId: p.motherId || null };

    if (parentSex === "male") nextParents.fatherId = parentId;
    else if (parentSex === "female") nextParents.motherId = parentId;
    else {
      // if parent sex unknown, attach as father by default but warn later via unmapped
      nextParents.fatherId = parentId;
    }

    const t1 = setParents(tree0, reuseId, nextParents);

    return {
      ...s,
      builder: {
        ...s.builder,
        tree: t1,
        treeSelectedId: reuseId,
      },
    };
  }, { persist: true });

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
  store.setState((s) => {
    const tree0 = getTreeFromState(s);
    const t1 = { ...tree0, deceasedId: personId };
    return {
      ...s,
      builder: {
        ...s.builder,
        tree: t1,
        treeSelectedId: personId,
      },
    };
  }, { persist: true });
}

function confirmUnlinkSpouses(store, a, b){
  openModal(store, {
    title: "Eliminar vínculo de cónyuge",
    body: `¿Quitar vínculo entre ${escapeHtml(a)} y ${escapeHtml(b)}?`,
    confirmLabel: "Eliminar",
    confirmAction: "tree-unlink-spouse",
    confirmData: { a, b },
  });
}

function handleConfirm(store, action, data){
  if (action === "tree-unlink-spouse"){
    const a = data?.a;
    const b = data?.b;
    if (!a || !b) return;
    store.setState((s) => {
      const tree0 = getTreeFromState(s);
      const t1 = unlinkSpouses(tree0, a, b);
      return {
        ...s,
        builder: {
          ...s.builder,
          tree: t1,
        },
      };
    }, { persist: true });
  }
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
  }).filter(Boolean).join("");

  const disconnectedHtml = renderDisconnected(tree, genMap, ui, selectedId, q);
  const derivedHtml = renderDerivedPanel(state, tree);
  const modalHtml = renderModal(tree, ui);

  return `
    <div class="stack" style="gap:12px;">
      ${renderToolbar(state, tree, ui)}
      ${renderSearch(ui)}
      <div id="builder-tree-root" class="tree-grid" style="align-items:start;">
        <div class="stack" style="gap:12px;">
          ${levelsHtml}
          ${disconnectedHtml}
        </div>
        <div class="stack" style="gap:12px;">
          ${derivedHtml}
        </div>
      </div>
      ${modalHtml}
    </div>
  `;
}

export function applyWizardSyncTree(_store){
  // No auto-sync: wizard does not force tree attributes. Import is explicit.
  return;
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

function applyWizardToTree(tree, wizard){
  const w = wizard && typeof wizard === "object" ? wizard : {};
  let t = ensureTree(tree, null);

  const addOne = (fields) => {
    const r = addPerson(t, fields);
    t = r.tree;
    return r.personId;
  };

  // Parents (merge, no duplicates)
  const parents = w.parents && typeof w.parents === "object" ? w.parents : {};
  const existingParents = getParents(t, t.deceasedId);

  if (parents.father === true && !existingParents.fatherId){
    const fatherId = addOne({ name: "Padre", sex: "male", alive: true });
    t = setParents(t, t.deceasedId, { ...existingParents, fatherId });
  }
  if (parents.mother === true && !existingParents.motherId){
    const motherId = addOne({ name: "Madre", sex: "female", alive: true });
    t = setParents(t, t.deceasedId, { ...getParents(t, t.deceasedId), motherId });
  }

  // Spouse
  const spouse = w.spouse && typeof w.spouse === "object" ? w.spouse : {};
  if (spouse.enabled === true){
    const dSexHint = safeSex(w.deceased_sex) || safeSex(t.people[t.deceasedId]?.sex);

    if (dSexHint === "male"){
      const wivesCount = Number.isFinite(Number(spouse.wives_count)) ? Math.max(0, Math.min(4, Math.trunc(Number(spouse.wives_count)))) : 0;
      const existing = getSpouses(t, t.deceasedId).length;
      for (let i = existing; i < wivesCount; i++){
        const wifeId = addOne({ name: `Esposa ${i + 1}`, sex: "female", alive: true });
        t = linkSpouses(t, t.deceasedId, wifeId);
      }
    } else if (dSexHint === "female"){
      const already = getSpouses(t, t.deceasedId).length;
      if (already === 0){
        const alive = spouse.husband_present === true;
        const husbandId = addOne({ name: "Esposo", sex: "male", alive });
        t = linkSpouses(t, t.deceasedId, husbandId);
      }
    }
  }

  // Descendants: direct children (merge, no duplicates)
  const desc = w.descendants && typeof w.descendants === "object" ? w.descendants : {};
  const sonsWanted = Number.isFinite(Number(desc.son)) ? Math.max(0, Math.trunc(Number(desc.son))) : 0;
  const daughtersWanted = Number.isFinite(Number(desc.daughter)) ? Math.max(0, Math.trunc(Number(desc.daughter))) : 0;

  const childrenIds0 = getChildren(t, t.deceasedId);
  const existingSons = childrenIds0.filter((id) => t.people[id]?.sex === "male").length;
  const existingDaughters = childrenIds0.filter((id) => t.people[id]?.sex === "female").length;

  const needSons = Math.max(0, sonsWanted - existingSons);
  const needDaughters = Math.max(0, daughtersWanted - existingDaughters);

  const attachToDeceased = (childId) => {
    const existing = getParents(t, childId);
    const dSex = safeSex(t.people[t.deceasedId]?.sex);
    const parentRole = dSex === "female" ? "mother" : "father";

    const next = { fatherId: existing.fatherId || null, motherId: existing.motherId || null };
    if (parentRole === "father") next.fatherId = t.deceasedId;
    else next.motherId = t.deceasedId;

    t = setParents(t, childId, next);
  };

  for (let i = 0; i < needSons; i++){
    const childId = addOne({ name: `Hijo ${existingSons + i + 1}`, sex: "male", alive: true });
    attachToDeceased(childId);
  }
  for (let i = 0; i < needDaughters; i++){
    const childId = addOne({ name: `Hija ${existingDaughters + i + 1}`, sex: "female", alive: true });
    attachToDeceased(childId);
  }

  // Grandchildren via son: attach all to the first son (deterministic)
  const grandSonsWanted = Number.isFinite(Number(desc.sons_son)) ? Math.max(0, Math.trunc(Number(desc.sons_son))) : 0;
  const grandDaughtersWanted = Number.isFinite(Number(desc.sons_daughter)) ? Math.max(0, Math.trunc(Number(desc.sons_daughter))) : 0;

  const sonsIds = getChildren(t, t.deceasedId).filter((id) => t.people[id]?.sex === "male");
  const anchorSonId = sonsIds.length ? sonsIds[0] : null;

  if (anchorSonId){
    const anchorKids = getChildren(t, anchorSonId);
    const existingGrandSons = anchorKids.filter((id) => t.people[id]?.sex === "male").length;
    const existingGrandDaughters = anchorKids.filter((id) => t.people[id]?.sex === "female").length;

    const needGS = Math.max(0, grandSonsWanted - existingGrandSons);
    const needGD = Math.max(0, grandDaughtersWanted - existingGrandDaughters);

    const attachToAnchor = (kidId) => {
      const existing = getParents(t, kidId);
      const next = { fatherId: existing.fatherId || null, motherId: existing.motherId || null };
      next.fatherId = anchorSonId;
      t = setParents(t, kidId, next);
    };

    for (let i = 0; i < needGS; i++){
      const kidId = addOne({ name: `Nieto ${existingGrandSons + i + 1}`, sex: "male", alive: true });
      attachToAnchor(kidId);
    }
    for (let i = 0; i < needGD; i++){
      const kidId = addOne({ name: `Nieta ${existingGrandDaughters + i + 1}`, sex: "female", alive: true });
      attachToAnchor(kidId);
    }
  }

  return t;
}

export function wireBuilderTree(store){
  bindBuilderTreeEvents(store);
}

function bindBuilderTreeEvents(store){
  // modal confirm from global modal system
  const btnModalConfirm = document.getElementById("btn-modal-confirm");
  if (btnModalConfirm){
    btnModalConfirm.addEventListener("click", () => {
      const action = btnModalConfirm.getAttribute("data-confirm-action");
      let data = null;
      try{
        data = JSON.parse(btnModalConfirm.getAttribute("data-confirm-data") || "null");
      }catch{
        data = null;
      }
      handleConfirm(store, action, data);
      closeModal(store);
    });
  }

  const showDisc = document.getElementById("tree-show-disconnected");
  if (showDisc){
    showDisc.addEventListener("change", (e) => {
      setTreeUi(store, { showDisconnected: Boolean(e.target?.checked) }, { persist: true });
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

      if (action === "go-results"){
        location.hash = "#/results";
        return;
      }

      if (action === "run-calc"){
        runCalc(store);
        location.hash = "#/results";
        return;
      }

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
              treeUi: { ...ui, collapsedLevels: next },
            },
          };
        }, { persist: true });
        return;
      }

      if (action === "import-wizard"){
        importWizardToTree(store);
        return;
      }

      if (action === "create-person"){
        openCreateModal(store);
        return;
      }

      if (action === "edit" && personId){
        openEditModal(store, personId);
        return;
      }

      if (action === "set-deceased" && personId){
        setDeceased(store, personId);
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

      if (action === "unlink-spouse" && personId && otherId){
        confirmUnlinkSpouses(store, personId, otherId);
        return;
      }

      if (action === "close-modal"){
        setTreeUi(store, { modal: null }, { persist: false });
        return;
      }

      if (action === "save-modal"){
        const st = store.getState();
        const ui = getTreeUi(st.builder || {});
        const modal = ui.modal;
        if (!modal) return;

        if (modal.type === "create") commitCreatePerson(store);
        else if (modal.type === "edit") commitSaveEdit(store);
        else if (modal.type === "add-spouse") commitAddSpouse(store);
        else if (modal.type === "add-child") commitAddChild(store);

        return;
      }

      if (action === "modal-person-select" && modalPersonId){
        selectPerson(store, modalPersonId);
        return;
      }

      if (action === "modal-parent-select" && modalParentId){
        selectPerson(store, modalParentId);
        return;
      }
    });
  }

  const backdrop = document.getElementById("tree-modal-backdrop");
  if (backdrop){
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop){
        setTreeUi(store, { modal: null }, { persist: false });
      }
    });
  }

  const nameEl = document.getElementById("tree-modal-name");
  if (nameEl){
    nameEl.addEventListener("input", (e) => updateModalField(store, "name", e.target?.value ?? ""));
  }

  const sexEl = document.getElementById("tree-modal-sex");
  if (sexEl){
    sexEl.addEventListener("change", (e) => updateModalField(store, "sex", e.target?.value ?? ""));
  }

  const aliveEl = document.getElementById("tree-modal-alive");
  if (aliveEl){
    aliveEl.addEventListener("change", (e) => updateModalField(store, "alive", Boolean(e.target?.checked)));
  }

  // Escape key closes modal
  const ui0 = getTreeUi(store.getState()?.builder || {});
  if (ui0.modal){
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape"){
        setTreeUi(store, { modal: null }, { persist: false });
      }
    }, { once: true });
  }
}
