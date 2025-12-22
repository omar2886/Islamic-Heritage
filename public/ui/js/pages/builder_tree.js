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
  updatePerson,
} from "../domain/familyTree.js";

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function computeWizardHash(wizard){
  const safeWizard = wizard || {};
  const payload = {
    deceased_sex: safeWizard.deceased_sex || null,
    spouse: {
      enabled: safeWizard.spouse?.enabled === true,
      wives_count: Number(safeWizard.spouse?.wives_count ?? 0),
      husband_present: safeWizard.spouse?.husband_present === true,
    },
    descendants: {
      enabled: safeWizard.descendants?.enabled === true,
      sons_count: Number(safeWizard.descendants?.son ?? 0),
      daughters_count: Number(safeWizard.descendants?.daughter ?? 0),
    },
    parents: {
      enabled: safeWizard.parents?.enabled === true,
      father_alive: safeWizard.parents?.father === true,
      mother_alive: safeWizard.parents?.mother === true,
    },
  };
  return JSON.stringify(payload);
}

function oppositeSex(sex){
  return sex === "male" ? "female" : "male";
}

function stablePersonLabel(p){
  const name = (p?.name || "").trim();
  if (name) return name;
  return p?.id || "persona";
}

function buildLevelIndex(tree){
  const t = ensureTree(sanitizeTree(tree));
  const levelById = {};
  const q = [];

  const seed = t.deceasedId;
  levelById[seed] = 0;
  q.push(seed);

  for (let i = 0; i < q.length; i++){
    const id = q[i];
    const level = levelById[id];

    // spouses keep same level
    for (const sid of getSpouses(t, id)){
      if (levelById[sid] === undefined){
        levelById[sid] = level;
        q.push(sid);
      }
    }

    // parents are one level up
    const parents = getParents(t, id);
    for (const pid of [parents.fatherId, parents.motherId]){
      if (!pid) continue;
      if (levelById[pid] === undefined){
        levelById[pid] = level - 1;
        q.push(pid);
      }
    }

    // children are one level down
    for (const cid of getChildren(t, id)){
      if (levelById[cid] === undefined){
        levelById[cid] = level + 1;
        q.push(cid);
      }
    }
  }

  const groups = new Map();
  for (const [id, level] of Object.entries(levelById)){
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(id);
  }

  // stable sort by label then id
  for (const [level, ids] of groups.entries()){
    ids.sort((a, b) => {
      const pa = t.people[a];
      const pb = t.people[b];
      const la = stablePersonLabel(pa).toLowerCase();
      const lb = stablePersonLabel(pb).toLowerCase();
      if (la < lb) return -1;
      if (la > lb) return 1;
      return String(a).localeCompare(String(b));
    });
    groups.set(level, ids);
  }

  const allIds = Object.keys(t.people || {});
  const connected = new Set(Object.keys(levelById));
  const disconnected = allIds.filter((id) => !connected.has(id));
  disconnected.sort((a, b) => stablePersonLabel(t.people[a]).localeCompare(stablePersonLabel(t.people[b])));

  const levels = Array.from(groups.keys()).sort((a, b) => a - b);

  return { tree: t, groups, levels, disconnected };
}

function levelLabel(level){
  if (level === 0) return "Nucleo (0)";
  if (level < 0) return `Ascendientes (${level})`;
  return `Descendientes (+${level})`;
}

