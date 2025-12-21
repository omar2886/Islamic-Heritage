import { ROLE_GROUPS, labelForRole } from "../domain/roles.js";
import { renderBuilderTree, wireBuilderTree, applyWizardSyncTree } from "./builder_tree.js";

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

function renderBuilderRoles(state){
  const wizard = state.wizard;
  const builder = state.builder;
  const wizardHash = computeWizardHash(wizard);

  const wizardChanged = builder.fromWizardApplied && builder.wizardHashApplied && builder.wizardHashApplied !== wizardHash;
  const blocks = hardBlocks(builder, wizard);
  const payloadHtml = buildPayloadPreview(builder);

  return `
    <section class="stack">
      <div class="card card-pad stack">
        <div class="row" style="justify-content:space-between; align-items:center; gap:12px;">
          <div class="stack">
            <h1 style="margin:0;">Family Structure Builder (MVP)</h1>
            <p class="wizard-hint" style="margin:0;">Define roles y conteos antes de enviar al cálculo (no se envía nada en PR4).</p>
            <div class="segmented" role="tablist" aria-label="Modo de builder">
              <button class="segmented-btn" id="builder-mode-tree" type="button">Árbol</button>
              <button class="segmented-btn is-active" id="builder-mode-roles" type="button">Roles</button>
            </div>
          </div>
          <span class="badge">Local only</span>
        </div>
      </div>

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

function prefillFromWizard(store){
  const state = store.getState();
  const wizard = state.wizard || {};
  const wizardHash = computeWizardHash(wizard);

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

function applyWizardSyncRoles(store){
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
    },
  }));
}

function wireBuilderRoles(store){
  prefillFromWizard(store);

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

function getBuilderMode(state){
  const m = state?.builder?.mode;
  return (m === "tree" || m === "roles") ? m : "tree";
}

function wireBuilderModeToggle(store){
  const treeBtn = document.getElementById("builder-mode-tree");
  const rolesBtn = document.getElementById("builder-mode-roles");

  const setMode = (mode) => {
    const s = store.getState();
    if (s.builder?.mode === mode) return;
    store.setState({ builder: { ...s.builder, mode } });
  };

  if (treeBtn) treeBtn.addEventListener("click", () => setMode("tree"));
  if (rolesBtn) rolesBtn.addEventListener("click", () => setMode("roles"));
}

export function renderBuilder(state, derived){
  const mode = getBuilderMode(state);
  if (mode === "tree") return renderBuilderTree(state, derived);
  return renderBuilderRoles(state, derived);
}

export function wireBuilder(store){
  // always wire the mode toggle (exists in both renderers)
  wireBuilderModeToggle(store);

  const mode = getBuilderMode(store.getState());
  if (mode === "tree") return wireBuilderTree(store);
  return wireBuilderRoles(store);
}

export function applyWizardSync(store){
  const mode = getBuilderMode(store.getState());
  if (mode === "tree") return applyWizardSyncTree(store);
  return applyWizardSyncRoles(store);
}
