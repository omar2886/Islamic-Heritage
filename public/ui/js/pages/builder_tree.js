import { closeModal, openModal } from "../ui/modal.js";
import { runCalc } from "../actions/calc.js";
import {
  sanitizeTree,
  ensureTree,
  addPerson,
  updatePerson,
  getParents,
  setParents,
  getChildren,
  getSpouses,
  linkSpouses,
  unlinkSpouses,
} from "../domain/familyTree.js";
import { deriveHeirsFromTree } from "../domain/treeRoles.js";

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function normStr(s){
  return String(s || "").trim().toLowerCase();
}

function safeSex(sex){
  if (sex === "male" || sex === "female") return sex;
  return null;
}

function computeWizardHash(wizard){
  const w = wizard && typeof wizard === "object" ? wizard : {};
  const payload = {
    deceased_sex: w.deceased_sex || null,
    spouse: {
      enabled: w.spouse?.enabled === true,
      wives_count: Number(w.spouse?.wives_count ?? 0),
      husband_present: w.spouse?.husband_present === true,
    },
    parents: {
      father: w.parents?.father === true,
      mother: w.parents?.mother === true,
    },
    descendants: {
      son: Number(w.descendants?.son ?? 0),
      daughter: Number(w.descendants?.daughter ?? 0),
      sons_son: Number(w.descendants?.sons_son ?? 0),
      sons_daughter: Number(w.descendants?.sons_daughter ?? 0),
    },
  };
  return JSON.stringify(payload);
}

function getTreeUi(builder){
  const ui = builder?.treeUi || {};
  return {
    search: typeof ui.search === "string" ? ui.search : "",
    collapsedLevels: (ui.collapsedLevels && typeof ui.collapsedLevels === "object") ? ui.collapsedLevels : {},
    showDisconnected: ui.showDisconnected !== false,
    peopleListCollapsed: ui.peopleListCollapsed === true,
    modal: ui.modal || null,
    wizardPendingImport: ui.wizardPendingImport === true,
    wizardPendingFrom: typeof ui.wizardPendingFrom === "string" ? ui.wizardPendingFrom : null,
  };
}

function setTreeUi(store, patch, meta = { persist: true }){
  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      treeUi: { ...(s.builder?.treeUi || {}), ...patch },
    },
  }), meta);
}

function selectPerson(store, id){
  store.setState((s) => ({
    ...s,
    builder: { ...s.builder, treeSelectedId: id },
  }), { persist: true });
}

function setDeceased(store, id){
  store.setState((s) => {
    const tree = ensureTree(sanitizeTree(s.builder?.tree), null);
    if (!tree.people[id]) return s;
    const next = { ...tree, deceasedId: id };
    return {
      ...s,
      builder: {
        ...s.builder,
        tree: next,
        treeSelectedId: id,
      },
    };
  }, { persist: true });
}

function makeGenMap(tree){
  const t = ensureTree(sanitizeTree(tree), null);
  const gen = new Map();
  const q = [{ id: t.deceasedId, level: 0 }];

  gen.set(t.deceasedId, 0);

  while (q.length){
    const cur = q.shift();
    const id = cur.id;
    const level = cur.level;

    const parents = getParents(t, id);
    if (parents.fatherId && !gen.has(parents.fatherId)){
      gen.set(parents.fatherId, level - 1);
      q.push({ id: parents.fatherId, level: level - 1 });
    }
    if (parents.motherId && !gen.has(parents.motherId)){
      gen.set(parents.motherId, level - 1);
      q.push({ id: parents.motherId, level: level - 1 });
    }

    const children = getChildren(t, id);
    for (const childId of children){
      if (!gen.has(childId)){
        gen.set(childId, level + 1);
        q.push({ id: childId, level: level + 1 });
      }
    }

    const spouses = getSpouses(t, id);
    for (const spId of spouses){
      if (!gen.has(spId)){
        gen.set(spId, level);
        q.push({ id: spId, level });
      }
    }
  }

  return gen;
}