function renderPill(text, tone){
  const cls = tone ? `pill pill-${tone}` : "pill";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function renderNode(tree, id){
  const p = tree.people[id];
  if (!p) return "";
  const isDeceased = id === tree.deceasedId;

  const sexLabel = p.sex === "male" ? "Hombre" : "Mujer";
  const aliveLabel = p.alive ? "Vivo" : "Fallecido";

  const title = escapeHtml(stablePersonLabel(p));
  const meta = [
    renderPill(sexLabel, "neutral"),
    renderPill(aliveLabel, p.alive ? "ok" : "warn"),
    isDeceased ? renderPill("Causante", "accent") : "",
  ].filter(Boolean).join(" ");

  const actions = `
    <div class="tree-actions">
      <button class="btn btn-xs" type="button" data-tree-action="open-modal|add-child|${escapeHtml(id)}|male">+ Hijo</button>
      <button class="btn btn-xs" type="button" data-tree-action="open-modal|add-child|${escapeHtml(id)}|female">+ Hija</button>
      <button class="btn btn-xs" type="button" data-tree-action="open-modal|add-spouse|${escapeHtml(id)}">+ Conyuge</button>
      <button class="btn btn-xs" type="button" data-tree-action="open-modal|edit-person|${escapeHtml(id)}">Editar</button>
      ${isDeceased ? "" : `<button class="btn btn-xs" type="button" data-tree-action="set-deceased|${escapeHtml(id)}">Set causante</button>`}
    </div>
  `;

  return `
    <div class="tree-node" data-person-id="${escapeHtml(id)}">
      <div class="tree-node-main">
        <div class="tree-node-title">
          <strong class="tree-node-name">${title}</strong>
        </div>
        <div class="tree-node-meta">${meta}</div>
      </div>
      ${actions}
    </div>
  `;
}

function renderGeneration(tree, level, ids, collapsed){
  const header = `
    <div class="tree-gen-header">
      <div class="row" style="gap:10px;">
        <button class="btn btn-xs" type="button" data-tree-action="toggle-level|${level}">
          ${collapsed ? "Expandir" : "Plegar"}
        </button>
        <strong>${escapeHtml(levelLabel(level))}</strong>
        <span style="color:var(--muted); font-size:13px;">${ids.length} nodo(s)</span>
      </div>
    </div>
  `;

  const body = collapsed ? "" : `
    <div class="tree-gen-body">
      ${ids.map((id) => renderNode(tree, id)).join("")}
    </div>
  `;

  return `<section class="tree-gen card">${header}${body}</section>`;
}

function renderModal(state, tree){
  const modal = state?.builder?.treeUi?.modal || null;
  if (!modal) return "";

  const type = modal.type;

  if (type === "edit-person"){
    const id = modal.personId;
    const p = tree.people[id];
    if (!p) return "";

    const parents = getParents(tree, id);
    const fatherId = parents.fatherId || "";
    const motherId = parents.motherId || "";

    const all = Object.values(tree.people || {});
    const fatherOptions = all.filter((x) => x && x.id !== id && x.sex === "male");
    const motherOptions = all.filter((x) => x && x.id !== id && x.sex === "female");

    const sexMaleSel = p.sex === "male" ? "selected" : "";
    const sexFemaleSel = p.sex === "female" ? "selected" : "";

    const aliveYesSel = p.alive ? "selected" : "";
    const aliveNoSel = !p.alive ? "selected" : "";

    const aliveDisabled = (id === tree.deceasedId) ? "disabled" : "";

    return `
      <div class="tree-modal-backdrop" role="dialog" aria-modal="true">
        <div class="tree-modal card card-pad">
          <div class="row" style="justify-content:space-between;">
            <strong>Editar persona</strong>
            <button class="btn btn-xs" type="button" data-tree-action="modal-cancel">Cerrar</button>
          </div>

          <div class="tree-form">
            <div>
              <label class="label">Nombre</label>
              <input class="input" id="tree-modal-name" type="text" value="${escapeHtml(p.name || "")}" placeholder="Opcional" />
            </div>

            <div class="row" style="gap:12px; align-items:flex-end; flex-wrap:wrap;">
              <div style="flex:1; min-width:220px;">
                <label class="label">Sexo</label>
                <select class="input" id="tree-modal-sex">
                  <option value="male" ${sexMaleSel}>Hombre</option>
                  <option value="female" ${sexFemaleSel}>Mujer</option>
                </select>
              </div>

              <div style="flex:1; min-width:220px;">
                <label class="label">Estado</label>
                <select class="input" id="tree-modal-alive" ${aliveDisabled}>
                  <option value="true" ${aliveYesSel}>Vivo</option>
                  <option value="false" ${aliveNoSel}>Fallecido</option>
                </select>
              </div>
            </div>

            <div class="row" style="gap:12px; align-items:flex-end; flex-wrap:wrap;">
              <div style="flex:1; min-width:220px;">
                <label class="label">Padre (opcional)</label>
                <select class="input" id="tree-modal-father">
                  <option value="">Sin asignar</option>
                  ${fatherOptions.map((x) => `<option value="${escapeHtml(x.id)}" ${x.id === fatherId ? "selected" : ""}>${escapeHtml(stablePersonLabel(x))}</option>`).join("")}
                </select>
              </div>

              <div style="flex:1; min-width:220px;">
                <label class="label">Madre (opcional)</label>
                <select class="input" id="tree-modal-mother">
                  <option value="">Sin asignar</option>
                  ${motherOptions.map((x) => `<option value="${escapeHtml(x.id)}" ${x.id === motherId ? "selected" : ""}>${escapeHtml(stablePersonLabel(x))}</option>`).join("")}
                </select>
              </div>
            </div>

            <div class="row" style="justify-content:flex-end; gap:10px; flex-wrap:wrap;">
              <button class="btn" type="button" data-tree-action="modal-save-edit|${escapeHtml(id)}">Guardar</button>
              <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (type === "add-child"){
    const parentId = modal.parentId;
    const parent = tree.people[parentId];
    if (!parent) return "";
    const sex = (modal.sex === "male" || modal.sex === "female") ? modal.sex : "male";
    const defaultName = sex === "male" ? "Hijo" : "Hija";

    const parentLabel = stablePersonLabel(parent);

    const candidates = Object.values(tree.people || {}).filter((x) => x && x.id !== parentId);
    const existingChildren = new Set(getChildren(tree, parentId));
    const reuseCandidates = candidates.filter((x) => !existingChildren.has(x.id));

    return `
      <div class="tree-modal-backdrop" role="dialog" aria-modal="true">
        <div class="tree-modal card card-pad">
          <div class="row" style="justify-content:space-between;">
            <strong>Agregar ${sex === "male" ? "hijo" : "hija"}</strong>
            <button class="btn btn-xs" type="button" data-tree-action="modal-cancel">Cerrar</button>
          </div>

          <p style="color:var(--muted); margin:10px 0 0; line-height:1.4;">
            Progenitor: <strong>${escapeHtml(parentLabel)}</strong>
          </p>

          <div class="tree-form">
            <div class="card card-pad" style="background:rgba(255,255,255,.02);">
              <strong>Crear nuevo</strong>
              <div style="height:10px;"></div>
              <label class="label">Nombre (opcional)</label>
              <input class="input" id="tree-modal-new-child-name" type="text" value="${escapeHtml(defaultName)}" />
              <div class="row" style="justify-content:flex-end; margin-top:12px;">
                <button class="btn" type="button" data-tree-action="modal-add-child-create|${escapeHtml(parentId)}|${sex}">Crear y vincular</button>
              </div>
            </div>

            <div class="card card-pad" style="background:rgba(255,255,255,.02);">
              <strong>Vincular existente</strong>
              <div style="height:10px;"></div>
              <label class="label">Persona existente</label>
              <select class="input" id="tree-modal-existing-child">
                <option value="">Selecciona...</option>
                ${reuseCandidates.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(stablePersonLabel(x))}</option>`).join("")}
              </select>
              <div class="row" style="justify-content:flex-end; margin-top:12px;">
                <button class="btn" type="button" data-tree-action="modal-add-child-link|${escapeHtml(parentId)}">Vincular</button>
              </div>
            </div>

            <div class="row" style="justify-content:flex-end; gap:10px; flex-wrap:wrap;">
              <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (type === "add-spouse"){
    const personId = modal.personId;
    const p = tree.people[personId];
    if (!p) return "";

    const targetSex = oppositeSex(p.sex);

    const candidates = Object.values(tree.people || {}).filter((x) => x && x.id !== personId);
    const existingSpouses = new Set(getSpouses(tree, personId));
    const reuseCandidates = candidates.filter((x) => !existingSpouses.has(x.id));

    return `
      <div class="tree-modal-backdrop" role="dialog" aria-modal="true">
        <div class="tree-modal card card-pad">
          <div class="row" style="justify-content:space-between;">
            <strong>Agregar conyuge</strong>
            <button class="btn btn-xs" type="button" data-tree-action="modal-cancel">Cerrar</button>
          </div>

          <p style="color:var(--muted); margin:10px 0 0; line-height:1.4;">
            Persona: <strong>${escapeHtml(stablePersonLabel(p))}</strong>
          </p>

          <div class="tree-form">
            <div class="card card-pad" style="background:rgba(255,255,255,.02);">
              <strong>Crear nuevo</strong>
              <div style="height:10px;"></div>
              <label class="label">Nombre (opcional)</label>
              <input class="input" id="tree-modal-new-spouse-name" type="text" value="Conyuge" />
              <div class="row" style="justify-content:flex-end; margin-top:12px;">
                <button class="btn" type="button" data-tree-action="modal-add-spouse-create|${escapeHtml(personId)}|${targetSex}">Crear y vincular</button>
              </div>
            </div>

            <div class="card card-pad" style="background:rgba(255,255,255,.02);">
              <strong>Vincular existente</strong>
              <div style="height:10px;"></div>
              <label class="label">Persona existente</label>
              <select class="input" id="tree-modal-existing-spouse">
                <option value="">Selecciona...</option>
                ${reuseCandidates.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(stablePersonLabel(x))}</option>`).join("")}
              </select>
              <div class="row" style="justify-content:flex-end; margin-top:12px;">
                <button class="btn" type="button" data-tree-action="modal-add-spouse-link|${escapeHtml(personId)}">Vincular</button>
              </div>
            </div>

            <div class="row" style="justify-content:flex-end; gap:10px; flex-wrap:wrap;">
              <button class="btn" type="button" data-tree-action="modal-cancel">Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return "";
}

export function renderBuilderTree(state){
  const builder = state.builder || {};
  const wizard = state.wizard || {};
  const treeUi = builder.treeUi || { search: "", collapsed: {}, modal: null };

  const { tree, groups, levels, disconnected } = buildLevelIndex(builder.tree);

  const wizardHashNow = computeWizardHash(wizard);
  const wizardChanged = builder.wizardHashApplied && builder.wizardHashApplied !== wizardHashNow;

  const search = (treeUi.search || "").trim().toLowerCase();
  const collapsed = treeUi.collapsed || {};

  const renderLevels = [];
  for (const level of levels){
    const ids = groups.get(level) || [];
    const filtered = search
      ? ids.filter((id) => {
          if (id === tree.deceasedId) return true;
          const p = tree.people[id];
          return stablePersonLabel(p).toLowerCase().includes(search);
        })
      : ids;

    if (filtered.length === 0) continue;

    renderLevels.push(renderGeneration(tree, level, filtered, collapsed[String(level)] === true));
  }

  let others = "";
  if (disconnected.length){
    const filtered = search
      ? disconnected.filter((id) => stablePersonLabel(tree.people[id]).toLowerCase().includes(search))
      : disconnected;

    if (filtered.length){
      const key = "disconnected";
      const isCollapsed = collapsed[key] === true;
      others = `
        <section class="tree-gen card">
          <div class="tree-gen-header">
            <div class="row" style="gap:10px;">
              <button class="btn btn-xs" type="button" data-tree-action="toggle-level|${escapeHtml(key)}">
                ${isCollapsed ? "Expandir" : "Plegar"}
              </button>
              <strong>Otros (no conectados)</strong>
              <span style="color:var(--muted); font-size:13px;">${filtered.length} nodo(s)</span>
            </div>
          </div>
          ${isCollapsed ? "" : `
            <div class="tree-gen-body">
              ${filtered.map((id) => renderNode(tree, id)).join("")}
            </div>
          `}
        </section>
      `;
    }
  }

  const modalHtml = renderModal(state, tree);

  return `
    <div class="stack" style="gap:16px;">
      <section class="card card-pad stack" style="gap:12px;">
        <div class="row" style="justify-content:space-between; flex-wrap:wrap;">
          <div class="row" style="gap:10px; flex-wrap:wrap;">
            <strong>Builder (Tree)</strong>
            ${wizardChanged ? renderPill("Wizard cambiado", "warn") : ""}
          </div>
          <div class="segmented">
            <button class="btn segmented-btn is-active" type="button" id="builder-mode-tree">Tree</button>
            <button class="btn segmented-btn" type="button" id="builder-mode-roles">Roles</button>
          </div>
        </div>

        <div class="row" style="justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div class="row" style="gap:10px; flex-wrap:wrap;">
            <button class="btn" type="button" id="builder-tree-add-person" data-tree-action="add-disconnected">+ Persona</button>
            <button class="btn" type="button" id="builder-tree-import-wizard">Importar del wizard</button>
            <button class="btn" type="button" id="builder-tree-reset">Reset tree</button>
          </div>

          <div class="row" style="gap:10px; align-items:center; flex-wrap:wrap;">
            <label class="label" for="builder-tree-search" style="margin:0;">Buscar</label>
            <input class="input" id="builder-tree-search" type="search" value="${escapeHtml(treeUi.search || "")}" placeholder="Nombre o id..." />
          </div>
        </div>
      </section>

      <div id="builder-tree-root" class="stack" style="gap:12px;">
        ${renderLevels.join("")}
        ${others}
      </div>

      ${modalHtml}
    </div>
  `;
}

function setTreeUi(store, patch, { persist = false } = {}){
  const meta = { persist: persist !== true ? false : true };
  store.setState((s) => {
    const prev = s.builder?.treeUi || { search: "", collapsed: {}, modal: null };
    return {
      ...s,
      builder: {
        ...s.builder,
        treeUi: { ...prev, ...patch },
      },
    };
  }, meta);
}

function closeTreeModal(store){
  setTreeUi(store, { modal: null }, { persist: false });
}

function openTreeModal(store, modal){
  setTreeUi(store, { modal }, { persist: false });
}

function toggleCollapsed(store, key){
  store.setState((s) => {
    const prev = s.builder?.treeUi || { search: "", collapsed: {}, modal: null };
    const collapsed = prev.collapsed && typeof prev.collapsed === "object" ? prev.collapsed : {};
    const isOn = collapsed[String(key)] === true;
    const next = { ...collapsed };
    if (isOn) delete next[String(key)];
    else next[String(key)] = true;

    return {
      ...s,
      builder: {
        ...s.builder,
        treeUi: { ...prev, collapsed: next },
      },
    };
  });
}

function addDisconnectedPerson(store){
  const s = store.getState();
  const tree = ensureTree(sanitizeTree(s.builder?.tree));
  const nextId = `p${tree.nextId}`;
  const nextTree = addPerson(tree, { name: nextId, sex: "male", alive: true });

  store.setState((prev) => ({
    ...prev,
    builder: {
      ...prev.builder,
      mode: "tree",
      tree: nextTree,
      treeSelectedId: nextId,
    },
  }));
}

function importWizardMerge(tree, wizard){
  // Controlled, additive seed only. No overrides on existing nodes except forcing deceased.alive=false.
  let out = ensureTree(sanitizeTree(tree));
  const w = wizard || {};

  // If tree is basically empty default, allow setting deceased sex from wizard.
  const deceased = out.people[out.deceasedId];
  const isDefaultOnly = Object.keys(out.people || {}).length === 1 && deceased && (deceased.name || "").trim() === "Causante";
  const wSex = (w.deceased_sex === "male" || w.deceased_sex === "female") ? w.deceased_sex : null;
  if (isDefaultOnly && wSex){
    out = updatePerson(out, out.deceasedId, { sex: wSex });
  }

  const dec = out.people[out.deceasedId];

  // Parents
  if (w.parents?.enabled === true){
    const parents = getParents(out, out.deceasedId);
    if (!parents.fatherId && w.parents?.father === true){
      const fatherId = `p${out.nextId}`;
      out = addPerson(out, { name: "Padre", sex: "male", alive: true });
      out = setParents(out, out.deceasedId, { fatherId, motherId: parents.motherId });
    }
    if (!parents.motherId && w.parents?.mother === true){
      const motherId = `p${out.nextId}`;
      out = addPerson(out, { name: "Madre", sex: "female", alive: true });
      const p2 = getParents(out, out.deceasedId);
      out = setParents(out, out.deceasedId, { fatherId: p2.fatherId, motherId });
    }
  }

  // Spouse (single placeholder)
  let spouseId = null;
  if (w.spouse?.enabled === true){
    const spouses = getSpouses(out, out.deceasedId);
    if (spouses.length === 0){
      spouseId = `p${out.nextId}`;
      out = addPerson(out, { name: "Conyuge", sex: oppositeSex(dec.sex), alive: true });
      out = linkSpouses(out, out.deceasedId, spouseId);
    }else{
      spouseId = spouses[0];
    }
  }

  // Children (direct only)
  if (w.descendants?.enabled === true){
    const sons = Math.max(0, Math.trunc(Number(w.descendants?.son ?? 0)));
    const daughters = Math.max(0, Math.trunc(Number(w.descendants?.daughter ?? 0)));

    const fatherId = dec.sex === "male" ? out.deceasedId : (spouseId && out.people[spouseId]?.sex === "male" ? spouseId : null);
    const motherId = dec.sex === "female" ? out.deceasedId : (spouseId && out.people[spouseId]?.sex === "female" ? spouseId : null);

    for (let i = 0; i < sons; i++){
      const childId = `p${out.nextId}`;
      out = addPerson(out, { name: `Hijo ${i + 1}`, sex: "male", alive: true });
      out = setParents(out, childId, { fatherId, motherId });
    }
    for (let i = 0; i < daughters; i++){
      const childId = `p${out.nextId}`;
      out = addPerson(out, { name: `Hija ${i + 1}`, sex: "female", alive: true });
      out = setParents(out, childId, { fatherId, motherId });
    }
  }

  // Ensure deceased always dead
  out = updatePerson(out, out.deceasedId, { alive: false });

  return out;
}

export function importWizardToTree(store){
  const s = store.getState();
  const wizard = s.wizard || {};
  const current = ensureTree(sanitizeTree(s.builder?.tree));
  const merged = importWizardMerge(current, wizard);
  const wizardHash = computeWizardHash(wizard);

  store.setState((prev) => ({
    ...prev,
    builder: {
      ...prev.builder,
      mode: "tree",
      tree: merged,
      treeSelectedId: merged.deceasedId,
      fromWizardApplied: true,
      wizardHashApplied: wizardHash,
    },
  }));
}

export function applyWizardSyncTree(store){
  // Kept for compatibility with existing app.js action handler.
  return importWizardToTree(store);
}

export function wireBuilderTree(store){
  const importBtn = document.getElementById("builder-tree-import-wizard");
  if (importBtn){
    importBtn.addEventListener("click", () => {
      openModal(store, {
        title: "Importar del wizard",
        body: "Esto solo agrega nodos faltantes en el tree. No sobreescribe ediciones existentes.",
        confirmAction: "builder-tree-import-wizard",
        confirmLabel: "Importar",
      });
    });
  }

  const resetBtn = document.getElementById("builder-tree-reset");
  if (resetBtn){
    resetBtn.addEventListener("click", () => {
      openModal(store, {
        title: "Reset tree",
        body: "Esto borra el arbol actual del builder (no toca el core).",
        confirmAction: "builder-tree-reset",
        confirmLabel: "Reset",
      });
    });
  }

  const searchInput = document.getElementById("builder-tree-search");
  if (searchInput){
    let t = null;
    searchInput.addEventListener("input", () => {
      const value = searchInput.value;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        setTreeUi(store, { search: value }, { persist: false });
      }, 120);
    });
  }

  const root = document.getElementById("builder-tree-root");
  if (!root) return;

  root.addEventListener("click", (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest("[data-tree-action]") : null;
    if (!btn) return;

    const raw = btn.getAttribute("data-tree-action") || "";
    const parts = raw.split("|");
    const action = parts[0] || "";

    if (action === "toggle-level"){
      toggleCollapsed(store, parts[1] || "");
      return;
    }

    if (action === "add-disconnected"){
      addDisconnectedPerson(store);
      return;
    }

    if (action === "open-modal"){
      const kind = parts[1] || "";
      if (kind === "edit-person"){
        const personId = parts[2] || "";
        if (personId) openTreeModal(store, { type: "edit-person", personId });
        return;
      }
      if (kind === "add-child"){
        const parentId = parts[2] || "";
        const sex = parts[3] || "male";
        if (parentId) openTreeModal(store, { type: "add-child", parentId, sex });
        return;
      }
      if (kind === "add-spouse"){
        const personId = parts[2] || "";
        if (personId) openTreeModal(store, { type: "add-spouse", personId });
        return;
      }
      return;
    }

    if (action === "set-deceased"){
      const id = parts[1] || "";
      if (!id) return;
      store.setState((prev) => {
        const tree = ensureTree(sanitizeTree(prev.builder?.tree));
        if (!tree.people[id]) return prev;
        let out = { ...tree, deceasedId: id };
        out = updatePerson(out, id, { alive: false });
        return {
          ...prev,
          builder: {
            ...prev.builder,
            mode: "tree",
            tree: out,
            treeSelectedId: id,
          },
        };
      });
      return;
    }

    if (action === "modal-cancel"){
      closeTreeModal(store);
      return;
    }

    if (action === "modal-save-edit"){
      const id = parts[1] || "";
      if (!id) return;

      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder?.tree));
      if (!tree.people[id]) return;

      const nameEl = document.getElementById("tree-modal-name");
      const sexEl = document.getElementById("tree-modal-sex");
      const aliveEl = document.getElementById("tree-modal-alive");
      const fatherEl = document.getElementById("tree-modal-father");
      const motherEl = document.getElementById("tree-modal-mother");

      const name = nameEl ? String(nameEl.value || "").trim() : "";
      const sex = sexEl ? String(sexEl.value || "male") : "male";

      let alive = aliveEl ? String(aliveEl.value || "true") === "true" : true;
      if (id === tree.deceasedId) alive = false;

      const fatherId = fatherEl ? String(fatherEl.value || "") : "";
      const motherId = motherEl ? String(motherEl.value || "") : "";

      let out = tree;
      out = updatePerson(out, id, { name, sex, alive });
      out = setParents(out, id, {
        fatherId: fatherId || null,
        motherId: motherId || null,
      });

      store.setState((prev) => ({
        ...prev,
        builder: {
          ...prev.builder,
          mode: "tree",
          tree: out,
          treeSelectedId: id,
          treeUi: { ...(prev.builder?.treeUi || {}), modal: null },
        },
      }));
      return;
    }

    if (action === "modal-add-child-create"){
      const parentId = parts[1] || "";
      const sex = parts[2] || "male";
      if (!parentId) return;

      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder?.tree));
      if (!tree.people[parentId]) return;

      const nameEl = document.getElementById("tree-modal-new-child-name");
      const name = nameEl ? String(nameEl.value || "").trim() : "";

      const childId = `p${tree.nextId}`;
      let out = addPerson(tree, { name: name || childId, sex, alive: true });

      const parent = out.people[parentId];
      const spouses = getSpouses(out, parentId);

      let fatherId = null;
      let motherId = null;

      if (parent.sex === "male"){
        fatherId = parentId;
        const spouse = spouses.map((id) => out.people[id]).find((x) => x && x.sex === "female");
        motherId = spouse ? spouse.id : null;
      }else{
        motherId = parentId;
        const spouse = spouses.map((id) => out.people[id]).find((x) => x && x.sex === "male");
        fatherId = spouse ? spouse.id : null;
      }

      out = setParents(out, childId, { fatherId, motherId });

      store.setState((prev) => ({
        ...prev,
        builder: {
          ...prev.builder,
          mode: "tree",
          tree: out,
          treeSelectedId: childId,
          treeUi: { ...(prev.builder?.treeUi || {}), modal: null },
        },
      }));
      return;
    }

    if (action === "modal-add-child-link"){
      const parentId = parts[1] || "";
      if (!parentId) return;

      const existingEl = document.getElementById("tree-modal-existing-child");
      const childId = existingEl ? String(existingEl.value || "") : "";
      if (!childId) return;

      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder?.tree));
      if (!tree.people[parentId] || !tree.people[childId]) return;

      const parent = tree.people[parentId];
      const currentParents = getParents(tree, childId);

      let fatherId = currentParents.fatherId;
      let motherId = currentParents.motherId;

      if (parent.sex === "male") fatherId = parentId;
      else motherId = parentId;

      const out = setParents(tree, childId, { fatherId, motherId });

      store.setState((prev) => ({
        ...prev,
        builder: {
          ...prev.builder,
          mode: "tree",
          tree: out,
          treeSelectedId: childId,
          treeUi: { ...(prev.builder?.treeUi || {}), modal: null },
        },
      }));
      return;
    }

    if (action === "modal-add-spouse-create"){
      const personId = parts[1] || "";
      const sex = parts[2] || "female";
      if (!personId) return;

      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder?.tree));
      if (!tree.people[personId]) return;

      const nameEl = document.getElementById("tree-modal-new-spouse-name");
      const name = nameEl ? String(nameEl.value || "").trim() : "";

      const spouseId = `p${tree.nextId}`;
      let out = addPerson(tree, { name: name || spouseId, sex, alive: true });
      out = linkSpouses(out, personId, spouseId);

      store.setState((prev) => ({
        ...prev,
        builder: {
          ...prev.builder,
          mode: "tree",
          tree: out,
          treeSelectedId: spouseId,
          treeUi: { ...(prev.builder?.treeUi || {}), modal: null },
        },
      }));
      return;
    }

    if (action === "modal-add-spouse-link"){
      const personId = parts[1] || "";
      if (!personId) return;

      const existingEl = document.getElementById("tree-modal-existing-spouse");
      const spouseId = existingEl ? String(existingEl.value || "") : "";
      if (!spouseId) return;

      const s = store.getState();
      const tree = ensureTree(sanitizeTree(s.builder?.tree));
      if (!tree.people[personId] || !tree.people[spouseId]) return;

      const out = linkSpouses(tree, personId, spouseId);

      store.setState((prev) => ({
        ...prev,
        builder: {
          ...prev.builder,
          mode: "tree",
          tree: out,
          treeSelectedId: spouseId,
          treeUi: { ...(prev.builder?.treeUi || {}), modal: null },
        },
      }));
      return;
    }
  });
}
