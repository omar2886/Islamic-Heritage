import { ROLE_GROUPS, labelForRole } from "../domain/roles.js";
import { pushToast } from "../ui/toast.js";

const ROLE_LIMITS = {
  husband: 1,
  wife: 4,
  father: 1,
  mother: 1,
  paternal_grandfather: 1,
  paternal_grandmother: 1,
  maternal_grandmother: 1,
  paternal_great_grandmother: 1,
  maternal_great_grandmother: 1,
};

function clamp(value, max = 100){
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const safe = Math.trunc(num);
  return Math.min(max, Math.max(0, safe));
}

function maxForRole(role){
  return ROLE_LIMITS[role] ?? 100;
}

function buildPayloadPreview(builder){
  if (!builder.payloadPreview) return "<pre class=\"codebox\">{ \"heirs\": [] }</pre>";
  const json = JSON.stringify(builder.payloadPreview, null, 2);
  return `<pre class="codebox">${escapeHtml(json)}</pre>`;
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
      sons_son_count: Number(safeWizard.descendants?.sons_son ?? 0),
      sons_daughter_count: Number(safeWizard.descendants?.sons_daughter ?? 0),
    },
    parents: {
      enabled: safeWizard.parents?.enabled === true,
      father_alive: safeWizard.parents?.father === true,
      mother_alive: safeWizard.parents?.mother === true,
    },
  };
  return JSON.stringify(payload);
}

function allocPersonId(people){
  // Determinista: P1, P2, P3...
  let i = 1;
  while (people && people["P" + i]) i++;
  return "P" + i;
}

function ensurePersonShape(p, id){
  const base = {
    id,
    label: "",
    sex: null,      // "male" | "female" | null
    alive: true,
    fatherId: null,
    motherId: null,
    spouseIds: [],
  };
  return { ...base, ...(p || {}), id };
}

function ensureFamilyShape(family){
  const f = family && typeof family === "object" ? family : {};
  const people = (f.people && typeof f.people === "object") ? { ...f.people } : {};
  const order = Array.isArray(f.order) ? [...f.order] : [];
  const next = Number.isFinite(Number(f.nextSeq)) ? Number(f.nextSeq) : 2;
  // Asegura P1 siempre
  people.P1 = ensurePersonShape(people.P1, "P1");
  if (!order.includes("P1")) order.push("P1");
  let maxId = 1;
  for (const id of Object.keys(people)){
    const match = /^P(\d+)$/.exec(id);
    if (match){
      const num = Number(match[1] || "0");
      if (Number.isFinite(num)) maxId = Math.max(maxId, num);
    }
  }
  const nextSeq = Math.max(next, maxId + 1);
  return { ...f, people, order, nextSeq };
}

function bumpNextSeq(family, id){
  const num = Number(String(id || "").replace(/^P/i, ""));
  if (!Number.isFinite(num)) return;
  const current = Number.isFinite(Number(family.nextSeq)) ? Number(family.nextSeq) : 2;
  family.nextSeq = Math.max(current, num + 1);
}

function hasAnyChildOf(family, parentId){
  const people = family?.people || {};
  for (const id in people){
    const p = people[id];
    if (!p) continue;
    if (p.fatherId === parentId || p.motherId === parentId) return true;
  }
  return false;
}

function uniqueValidSpouseId(family, personId){
  const people = family?.people || {};
  const p = people[personId];
  if (!p) return null;
  const ids = Array.isArray(p.spouseIds) ? p.spouseIds.filter((x) => !!people[x]) : [];
  return ids.length === 1 ? ids[0] : null;
}

function linkSpouses(family, aId, bId){
  const people = family.people;
  const a = ensurePersonShape(people[aId], aId);
  const b = ensurePersonShape(people[bId], bId);

  const aSp = new Set(Array.isArray(a.spouseIds) ? a.spouseIds : []);
  const bSp = new Set(Array.isArray(b.spouseIds) ? b.spouseIds : []);

  aSp.add(bId);
  bSp.add(aId);

  people[aId] = { ...a, spouseIds: Array.from(aSp) };
  people[bId] = { ...b, spouseIds: Array.from(bSp) };
}

function unlinkSpouses(family, aId, bId){
  const people = family.people;
  const a = people[aId];
  const b = people[bId];
  if (!a || !b) return;

  const aSp = new Set(Array.isArray(a.spouseIds) ? a.spouseIds : []);
  const bSp = new Set(Array.isArray(b.spouseIds) ? b.spouseIds : []);

  aSp.delete(bId);
  bSp.delete(aId);

  people[aId] = { ...a, spouseIds: Array.from(aSp) };
  people[bId] = { ...b, spouseIds: Array.from(bSp) };
}