function groupByLevel(tree, genMap, q){
  const t = ensureTree(sanitizeTree(tree), null);
  const out = new Map();

  for (const [id, level] of genMap.entries()){
    const p = t.people[id] || {};
    const row = { id, ...p };
    if (!matchSearch(row, q)) continue;

    if (!out.has(level)) out.set(level, []);
    out.get(level).push(row);
  }

  for (const [level, list] of out.entries()){
    list.sort((a, b) => normStr(a.name || "").localeCompare(normStr(b.name || "")));
    out.set(level, list);
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
          <button class="btn btn-small" type="button" data-tree-action="add-parent" data-person-id="${escapeHtml(id)}">+ padre/madre</button>
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

  const pending = ui.wizardPendingImport === true;

  const pendingNotice = pending ? `
    <div class="notice warn" style="margin:0;">
      <div style="font-weight:800; margin-bottom:6px;">Import pendiente</div>
      <div class="muted" style="font-size:13px; line-height:1.4;">
        Vienes del Wizard. Importa ahora para crear en el árbol los padres, cónyuge y descendencia indicados.
      </div>
      <div class="row" style="gap:8px; margin-top:10px; flex-wrap:wrap;">
        <button class="btn" type="button" data-tree-action="confirm-import-wizard">Revisar e importar</button>
        <button class="btn" type="button" data-tree-action="dismiss-import-wizard">Descartar</button>
      </div>
    </div>
  ` : "";

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
          <button class="btn" type="button" data-tree-action="run-calc">Calcular</button>
        </div>
      </div>

      ${pendingNotice}

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

  const unmappedHtml = unmapped.length
    ? `
      <div class="notice" style="margin:0;">
        <div style="font-weight:700; margin-bottom:6px;">Unmapped/unsupported</div>
        <div class="muted" style="font-size:12px; margin-bottom:6px;">
          Personas vivas presentes en tree pero no mapeadas a roles soportados por la derivación actual.
        </div>
        <ul style="margin:0; padding-left:18px;">
          ${unmapped.map((u) => `<li>${escapeHtml(u.name || u.id)} (${escapeHtml(u.id)})</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  const rows = Object.entries(roles).map(([role, info]) => {
    const count = Number(info?.count) || 0;
    const list = Array.isArray(info?.ids) ? info.ids : [];
    const evid = list.length ? list.map((id) => `<div class="muted" style="font-size:12px;">${escapeHtml(id)}</div>`).join("") : "";
    return `
      <div class="card card-pad stack" style="gap:6px;">
        <div class="row" style="justify-content:space-between; gap:8px;">
          <div style="font-weight:800;">${escapeHtml(role)}</div>
          <span class="badge">${escapeHtml(String(count))}</span>
        </div>
        ${evid}
      </div>
    `;
  }).join("");

  return `
    <div class="card card-pad stack" style="gap:12px;">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="stack" style="gap:2px;">
          <div style="font-weight:800;">Derivación (tree -> roles)</div>
          <div class="muted" style="font-size:12px;">Mapeados: ${escapeHtml(String(mappedCount))}</div>
        </div>
      </div>
      ${warningHtml}
      ${unmappedHtml}
      <div class="stack" style="gap:8px;">
        ${rows || `<div class="muted">Sin roles derivados todavía.</div>`}
      </div>
    </div>
  `;
}

export function renderBuilderTree(state){
  const builder = state?.builder || {};
  const ui = getTreeUi(builder);

  const tree = ensureTree(sanitizeTree(builder.tree), null);
  const selectedId = builder.treeSelectedId || tree.deceasedId;

  const q = normStr(ui.search);
  const genMap = makeGenMap(tree);
  const grouped = groupByLevel(tree, genMap, q);

  const levels = Array.from(grouped.keys()).sort((a, b) => a - b);
  const levelsHtml = levels.map((level) => renderLevel(tree, level, grouped.get(level) || [], ui, selectedId)).join("");

  const disconnectedHtml = renderDisconnected(tree, genMap, ui, selectedId, q);
  const derivedHtml = renderDerivedPanel(state, tree);

  return `
    <div class="stack" style="gap:12px;">
      ${renderToolbar(state, tree, ui)}
      ${renderSearch(ui)}
      <div class="grid2" style="align-items:start;">
        <div class="stack" style="gap:12px;">
          ${levelsHtml}
          ${disconnectedHtml}
        </div>
        <div class="stack" style="gap:12px;">
          ${derivedHtml}
        </div>
      </div>
      ${renderInlineModal(state, tree)}
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
        treeUi: {
          ...(builder.treeUi || {}),
          wizardPendingImport: false,
          wizardPendingFrom: null,
        },
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

/* ---------------------------
   Modal inline (no global system)
--------------------------- */

function renderInlineModal(state, tree){
  const ui = getTreeUi(state?.builder || {});
  const modal = ui.modal;
  if (!modal) return "";

  const type = modal.type;

  if (type === "confirm-import"){
    const wizard = state?.wizard || {};
    const summary = summarizeWizard(wizard);
    return `
      <div class="modal-backdrop">
        <div class="modal">
          <div class="stack" style="gap:10px;">
            <div style="font-weight:900;">Importar wizard al árbol</div>
            <div class="muted" style="font-size:13px; line-height:1.45;">
              Esto creará nodos en el árbol. No toca el core ni fuerza atributos desde wizard: solo seed inicial.
            </div>
            <pre class="codebox" style="max-height:220px; overflow:auto;">${escapeHtml(summary)}</pre>
            <div class="row" style="gap:8px; justify-content:flex-end; flex-wrap:wrap;">
              <button class="btn" type="button" data-tree-action="close-modal">Cancelar</button>
              <button class="btn" type="button" data-tree-action="do-import-wizard">Importar</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const title =
    type === "edit" ? "Editar persona" :
    type === "add-spouse" ? "Añadir cónyuge" :
    type === "add-child" ? "Añadir hijo/a" :
    type === "add-parent" ? "Añadir padre/madre" :
    "Nueva persona";

  const fields = modal.fields || {};
  const name = String(fields.name || "");
  const sex = String(fields.sex || "");
  const alive = fields.alive === true;

  let extra = "";
  if (type === "add-parent"){
    extra = renderAddParentExtra(tree, modal);
  } else if (type === "add-spouse"){
    extra = `<div class="muted" style="font-size:12px;">Se creará una persona y se enlazará como cónyuge.</div>`;
  } else if (type === "add-child"){
    extra = `<div class="muted" style="font-size:12px;">Se creará una persona y se enlazará como hijo/a.</div>`;
  }

  return `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="stack" style="gap:12px;">
          <div style="font-weight:900;">${escapeHtml(title)}</div>

          ${extra}

          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" type="text" data-modal-field="name" value="${escapeHtml(name)}" />
          </label>

          <div class="row" style="gap:10px; flex-wrap:wrap;">
            <label class="field" style="flex:1; min-width:180px;">
              <span class="label">Sexo</span>
              <select class="input" data-modal-field="sex">
                <option value="" ${sex === "" ? "selected" : ""}>Sin especificar</option>
                <option value="male" ${sex === "male" ? "selected" : ""}>Male</option>
                <option value="female" ${sex === "female" ? "selected" : ""}>Female</option>
              </select>
            </label>

            <label class="field" style="width:180px;">
              <span class="label">Vivo</span>
              <select class="input" data-modal-field="alive">
                <option value="true" ${alive ? "selected" : ""}>Sí</option>
                <option value="false" ${!alive ? "selected" : ""}>No</option>
              </select>
            </label>
          </div>

          <div class="row" style="gap:8px; justify-content:flex-end; flex-wrap:wrap;">
            <button class="btn" type="button" data-tree-action="close-modal">Cancelar</button>
            <button class="btn" type="button" data-tree-action="save-modal">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function summarizeWizard(wizard){
  const w = wizard || {};
  const sex = w.deceased_sex || "null";
  const parents = w.parents || {};
  const spouse = w.spouse || {};
  const desc = w.descendants || {};
  const lines = [];
  lines.push(`deceased_sex: ${sex}`);
  lines.push(`parents: father=${parents.father === true}, mother=${parents.mother === true}`);
  lines.push(`spouse: enabled=${spouse.enabled === true}, wives_count=${Number(spouse.wives_count || 0)}, husband_present=${spouse.husband_present === true}`);
  lines.push(`descendants: son=${Number(desc.son || 0)}, daughter=${Number(desc.daughter || 0)}, sons_son=${Number(desc.sons_son || 0)}, sons_daughter=${Number(desc.sons_daughter || 0)}`);
  lines.push(`estate_value: ${(w.estate_value || "").toString().trim() || "empty"}`);
  lines.push(`currency: ${(w.currency || "MAD").toString().trim()}`);
  return lines.join("\n");
}

function renderAddParentExtra(tree, modal){
  const t = ensureTree(sanitizeTree(tree), null);
  const childId = modal.childId;
  const kind = modal.kind === "mother" ? "mother" : "father";
  const requiredSex = kind === "father" ? "male" : "female";
  const pRow = getParents(t, childId);
  const already = kind === "father" ? pRow.fatherId : pRow.motherId;

  const candidates = Object.values(t.people || {})
    .filter((p) => p && p.id && p.id !== childId)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name || p.id),
      sex: safeSex(p.sex),
      alive: p.alive === true,
    }))
    .sort((a, b) => normStr(a.name).localeCompare(normStr(b.name)));

  const options = [`<option value="">(crear nuevo)</option>`].concat(
    candidates.map((c) => {
      const disabled = c.sex && c.sex !== requiredSex ? "disabled" : "";
      return `<option value="${escapeHtml(c.id)}" ${modal.existingParentId === c.id ? "selected" : ""} ${disabled}>${escapeHtml(c.name)} [${escapeHtml(c.id)}] ${c.sex ? `(${c.sex})` : ""}</option>`;
    })
  ).join("");

  const notice = already ? `
    <div class="notice warn" style="margin:0;">
      Ya existe ${kind === "father" ? "padre" : "madre"} asignado: ${escapeHtml(already)}. Guardar reemplazará ese vínculo.
    </div>
  ` : "";

  return `
    <div class="stack" style="gap:10px;">
      <div class="muted" style="font-size:12px;">
        Padre o madre para: <b>${escapeHtml(childId)}</b> (se exige sexo ${escapeHtml(requiredSex)} si el nodo ya tiene sexo definido).
      </div>
      ${notice}
      <label class="field">
        <span class="label">Reutilizar persona existente</span>
        <select class="input" data-modal-field="existingParentId">
          ${options}
        </select>
      </label>
      <div class="muted" style="font-size:12px;">
        Si eliges existente, se reutiliza ese nodo (evita duplicados). Si dejas vacío, se creará uno nuevo con los campos de arriba.
      </div>
    </div>
  `;
}

/* ---------------------------
   Modals state + commits
--------------------------- */

function openCreateModal(store){
  setTreeUi(store, { modal: { type: "create", fields: { name: "", sex: "", alive: true } } }, { persist: false });
}

function openEditModal(store, personId){
  const st = store.getState();
  const tree = ensureTree(sanitizeTree(st.builder?.tree), null);
  const p = tree.people[personId];
  if (!p) return;
  setTreeUi(store, { modal: { type: "edit", personId, fields: { name: p.name || "", sex: p.sex || "", alive: p.alive === true } } }, { persist: false });
}

function openAddSpouseModal(store, personId){
  setTreeUi(store, { modal: { type: "add-spouse", personId, fields: { name: "", sex: "", alive: true } } }, { persist: false });
}

function openAddChildModal(store, parentId){
  setTreeUi(store, { modal: { type: "add-child", parentId, fields: { name: "", sex: "", alive: true } } }, { persist: false });
}

function openAddParentModal(store, childId){
  // por defecto: padre (male)
  setTreeUi(store, {
    modal: {
      type: "add-parent",
      childId,
      kind: "father", // father | mother
      existingParentId: "",
      fields: { name: "", sex: "male", alive: true },
    },
  }, { persist: false });
}

function commitCreatePerson(store){
  const st = store.getState();
  const ui = getTreeUi(st.builder || {});
  const modal = ui.modal;
  if (!modal || modal.type !== "create") return;

  store.setState((s) => {
    const tree0 = ensureTree(sanitizeTree(s.builder?.tree), null);
    const r = addPerson(tree0, modal.fields || {});
    return {
      ...s,
      builder: {
        ...s.builder,
        tree: r.tree,
        treeSelectedId: r.personId,
        treeUi: { ...(s.builder?.treeUi || {}), modal: null },
      },
    };
  }, { persist: true });
}

function commitSaveEdit(store){
  const st = store.getState();
  const ui = getTreeUi(st.builder || {});
  const modal = ui.modal;
  if (!modal || modal.type !== "edit" || !modal.personId) return;

  store.setState((s) => {
    const tree0 = ensureTree(sanitizeTree(s.builder?.tree), null);
    const tree1 = updatePerson(tree0, modal.personId, modal.fields || {});
    return {
      ...s,
      builder: {
        ...s.builder,
        tree: tree1,
        treeUi: { ...(s.builder?.treeUi || {}), modal: null },
      },
    };
  }, { persist: true });
}

function commitAddSpouse(store){
  const st = store.getState();
  const ui = getTreeUi(st.builder || {});
  const modal = ui.modal;
  if (!modal || modal.type !== "add-spouse" || !modal.personId) return;

  store.setState((s) => {
    const tree0 = ensureTree(sanitizeTree(s.builder?.tree), null);
    const r = addPerson(tree0, modal.fields || {});
    const tree1 = linkSpouses(r.tree, modal.personId, r.personId);
    return {
      ...s,
      builder: {
        ...s.builder,
        tree: tree1,
        treeUi: { ...(s.builder?.treeUi || {}), modal: null },
      },
    };
  }, { persist: true });
}

function commitAddChild(store){
  const st = store.getState();
  const ui = getTreeUi(st.builder || {});
  const modal = ui.modal;
  if (!modal || modal.type !== "add-child" || !modal.parentId) return;

  store.setState((s) => {
    let tree0 = ensureTree(sanitizeTree(s.builder?.tree), null);
    const r = addPerson(tree0, modal.fields || {});
    tree0 = r.tree;

    const parentId = modal.parentId;
    const parent = tree0.people[parentId];
    const childId = r.personId;

    const existing = getParents(tree0, childId);
    const parentRole = parent?.sex === "female" ? "mother" : "father";
    const next = { fatherId: existing.fatherId || null, motherId: existing.motherId || null };
    if (parentRole === "father") next.fatherId = parentId;
    else next.motherId = parentId;

    const tree1 = setParents(tree0, childId, next);

    return {
      ...s,
      builder: {
        ...s.builder,
        tree: tree1,
        treeUi: { ...(s.builder?.treeUi || {}), modal: null },
      },
    };
  }, { persist: true });
}

function isAncestor(tree, possibleAncestorId, nodeId){
  const t = ensureTree(sanitizeTree(tree), null);
  const seen = new Set();
  let cur = String(nodeId);

  while (cur){
    if (seen.has(cur)) return false;
    seen.add(cur);

    if (cur === String(possibleAncestorId)) return true;

    const p = getParents(t, cur);
    // subimos por padre y madre
    if (p.fatherId) {
      cur = p.fatherId;
      continue;
    }
    if (p.motherId) {
      cur = p.motherId;
      continue;
    }
    break;
  }
  return false;
}

function wouldCreateCycle(tree, childId, parentId){
  // Si child es ancestro del parent, al poner parent como padre/madre de child creamos ciclo
  return isAncestor(tree, childId, parentId);
}

function commitAddParent(store){
  const st = store.getState();
  const ui = getTreeUi(st.builder || {});
  const modal = ui.modal;
  if (!modal || modal.type !== "add-parent" || !modal.childId) return;

  store.setState((s) => {
    let tree0 = ensureTree(sanitizeTree(s.builder?.tree), null);
    const childId = modal.childId;
    const kind = modal.kind === "mother" ? "mother" : "father";
    const requiredSex = kind === "father" ? "male" : "female";

    let parentId = String(modal.existingParentId || "").trim();
    if (parentId){
      if (!tree0.people[parentId]) parentId = "";
    }

    if (!parentId){
      const fields = { ...(modal.fields || {}) };
      // fuerza sexo requerido al crear
      fields.sex = requiredSex;
      const r = addPerson(tree0, fields);
      tree0 = r.tree;
      parentId = r.personId;
    } else {
      // si reusamos, valida sexo si está definido
      const p = tree0.people[parentId];
      const pSex = safeSex(p?.sex);
      if (pSex && pSex !== requiredSex){
        return {
          ...s,
          ui: {
            ...s.ui,
            toasts: [{ type: "error", message: "Sexo del nodo reutilizado no coincide con padre/madre requerido." }],
          },
        };
      }
      // anti-ciclo
      if (wouldCreateCycle(tree0, childId, parentId)){
        return {
          ...s,
          ui: {
            ...s.ui,
            toasts: [{ type: "error", message: "Operación rechazada: crearía un ciclo en el árbol (parent ya es descendiente)." }],
          },
        };
      }
    }

    const prev = getParents(tree0, childId);
    const next = { fatherId: prev.fatherId || null, motherId: prev.motherId || null };
    if (kind === "father") next.fatherId = parentId;
    else next.motherId = parentId;

    const tree1 = setParents(tree0, childId, next);

    return {
      ...s,
      builder: {
        ...s.builder,
        tree: tree1,
        treeUi: { ...(s.builder?.treeUi || {}), modal: null },
      },
    };
  }, { persist: true });
}

/* ---------------------------
   Events wiring
--------------------------- */

export function wireBuilderTree(store){
  bindBuilderTreeEvents(store);

  // Auto abrir confirm si vienes del wizard (determinista)
  const st = store.getState();
  const ui = getTreeUi(st.builder || {});
  if (ui.wizardPendingImport === true){
    setTreeUi(store, { modal: { type: "confirm-import" } }, { persist: false });
  }
}

function bindBuilderTreeEvents(store){
  const root = document.getElementById("builder-tree-root");
  // idempotente
  if (root && root.dataset.builderTreeWired === "1") return;
  if (root) root.dataset.builderTreeWired = "1";

  // listeners sobre app container
  const app = document.getElementById("app");
  if (!app) return;

  app.addEventListener("input", (e) => {
    const t = e.target;
    if (!t || !(t instanceof HTMLElement)) return;

    if (t.matches("[data-modal-field]")){
      const key = t.getAttribute("data-modal-field");
      if (!key) return;
      const value = t.value;

      setTreeUi(store, {
        modal: patchModalField(store.getState(), key, value),
      }, { persist: false });

      return;
    }
  });

  app.addEventListener("change", (e) => {
    const t = e.target;
    if (!t || !(t instanceof HTMLElement)) return;

    if (t.id === "tree-show-disconnected"){
      setTreeUi(store, { showDisconnected: Boolean(t.checked) }, { persist: true });
      return;
    }

    if (t.id === "tree-search"){
      setTreeUi(store, { search: String(t.value || "").trimStart() }, { persist: true });
      return;
    }

    if (t.matches("[data-modal-field]")){
      const key = t.getAttribute("data-modal-field");
      if (!key) return;
      const value = t.value;

      setTreeUi(store, {
        modal: patchModalField(store.getState(), key, value),
      }, { persist: false });
    }
  });

  app.addEventListener("click", (e) => {
    const btn = e.target?.closest("[data-tree-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-tree-action");
    const personId = btn.getAttribute("data-person-id");
    const level = btn.getAttribute("data-level");

    if (action === "go-results"){
      location.hash = "#/results";
      return;
    }

    if (action === "run-calc"){
      runCalc(store);
      location.hash = "#/results";
      return;
    }

    if (action === "toggle-level" && level !== null){
      store.setState((s) => {
        const ui0 = getTreeUi(s.builder || {});
        const k = String(level);
        const isCollapsed = ui0.collapsedLevels[k] === true;
        const next = { ...(s.builder?.treeUi?.collapsedLevels || {}) };
        next[k] = !isCollapsed;
        return {
          ...s,
          builder: {
            ...s.builder,
            treeUi: { ...ui0, collapsedLevels: next },
          },
        };
      }, { persist: true });
      return;
    }

    if (action === "import-wizard"){
      importWizardToTree(store);
      return;
    }

    if (action === "confirm-import-wizard"){
      setTreeUi(store, { modal: { type: "confirm-import" } }, { persist: false });
      return;
    }

    if (action === "dismiss-import-wizard"){
      setTreeUi(store, { wizardPendingImport: false, wizardPendingFrom: null }, { persist: true });
      return;
    }

    if (action === "do-import-wizard"){
      importWizardToTree(store);
      setTreeUi(store, { modal: null }, { persist: false });
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

    if (action === "add-parent" && personId){
      openAddParentModal(store, personId);
      return;
    }

    if (action === "close-modal"){
      setTreeUi(store, { modal: null }, { persist: false });
      return;
    }

    if (action === "save-modal"){
      const st = store.getState();
      const ui0 = getTreeUi(st.builder || {});
      const modal = ui0.modal;
      if (!modal) return;

      if (modal.type === "create") commitCreatePerson(store);
      else if (modal.type === "edit") commitSaveEdit(store);
      else if (modal.type === "add-spouse") commitAddSpouse(store);
      else if (modal.type === "add-child") commitAddChild(store);
      else if (modal.type === "add-parent") commitAddParent(store);

      return;
    }
  });

  // Search input wiring
  const searchEl = document.getElementById("tree-search");
  if (searchEl){
    searchEl.addEventListener("input", (e2) => {
      const value = normStr(e2.target?.value).trimStart();
      setTreeUi(store, { search: value }, { persist: true });
    });
  }
}

function patchModalField(state, key, value){
  const ui = getTreeUi(state?.builder || {});
  const modal = ui.modal;
  if (!modal) return null;

  const next = { ...modal };

  if (key === "alive"){
    const alive = String(value) === "true";
    next.fields = { ...(modal.fields || {}), alive };
    return next;
  }

  if (key === "sex"){
    const v = String(value || "");
    next.fields = { ...(modal.fields || {}), sex: v };
    // si modal add-parent, sincroniza kind si el usuario lo cambia a female/male en creación
    if (modal.type === "add-parent"){
      if (v === "female") next.kind = "mother";
      if (v === "male") next.kind = "father";
    }
    return next;
  }

  if (key === "name"){
    next.fields = { ...(modal.fields || {}), name: String(value || "") };
    return next;
  }

  if (key === "existingParentId"){
    next.existingParentId = String(value || "");
    return next;
  }

  return next;
}