function clone(value){
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function ensureFamily(f){
  const fam = f && typeof f === "object" ? f : {};
  if (!fam.people || typeof fam.people !== "object") fam.people = {};
  if (!Array.isArray(fam.order)) fam.order = [];
  if (!Number.isFinite(Number(fam.nextSeq))) fam.nextSeq = 2;

  if (!fam.people.P1){
    fam.people.P1 = {
      id: "P1",
      label: "Causante",
      sex: "unknown",
      alive: false,
      fatherId: null,
      motherId: null,
      spouseIds: [],
    };
    if (!fam.order.includes("P1")) fam.order.unshift("P1");
  }
  if (!fam.order.includes("P1")) fam.order.unshift("P1");
  return fam;
}

function createPerson(fam, partial = {}){
  const next = Number(fam.nextSeq || 2);
  const id = `P${next}`;
  fam.nextSeq = next + 1;

  fam.people[id] = {
    id,
    label: partial.label || id,
    sex: partial.sex || "unknown",
    alive: partial.alive === true,
    fatherId: partial.fatherId || null,
    motherId: partial.motherId || null,
    spouseIds: Array.isArray(partial.spouseIds) ? partial.spouseIds.slice() : [],
  };
  fam.order = Array.from(new Set([...(fam.order || []), id]));
  return id;
}

function renderRoleRow(role, value){
  const max = maxForRole(role);
  const badge = max < 100 ? `<span class="badge">0 a ${max}</span>` : `<span class="badge">0 a 100</span>`;
  return `
    <div class="builder-row" data-role="${role}">
      <div class="builder-role">
        <div class="builder-role-title">${labelForRole(role)}</div>
        <div class="builder-role-sub">${role}</div>
      </div>
      <div class="builder-input">
        <input class="input" type="number" min="0" max="${max}" value="${value}" data-role-input="${role}" id="builder-role-${role}" data-focus-key="builder:${role}" />
      </div>
      <div class="builder-meta">${badge}</div>
    </div>
  `;
}

function renderRoleSection(group, heirsByRole){
  const rows = group.roles.map((role) => renderRoleRow(role, heirsByRole[role] ?? 0)).join("");
  return `
    <section class="card card-pad stack builder-section">
      <div class="row" style="justify-content:space-between; align-items:center; gap:10px;">
        <h3 style="margin:0;">${group.title}</h3>
        <span class="badge">${group.roles.length} rol(es)</span>
      </div>
      <div class="builder-list">
        ${rows}
      </div>
    </section>
  `;
}

function hardBlocks(builder, wizard){
  const blocks = [];
  const hasAnyHeir = Object.values(builder.heirsByRole || {}).some((n) => Number(n) > 0);
  if (!hasAnyHeir){
    blocks.push("Debes indicar al menos un heredero");
  }
  if (!wizard.deceased_sex){
    blocks.push("Define sexo del causante en wizard");
  }
  return blocks;
}

function softWarnings(builder){
  const warnings = [];
  const heirs = builder.heirsByRole || {};
  const sons = heirs.son || 0;
  const grandson = heirs.sons_son || 0;
  const granddaughter = heirs.sons_daughter || 0;
  if (sons > 0 && (grandson > 0 || granddaughter > 0)){
    warnings.push("Has indicado hijos y también nietos por hijo, revisa si procede");
  }
  if ((heirs.husband || 0) > 0 && (heirs.wife || 0) > 0){
    warnings.push("No puede haber esposo y esposas a la vez");
  }
  return warnings;
}

function renderGuards(builder, wizard){
  const blocks = hardBlocks(builder, wizard);
  const warnings = softWarnings(builder);

  return `
    <div class="stack builder-guards">
      ${blocks.length ? `
        <div class="builder-guard builder-guard-hard">
          <strong>Bloqueos</strong>
          <ul>
            ${blocks.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${warnings.length ? `
        <div class="builder-guard builder-guard-soft">
          <strong>Advertencias</strong>
          <ul>
            ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
    </div>
  `;
}

function renderModeSwitcher(mode){
  const isTree = mode === "tree";
  const btnTree = isTree ? "btn" : "btn btn-secondary";
  const btnRoles = !isTree ? "btn" : "btn btn-secondary";

  return `
    <div class="card card-pad stack" style="gap:10px;">
      <div class="row" style="justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div class="stack" style="gap:2px;">
          <strong>Modo de builder</strong>
          <span class="wizard-hint">Roles (legacy) o Árbol (experimental PR14).</span>
        </div>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <button class="${btnRoles}" type="button" id="builder-mode-roles">Roles</button>
          <button class="${btnTree}" type="button" id="builder-mode-tree">Árbol</button>
        </div>
      </div>
    </div>
  `;
}

export function renderBuilder(state){
  const wizard = state.wizard;
  const builder = state.builder;
  const wizardHash = computeWizardHash(wizard);

  const mode = (builder && builder.mode === "tree") ? "tree" : "roles";
  const switcher = renderModeSwitcher(mode);

  if (mode === "tree"){
    const fam = ensureFamily(clone(builder.family || {}));
    const decedentId = builder.decedentId && fam.people[builder.decedentId] ? builder.decedentId : "P1";
    const selectedId = builder.selectedId && fam.people[builder.selectedId] ? builder.selectedId : decedentId;

    const decedentOptions = fam.order.map((id) => {
      const p = fam.people[id];
      const label = escapeHtml((p?.label || id) + ` (${id})`);
      return `<option value="${escapeHtml(id)}" ${id === decedentId ? "selected" : ""}>${label}</option>`;
    }).join("");

    const listItems = fam.order.map((id) => {
      const p = fam.people[id];
      const active = id === selectedId ? "style=\"border:1px solid var(--border-strong);\"" : "";
      const badge = (id === decedentId) ? `<span class="badge">Causante</span>` : "";
      const sex = p?.sex === "male" ? "♂" : (p?.sex === "female" ? "♀" : "?");
      const alive = p?.alive ? "vivo" : "fallecido";
      return `
        <button class="card card-pad row" type="button" data-tree-select="${escapeHtml(id)}" ${active}
          style="justify-content:space-between; align-items:center; gap:10px; text-align:left;">
          <span class="row" style="gap:8px; align-items:center;">
            <span class="badge">${sex}</span>
            <span>${escapeHtml(p?.label || id)}</span>
          </span>
          <span class="row" style="gap:8px; align-items:center;">
            <span class="wizard-hint" style="margin:0;">${alive}</span>
            ${badge}
          </span>
        </button>
      `;
    }).join("");

    const sel = fam.people[selectedId] || fam.people.P1;

    const spouseList = (sel.spouseIds || []).map((sid) => {
      const sp = fam.people[sid];
      if (!sp) return "";
      return `<button class="btn btn-secondary" type="button" data-tree-select="${escapeHtml(sp.id)}">${escapeHtml(sp.label || sp.id)}</button>`;
    }).join(" ");

    // children (by links)
    const children = [];
    for (const p of Object.values(fam.people)){
      if (!p || !p.id) continue;
      if (p.fatherId === sel.id || p.motherId === sel.id) children.push(p);
    }
    children.sort((a,b) => String(a.id).localeCompare(String(b.id)));
    const childList = children.map((c) => `<button class="btn btn-secondary" type="button" data-tree-select="${escapeHtml(c.id)}">${escapeHtml(c.label || c.id)}</button>`).join(" ");

    const payload = builder.payloadPreview ? JSON.stringify(builder.payloadPreview, null, 2) : "{ \"heirs\": [] }";
    const derived = builder.derived || {};
    const issues = Array.isArray(derived.issues) ? derived.issues : [];
    const unsupported = Array.isArray(derived.unsupported) ? derived.unsupported : [];
    const wizardChangedTree = builder.dirty && builder.wizardHashAppliedTree && wizardHash !== builder.wizardHashAppliedTree;

    return `
      <section class="stack" aria-label="Family builder tree">
        <div class="card card-pad stack">
          <div class="row" style="justify-content:space-between; align-items:flex-start;">
            <div class="stack">
              <h1 style="margin:0;">Family Builder — Árbol</h1>
              <p style="margin:0;">Modo experimental (PR14). El payload se deriva automáticamente del árbol.</p>
            </div>
            <span class="badge">Guardado local</span>
          </div>
        </div>

        ${switcher}

        ${wizardChangedTree ? `
          <div class="notice warn" id="tree-wizard-banner" style="margin-bottom:12px;">
            <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
              <div>
                <strong>El Wizard cambió. El Builder está editado manualmente.</strong><br>
                <span>Reaplicar Wizard sobrescribirá los campos derivados.</span>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn" id="tree-apply-wizard" type="button">Aplicar al árbol</button>
              </div>
            </div>
          </div>
        ` : ""}

        <div class="card card-pad stack" style="gap:10px;">
          <label class="stack">
            <span><strong>Causante (decedent)</strong></span>
            <select class="input" id="tree-decedent-select">
              ${decedentOptions}
            </select>
            <p class="wizard-hint">El payload se calcula para este causante.</p>
          </label>
        </div>

        <div style="display:grid; grid-template-columns: 320px 1fr; gap:12px;">
          <div class="stack" style="gap:10px;">
            <div class="card card-pad stack" style="gap:10px;">
              <strong>Personas</strong>
              <div class="stack" style="gap:8px;">
                ${listItems || "<p class=\"wizard-hint\">No hay personas</p>"}
              </div>
              <button class="btn btn-secondary" type="button" id="tree-add-standalone">Añadir persona (sin vínculo)</button>
              <p class="wizard-hint">Para MVP: crea nodos y luego enlaza usando padre/madre/cónyuge/hijos.</p>
            </div>
          </div>

          <div class="stack" style="gap:10px;">
            <div class="card card-pad stack" style="gap:10px;">
              <div class="row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <strong>Editar: ${escapeHtml(sel.label || sel.id)} (${escapeHtml(sel.id)})</strong>
                <span class="wizard-hint" style="margin:0;">Seleccionado</span>
              </div>

              <label class="stack">
                <span>Nombre / etiqueta</span>
                <input class="input" id="tree-person-label" data-focus-key="tree-person-label" value="${escapeHtml(sel.label || "")}" />
              </label>

              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <label class="stack" style="min-width:220px;">
                  <span>Sexo</span>
                  <select class="input" id="tree-person-sex">
                    <option value="unknown" ${sel.sex !== "male" && sel.sex !== "female" ? "selected" : ""}>Desconocido</option>
                    <option value="male" ${sel.sex === "male" ? "selected" : ""}>Hombre</option>
                    <option value="female" ${sel.sex === "female" ? "selected" : ""}>Mujer</option>
                  </select>
                </label>

                <label class="row" style="gap:8px; align-items:center; margin-top:22px;">
                  <input type="checkbox" id="tree-person-alive" ${sel.alive ? "checked" : ""} />
                  <span>Vivo</span>
                </label>
              </div>

              <div class="card card-pad stack" style="gap:10px;">
                <strong>Vínculos inmediatos</strong>

                <div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">
                  <span class="badge">Padre</span>
                  <span class="wizard-hint" style="margin:0;">${sel.fatherId && fam.people[sel.fatherId] ? escapeHtml(fam.people[sel.fatherId].label || sel.fatherId) : "—"}</span>
                  <button class="btn btn-secondary" type="button" id="tree-create-father">Crear y asignar padre</button>
                </div>

                <div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">
                  <span class="badge">Madre</span>
                  <span class="wizard-hint" style="margin:0;">${sel.motherId && fam.people[sel.motherId] ? escapeHtml(fam.people[sel.motherId].label || sel.motherId) : "—"}</span>
                  <button class="btn btn-secondary" type="button" id="tree-create-mother">Crear y asignar madre</button>
                </div>

                <div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">
                  <span class="badge">Cónyuge(s)</span>
                  <span class="row" style="gap:8px; flex-wrap:wrap;">${spouseList || "<span class=\"wizard-hint\" style=\"margin:0;\">—</span>"}</span>
                  <button class="btn btn-secondary" type="button" id="tree-add-spouse">Añadir cónyuge</button>
                </div>

                <div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">
                  <span class="badge">Hijos</span>
                  <span class="row" style="gap:8px; flex-wrap:wrap;">${childList || "<span class=\"wizard-hint\" style=\"margin:0;\">—</span>"}</span>
                  <button class="btn btn-secondary" type="button" id="tree-add-child">Añadir hijo/a</button>
                </div>
              </div>
            </div>

            <div class="card card-pad stack" style="gap:10px;">
              <strong>Payload derivado (heirs)</strong>
              <pre class="pre" style="white-space:pre-wrap;">${escapeHtml(payload)}</pre>
              <p class="wizard-hint">runCalc seguirá usando este payload desde Results.</p>
            </div>

            <div class="card card-pad stack" style="gap:10px;">
              <strong>Issues / Debug</strong>
              ${issues.length ? `
                <div class="stack" style="gap:6px;">
                  ${issues.map((it) => `<div class="wizard-alert"><div><strong>${escapeHtml(it.code || "issue")}</strong></div><div>${escapeHtml(it.message || "")}</div></div>`).join("")}
                </div>
              ` : `<p class="wizard-hint">Sin issues.</p>`}

              ${unsupported.length ? `
                <details>
                  <summary>Personas conectadas no mapeadas (${unsupported.length})</summary>
                  <div class="stack" style="gap:6px; margin-top:8px;">
                    ${unsupported.map((u) => `<div class="row" style="justify-content:space-between;"><span>${escapeHtml(u.label || u.id)}</span><span class="badge">${escapeHtml(u.id)}</span></div>`).join("")}
                  </div>
                </details>
              ` : ``}
            </div>
          </div>
        </div>

        <div class="card card-pad row" style="justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <a class="btn btn-secondary" href="#/wizard">Volver al wizard</a>
          <a class="btn" href="#/results">Ir a resultados</a>
        </div>
      </section>
    `;
  }

  // legacy roles builder: keep existing UI, only add switcher under header
  const wizardChanged = builder.dirty && builder.fromWizardApplied && builder.wizardHashApplied && builder.wizardHashApplied !== wizardHash;
  const blocks = hardBlocks(builder, wizard);
  const payloadHtml = buildPayloadPreview(builder);

  return `
    <section class="stack">
      <div class="card card-pad stack">
        <div class="row" style="justify-content:space-between; align-items:center; gap:12px;">
          <div class="stack">
            <h1 style="margin:0;">Family Structure Builder (MVP)</h1>
            <p class="wizard-hint" style="margin:0;">Define roles y conteos antes de enviar al cálculo (no se envía nada en PR4).</p>
          </div>
          <span class="badge">Local only</span>
        </div>
      </div>

      ${switcher}

      ${wizardChanged ? `
        <div class="card card-pad builder-banner">
          <div class="row" style="justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
            <div class="stack">
              <strong>El wizard ha cambiado. Aplica los cambios si quieres sincronizar el builder.</strong>
            </div>
            <div class="row" style="gap:8px; flex-wrap:wrap;">
              <button class="btn" type="button" id="builder-apply-wizard" data-focus-key="builder-apply-wizard">Aplicar cambios del wizard</button>
            </div>
          </div>
        </div>
      ` : ""}

      <div class="builder-grid">
        <div class="stack builder-left">
          ${ROLE_GROUPS.map((group) => renderRoleSection(group, builder.heirsByRole)).join("")}
        </div>
        <div class="stack builder-right">
          <section class="card card-pad stack">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <h3 style="margin:0;">Payload preview</h3>
              <button class="btn" type="button" id="builder-copy-json">Copiar JSON</button>
            </div>
            ${payloadHtml}
            <p class="wizard-hint" style="margin:0;">Solo vista previa. No se envía a calc.php.</p>
          </section>
          <section class="card card-pad stack">
            <h3 style="margin:0;">Guardarraíles</h3>
            ${renderGuards(builder, wizard)}
          </section>
          <section class="card card-pad stack">
            <div class="row" style="gap:8px; flex-wrap:wrap;">
              <a class="btn" href="#/wizard">Volver al wizard</a>
              <a class="btn ${blocks.length ? "btn-disabled" : ""}" href="${blocks.length ? "javascript:void(0)" : "#/results"}" id="builder-continue" ${blocks.length ? "aria-disabled=\"true\"" : ""}>Continuar a results</a>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function applyWizardRoles(baseHeirs, wizard){
  const heirs = { ...baseHeirs };

  if (wizard.deceased_sex === "male"){
    heirs.husband = 0;
    heirs.wife = wizard.spouse?.enabled ? wizard.spouse.wives_count : 0;
  } else if (wizard.deceased_sex === "female"){
    heirs.wife = 0;
    heirs.husband = wizard.spouse?.enabled && wizard.spouse?.husband_present ? 1 : 0;
  } else {
    heirs.husband = 0;
    heirs.wife = 0;
  }

  heirs.son = wizard.descendants?.son ?? 0;
  heirs.daughter = wizard.descendants?.daughter ?? 0;
  heirs.sons_son = wizard.descendants?.sons_son ?? 0;
  heirs.sons_daughter = wizard.descendants?.sons_daughter ?? 0;

  heirs.father = wizard.parents?.father ? 1 : 0;
  heirs.mother = wizard.parents?.mother ? 1 : 0;

  return heirs;
}

function applyWizardToTreeFamily(existingFamily, builder, wizard){
  const wizardHash = computeWizardHash(wizard || {});
  const decedentId = builder?.decedentId || "P1";

  const family = ensureFamilyShape(existingFamily);
  const people = family.people;
  const order = Array.isArray(family.order) ? family.order : [];

  // Asegura causante
  people[decedentId] = ensurePersonShape(people[decedentId], decedentId);
  const dec = people[decedentId];
  if (!order.includes(decedentId)) order.push(decedentId);

  // El causante en UI siempre se modela como fallecido (alive=false)
  let changed = false;
  if (dec.alive !== false){
    people[decedentId] = { ...dec, alive: false };
    changed = true;
  }

  const dec2 = people[decedentId];

  // Sexo del causante desde wizard (si está definido)
  if (wizard?.deceased_sex === "male" || wizard?.deceased_sex === "female"){
    if (dec2.sex !== wizard.deceased_sex){
      people[decedentId] = { ...dec2, sex: wizard.deceased_sex };
      changed = true;
    }
  }

  const dec3 = people[decedentId];

  // Padres: si wizard los pide, asegurar; si no, desconectar (no borrar personas)
  const wantFather = wizard?.parents?.father === true;
  const wantMother = wizard?.parents?.mother === true;

  if (wantFather){
    if (!dec3.fatherId || !people[dec3.fatherId]){
      const fid = allocPersonId(people);
      people[fid] = ensurePersonShape({ sex: "male", alive: true, label: "Padre" }, fid);
      if (!order.includes(fid)) order.push(fid);
      bumpNextSeq(family, fid);
      people[decedentId] = { ...people[decedentId], fatherId: fid };
      changed = true;
    }
  } else {
    if (dec3.fatherId){
      people[decedentId] = { ...people[decedentId], fatherId: null };
      changed = true;
    }
  }

  if (wantMother){
    const dec4 = people[decedentId];
    if (!dec4.motherId || !people[dec4.motherId]){
      const mid = allocPersonId(people);
      people[mid] = ensurePersonShape({ sex: "female", alive: true, label: "Madre" }, mid);
      if (!order.includes(mid)) order.push(mid);
      bumpNextSeq(family, mid);
      people[decedentId] = { ...people[decedentId], motherId: mid };
      changed = true;
    }
  } else {
    const dec4 = people[decedentId];
    if (dec4.motherId){
      people[decedentId] = { ...dec4, motherId: null };
      changed = true;
    }
  }

  // Cónyuge(s): solo si el sexo del causante está definido.
  const dec5 = people[decedentId];
  const decSex = dec5.sex;
  const spouseEnabled = wizard?.spouse?.enabled === true;

  // Nota: NO borramos personas: ajustamos enlaces.
  if (!spouseEnabled || (decSex !== "male" && decSex !== "female")){
    // Si wizard desactiva cónyuge, desconectar todos
    const ids = Array.isArray(dec5.spouseIds) ? dec5.spouseIds.filter((x) => !!people[x]) : [];
    if (ids.length){
      for (const sid of ids) unlinkSpouses(family, decedentId, sid);
      changed = true;
    }
  } else {
    // Determina objetivo
    let desired = 0;
    let desiredSpouseSex = null;

    if (decSex === "male"){
      desired = Number(wizard?.spouse?.wives_count ?? 0) || 0;
      desiredSpouseSex = "female";
    } else {
      desired = wizard?.spouse?.husband_present === true ? 1 : 0;
      desiredSpouseSex = "male";
    }

    const current = Array.isArray(people[decedentId].spouseIds)
      ? people[decedentId].spouseIds.filter((x) => !!people[x])
      : [];

    // Mantener primeros N, desconectar extras
    const keep = current.slice(0, desired);
    const drop = current.slice(desired);

    for (const sid of drop){
      unlinkSpouses(family, decedentId, sid);
      changed = true;
    }

    // Asegurar sexos de los kept (solo si el nodo existe)
    for (const sid of keep){
      const sp = ensurePersonShape(people[sid], sid);
      if (sp.sex !== desiredSpouseSex){
        people[sid] = { ...sp, sex: desiredSpouseSex };
        changed = true;
      }
    }

    // Crear faltantes y enlazar
    while (keep.length < desired){
      const sid = allocPersonId(people);
      people[sid] = ensurePersonShape({ sex: desiredSpouseSex, alive: true, label: desiredSpouseSex === "female" ? "Esposa" : "Esposo" }, sid);
      if (!order.includes(sid)) order.push(sid);
      bumpNextSeq(family, sid);
      linkSpouses(family, decedentId, sid);
      keep.push(sid);
      changed = true;
    }

    // Hijos: SOLO autogenerar si todavía NO hay hijos en el árbol (para no pisar trabajo)
    const hasKids = hasAnyChildOf(family, decedentId);
    if (!hasKids){
      const spouseId = uniqueValidSpouseId(family, decedentId); // solo si hay exactamente 1 cónyuge
      const spouse = spouseId ? people[spouseId] : null;

      const sons = Number(wizard?.descendants?.son ?? 0) || 0;
      const daughters = Number(wizard?.descendants?.daughter ?? 0) || 0;

      const fatherId = (decSex === "male") ? decedentId : (spouse && spouse.sex === "male" ? spouseId : null);
      const motherId = (decSex === "female") ? decedentId : (spouse && spouse.sex === "female" ? spouseId : null);

      for (let i = 0; i < sons; i++){
        const cid = allocPersonId(people);
        people[cid] = ensurePersonShape({ sex: "male", alive: true, fatherId, motherId, label: "Hijo" }, cid);
        if (!order.includes(cid)) order.push(cid);
        bumpNextSeq(family, cid);
        changed = true;
      }
      for (let i = 0; i < daughters; i++){
        const cid = allocPersonId(people);
        people[cid] = ensurePersonShape({ sex: "female", alive: true, fatherId, motherId, label: "Hija" }, cid);
        if (!order.includes(cid)) order.push(cid);
        bumpNextSeq(family, cid);
        changed = true;
      }

      // Nietos por hijo (sons_son / sons_daughter): se cuelgan del primer hijo varón creado si existe.
      const gsons = Number(wizard?.descendants?.sons_son ?? 0) || 0;
      const gdaughters = Number(wizard?.descendants?.sons_daughter ?? 0) || 0;

      // Encuentra un "son" existente (primero) como padre de nietos
      let firstSonId = null;
      for (const id in people){
        const p = people[id];
        if (p && p.fatherId === fatherId && p.motherId === motherId && p.sex === "male" && id !== decedentId){
          firstSonId = id;
          break;
        }
      }

      if (firstSonId){
        for (let i = 0; i < gsons; i++){
          const nid = allocPersonId(people);
          people[nid] = ensurePersonShape({ sex: "male", alive: true, fatherId: firstSonId, motherId: null, label: "Nieto (por hijo)" }, nid);
          if (!order.includes(nid)) order.push(nid);
          bumpNextSeq(family, nid);
          changed = true;
        }
        for (let i = 0; i < gdaughters; i++){
          const nid = allocPersonId(people);
          people[nid] = ensurePersonShape({ sex: "female", alive: true, fatherId: firstSonId, motherId: null, label: "Nieta (por hijo)" }, nid);
          if (!order.includes(nid)) order.push(nid);
          bumpNextSeq(family, nid);
          changed = true;
        }
      }
    }
  }

  return { family, wizardHash, changed };
}

function prefillFromWizard(store, mode){
  const state = store.getState();
  const wizard = state.wizard || {};
  const wizardHash = computeWizardHash(wizard);

  if (mode === "tree"){
    const builder = state.builder || {};
    const wizard = state.wizard || {};
    const wizardHash = computeWizardHash(wizard);

    // Solo auto-prefill si el árbol está esencialmente vacío (nuevo caso).
    const family0 = builder.family;
    const emptyTree = !family0
      || !family0.people
      || (Object.keys(family0.people).length === 0)
      || (Object.keys(family0.people).length === 1 && family0.people.P1);

    if (!builder.fromWizardApplied && emptyTree){
      const out = applyWizardToTreeFamily(family0, builder, wizard);
      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          family: out.family,
          decedentId: s.builder.decedentId || "P1",
          selectedId: s.builder.decedentId || "P1",
          fromWizardApplied: true,
          wizardHashAppliedTree: out.wizardHash,
        },
      }));
      return true;
    }

    // Si ya hubo prefill, pero no se registró hash tree, registrarlo
    if (!builder.wizardHashAppliedTree){
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, wizardHashAppliedTree: wizardHash },
      }));
    }

    return false;
  }

  if (!state.builder.fromWizardApplied){
    const heirs = applyWizardRoles({ ...state.builder.heirsByRole }, wizard);
    store.setState((s) => ({
      ...s,
      builder: {
        ...s.builder,
        heirsByRole: { ...s.builder.heirsByRole, ...heirs },
        fromWizardApplied: true,
        wizardHashApplied: wizardHash,
      },
    }));
    return true;
  }

  if (!state.builder.wizardHashApplied){
    store.setState((s) => ({
      ...s,
      builder: { ...s.builder, wizardHashApplied: wizardHash },
    }));
  }

  return false;
}

export function applyWizardSync(store){
  const state = store.getState();
  const wizard = state.wizard || {};
  const wizardHash = computeWizardHash(wizard);
  const heirs = applyWizardRoles({ ...state.builder.heirsByRole }, wizard);

  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      heirsByRole: { ...s.builder.heirsByRole, ...heirs },
      fromWizardApplied: true,
      wizardHashApplied: wizardHash,
      pendingWizardSync: false,
      dirty: false,
    },
  }));
}

export function wireBuilder(store){
  wireModeSwitcher(store);

  let state = store.getState();
  let builder = state.builder || {};
  const mode = (builder && builder.mode === "tree") ? "tree" : "roles";

  if (builder.pendingWizardSync){
    const wizard = state.wizard || {};
    const wizardHash = computeWizardHash(wizard);
    if (builder.dirty){
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, pendingWizardSync: false },
      }));
    } else if (mode === "tree"){
      const out = applyWizardToTreeFamily(builder.family, builder, wizard);
      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          family: out.family,
          decedentId: s.builder.decedentId || "P1",
          selectedId: s.builder.decedentId || "P1",
          fromWizardApplied: true,
          wizardHashAppliedTree: out.wizardHash,
          pendingWizardSync: false,
          dirty: false,
        },
      }));
    } else {
      const heirs = applyWizardRoles({ ...builder.heirsByRole }, wizard);
      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          heirsByRole: { ...s.builder.heirsByRole, ...heirs },
          fromWizardApplied: true,
          wizardHashApplied: wizardHash,
          pendingWizardSync: false,
          dirty: false,
        },
      }));
    }

    state = store.getState();
    builder = state.builder || {};
  }

  prefillFromWizard(store, mode);

  if (mode === "tree"){
    wireBuilderTree(store);
    return;
  }

  const inputs = document.querySelectorAll("[data-role-input]");
  inputs.forEach((el) => {
    el.addEventListener("input", (ev) => {
      const role = ev.target.getAttribute("data-role-input");
      if (!role) return;
      const max = maxForRole(role);
      const value = clamp(ev.target.value, max);
      ev.target.value = value;
      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          heirsByRole: { ...s.builder.heirsByRole, [role]: value },
          dirty: true,
        },
      }));
    });
  });

  const copyBtn = document.getElementById("builder-copy-json");
  if (copyBtn){
    copyBtn.addEventListener("click", async () => {
      const state = store.getState();
      const payload = state.builder.payloadPreview || { heirs: [] };
      const text = JSON.stringify(payload, null, 2);
      try{
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copiado";
        setTimeout(() => { copyBtn.textContent = "Copiar JSON"; }, 1200);
      }catch(err){
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
        copyBtn.textContent = "Copiado";
        setTimeout(() => { copyBtn.textContent = "Copiar JSON"; }, 1200);
      }
    });
  }

  const continueBtn = document.getElementById("builder-continue");
  if (continueBtn && continueBtn.classList.contains("btn-disabled")){
    continueBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
    });
  }

  const applyBtn = document.getElementById("builder-apply-wizard");
  if (applyBtn){
    applyBtn.addEventListener("click", () => {
      store.setState((s) => ({
        ...s,
        ui: {
          ...s.ui,
          modal: {
            title: "Aplicar cambios del wizard",
            body: "Esto sobrescribirá solo los campos derivados del wizard (cónyuge, padres, descendientes). Otros roles no se tocan.",
            confirmLabel: "Aplicar cambios",
            confirmAction: "builder-apply-wizard",
          },
        },
      }), { persist: false });
    });
  }
}

function wireModeSwitcher(store){
  const btnRoles = document.getElementById("builder-mode-roles");
  const btnTree = document.getElementById("builder-mode-tree");

  if (btnRoles){
    btnRoles.addEventListener("click", () => {
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, mode: "roles" },
      }));
    });
  }

  if (btnTree){
    btnTree.addEventListener("click", () => {
      store.setState((s) => ({
        ...s,
        builder: { ...s.builder, mode: "tree" },
      }));
    });
  }
}

function wireBuilderTree(store){
  const state = store.getState();
  const builder = state.builder || {};
  const fam = ensureFamily(clone(builder.family || {}));
  const decedentId = builder.decedentId && fam.people[builder.decedentId] ? builder.decedentId : "P1";
  const selectedId = builder.selectedId && fam.people[builder.selectedId] ? builder.selectedId : decedentId;

  // decedent selector
  const decSel = document.getElementById("tree-decedent-select");
  if (decSel){
    decSel.addEventListener("change", (ev) => {
      const id = String(ev.target.value || "").trim();
      store.setState((s) => {
        const f = ensureFamily(clone(s.builder.family || {}));
        const did = f.people[id] ? id : "P1";
        const sid = f.people[s.builder.selectedId] ? s.builder.selectedId : did;
        return {
          ...s,
          builder: { ...s.builder, mode: "tree", family: f, decedentId: did, selectedId: sid, dirty: true },
        };
      });
    });
  }

  // select person
  const selects = document.querySelectorAll("[data-tree-select]");
  selects.forEach((el) => {
    el.addEventListener("click", () => {
      const id = String(el.getAttribute("data-tree-select") || "").trim();
      if (!id) return;
      store.setState((s) => {
        const f = ensureFamily(clone(s.builder.family || {}));
        if (!f.people[id]) return s;
        return { ...s, builder: { ...s.builder, mode: "tree", family: f, selectedId: id } };
      });
    });
  });

  // add standalone person
  const addStandalone = document.getElementById("tree-add-standalone");
  if (addStandalone){
    addStandalone.addEventListener("click", () => {
      store.setState((s) => {
        const f = ensureFamily(clone(s.builder.family || {}));
        const id = createPerson(f, { label: "Nueva persona", sex: "unknown", alive: true });
        return { ...s, builder: { ...s.builder, mode: "tree", family: f, selectedId: id, dirty: true } };
      });
    });
  }

  const applyBtn = document.getElementById("tree-apply-wizard");
  if (applyBtn){
    applyBtn.addEventListener("click", () => {
      let toastMsg = null;
      store.setState((s) => {
        const builder = s.builder || {};
        const wizard = s.wizard || {};
        const out = applyWizardToTreeFamily(builder.family, builder, wizard);
        if (!out.changed){
          toastMsg = "Nada que aplicar (árbol ya consistente con wizard).";
          return {
            ...s,
            builder: {
              ...builder,
              family: out.family,
              wizardHashAppliedTree: out.wizardHash,
              fromWizardApplied: true,
              pendingWizardSync: false,
              dirty: false,
            },
          };
        }
        toastMsg = "Wizard aplicado al árbol.";
        return {
          ...s,
          builder: {
            ...builder,
            family: out.family,
            selectedId: builder.decedentId || "P1",
            wizardHashAppliedTree: out.wizardHash,
            fromWizardApplied: true,
            pendingWizardSync: false,
            dirty: false,
          },
        };
      });
      if (toastMsg) pushToast(store, toastMsg);
    });
  }

  const labelInput = document.getElementById("tree-person-label");
  if (labelInput){
    labelInput.addEventListener("input", (ev) => {
      const value = String(ev.target.value || "");
      store.setState((s) => {
        const f = ensureFamily(clone(s.builder.family || {}));
        const sid = s.builder.selectedId;
        if (!sid || !f.people[sid]) return s;
        f.people[sid].label = value;
        return { ...s, builder: { ...s.builder, mode: "tree", family: f, dirty: true } };
      });
    });
  }

  const sexSel = document.getElementById("tree-person-sex");
  if (sexSel){
    sexSel.addEventListener("change", (ev) => {
      const value = String(ev.target.value || "unknown");
      const sex = (value === "male" || value === "female") ? value : "unknown";
      store.setState((s) => {
        const f = ensureFamily(clone(s.builder.family || {}));
        const sid = s.builder.selectedId;
        if (!sid || !f.people[sid]) return s;
        f.people[sid].sex = sex;
        return { ...s, builder: { ...s.builder, mode: "tree", family: f, dirty: true } };
      });
    });
  }

  const aliveCb = document.getElementById("tree-person-alive");
  if (aliveCb){
    aliveCb.addEventListener("change", (ev) => {
      const checked = !!ev.target.checked;
      store.setState((s) => {
        const f = ensureFamily(clone(s.builder.family || {}));
        const sid = s.builder.selectedId;
        if (!sid || !f.people[sid]) return s;
        f.people[sid].alive = checked;
        return { ...s, builder: { ...s.builder, mode: "tree", family: f, dirty: true } };
      });
    });
  }

  const btnFather = document.getElementById("tree-create-father");
  if (btnFather){
    btnFather.addEventListener("click", () => {
      store.setState((s) => {
        const f = ensureFamily(clone(s.builder.family || {}));
        const sid = s.builder.selectedId;
        if (!sid || !f.people[sid]) return s;
        const pid = createPerson(f, { label: "Padre", sex: "male", alive: true });
        f.people[sid].fatherId = pid;
        return { ...s, builder: { ...s.builder, mode: "tree", family: f, selectedId: pid, dirty: true } };
      });
    });
  }

  const btnMother = document.getElementById("tree-create-mother");
  if (btnMother){
    btnMother.addEventListener("click", () => {
      store.setState((s) => {
        const f = ensureFamily(clone(s.builder.family || {}));
        const sid = s.builder.selectedId;
        if (!sid || !f.people[sid]) return s;
        const pid = createPerson(f, { label: "Madre", sex: "female", alive: true });
        f.people[sid].motherId = pid;
        return { ...s, builder: { ...s.builder, mode: "tree", family: f, selectedId: pid, dirty: true } };
      });
    });
  }

  const btnSpouse = document.getElementById("tree-add-spouse");
  if (btnSpouse){
    btnSpouse.addEventListener("click", () => {
      const cur = fam.people[selectedId];
      store.setState((s) => {
        const f = ensureFamily(clone(s.builder.family || {}));
        const sid = s.builder.selectedId;
        const cur2 = sid && f.people[sid] ? f.people[sid] : null;
        if (!cur2) return s;

        const inferredSex =
          cur2.sex === "male" ? "female" :
          cur2.sex === "female" ? "male" :
          "unknown";

        const pid = createPerson(f, { label: "Cónyuge", sex: inferredSex, alive: true });
        linkSpouses(f, sid, pid);

        return { ...s, builder: { ...s.builder, mode: "tree", family: f, selectedId: pid, dirty: true } };
      });

      if (!cur || cur.sex === "unknown"){
        pushToast(store, "Tip: define el sexo para clasificar cónyuge/hijos correctamente.");
      }
    });
  }

  const btnChild = document.getElementById("tree-add-child");
  if (btnChild){
    btnChild.addEventListener("click", () => {
      let toastMsg = null;

      store.setState((s) => {
        const builder = s.builder || {};
        const family = ensureFamilyShape(builder.family);
        const people = family.people;

        const selectedId = builder.selectedId || builder.decedentId || "P1";
        const parent = people[selectedId];

        if (!parent){
          toastMsg = "Selecciona una persona válida.";
          return s;
        }

        if (parent.sex !== "male" && parent.sex !== "female"){
          toastMsg = "Define el sexo de la persona seleccionada antes de añadir hijos.";
          return s;
        }

        // 1) progenitor seleccionado
        let fatherId = parent.sex === "male" ? selectedId : null;
        let motherId = parent.sex === "female" ? selectedId : null;

        // 2) intenta inferir el otro progenitor si hay exactamente 1 cónyuge con sexo complementario
        const spouseId = uniqueValidSpouseId(family, selectedId);
        if (spouseId){
          const spouse = people[spouseId];
          if (spouse && (spouse.sex === "male" || spouse.sex === "female") && spouse.sex !== parent.sex){
            if (parent.sex === "male") motherId = spouseId;
            if (parent.sex === "female") fatherId = spouseId;
          }
        }

        const childId = allocPersonId(people);
        people[childId] = ensurePersonShape({
          alive: true,
          sex: null,
          fatherId,
          motherId,
          label: "",
          spouseIds: [],
        }, childId);
        if (!family.order.includes(childId)) family.order.push(childId);
        bumpNextSeq(family, childId);

        return {
          ...s,
          builder: {
            ...builder,
            family,
            selectedId: childId,
            dirty: true,
          },
        };
      });

      if (toastMsg) pushToast(store, toastMsg);
    });
  }
}
