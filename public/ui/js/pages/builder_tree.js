import {
  makeEmptyFamily,
  sanitizeFamily,
  listPeople,
  getPerson,
  childrenOf,
  addSpouse,
  addParent,
  addChild,
  updatePerson,
  selectPerson,
  removePerson,
  deriveHeirsFromFamily
} from "../domain/familyTree.js";

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll("\"","&quot;")
    .replaceAll("'","&#039;");
}

function sexLabel(sex){
  if (sex === "male") return "Hombre";
  if (sex === "female") return "Mujer";
  return "—";
}

function aliveLabel(a){
  return a ? "Vivo" : "Fallecido";
}

export function ensureTreeInitialized(store){
  const st = store.getState();
  const fam = st.builder.family;
  if (fam && typeof fam === "object") return;

  const fresh = makeEmptyFamily();
  store.setState((s) => ({
    ...s,
    builder: {
      ...s.builder,
      family: fresh,
      decedentId: fresh.decedentId,
      selectedId: fresh.selectedId
    }
  }));
}

export function importWizardToTree(store){
  // IMPORT BASICO PR16: solo fija sexo del causante y crea cónyuge/padres/hijos.
  // Nietos (sons_son/sons_daughter) NO se importan aquí en PR16 (se hará en PR17).
  const st = store.getState();
  const wiz = st.wizard || {};
  let fam = makeEmptyFamily();

  // set decedent sex + mirror into wizard
  const decSex = (wiz.deceased_sex === "male" || wiz.deceased_sex === "female") ? wiz.deceased_sex : null;
  fam = updatePerson(fam, fam.decedentId, { sex: decSex, alive: false, label: "Causante" });

  // spouse(s)
  if (wiz.spouse && wiz.spouse.enabled === true){
    if (decSex === "male"){
      const n = Math.max(0, Math.trunc(Number(wiz.spouse.wives_count || 0)));
      for (let i=0;i<n;i++){
        fam = addSpouse(fam, fam.decedentId, { label: `Esposa ${i+1}`, sex: "female", alive: true });
      }
    } else if (decSex === "female"){
      if (wiz.spouse.husband_present === true){
        fam = addSpouse(fam, fam.decedentId, { label: "Esposo", sex: "male", alive: true });
      }
    }
  }

  // parents
  if (wiz.parents && wiz.parents.enabled === true){
    if (wiz.parents.father === true){
      fam = addParent(fam, fam.decedentId, "father", { label: "Padre", alive: true });
    }
    if (wiz.parents.mother === true){
      fam = addParent(fam, fam.decedentId, "mother", { label: "Madre", alive: true });
    }
  }

  // children (assign other parent if exactly 1 spouse exists)
  const dec = getPerson(fam, fam.decedentId);
  const spouseIds = (dec?.spouseIds || []);
  const otherParent = spouseIds.length === 1 ? spouseIds[0] : null;

  const sons = Math.max(0, Math.trunc(Number(wiz.descendants?.son || 0)));
  const daughters = Math.max(0, Math.trunc(Number(wiz.descendants?.daughter || 0)));

  for (let i=0;i<sons;i++){
    fam = addChild(fam, fam.decedentId, otherParent, { label: `Hijo ${i+1}`, sex: "male", alive: true });
  }
  for (let i=0;i<daughters;i++){
    fam = addChild(fam, fam.decedentId, otherParent, { label: `Hija ${i+1}`, sex: "female", alive: true });
  }

  // commit to store (+ keep wizard sex consistent)
  store.setState((s) => ({
    ...s,
    wizard: { ...s.wizard, deceased_sex: decSex },
    builder: {
      ...s.builder,
      family: sanitizeFamily(fam),
      decedentId: fam.decedentId,
      selectedId: fam.selectedId
    }
  }));
}

function renderPeopleList(fam, selectedId){
  const people = listPeople(fam).slice().sort((a,b) => a.id.localeCompare(b.id));
  return `
    <div class="tree-list">
      ${people.map((p) => `
        <button class="tree-item ${p.id === selectedId ? "is-selected" : ""}" type="button" data-tree-select="${esc(p.id)}">
          <div class="tree-item-main">
            <strong>${esc(p.label)}</strong>
            <span class="badge">${esc(p.id)}</span>
          </div>
          <div class="tree-item-sub">
            <span>${sexLabel(p.sex)}</span>
            <span>·</span>
            <span>${aliveLabel(p.alive)}</span>
          </div>
        </button>
      `).join("")}
    </div>
  `;
}

function renderSelectedPanel(fam, selectedId){
  const p = getPerson(fam, selectedId);
  if (!p) return `<div class="card card-pad">Selecciona una persona</div>`;

  const father = p.fatherId ? getPerson(fam, p.fatherId) : null;
  const mother = p.motherId ? getPerson(fam, p.motherId) : null;
  const spouses = (p.spouseIds || []).map((sid) => getPerson(fam, sid)).filter(Boolean);
  const kids = childrenOf(fam, p.id).map((cid) => getPerson(fam, cid)).filter(Boolean);

  return `
    <section class="card card-pad stack">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">Persona</h3>
        <button class="btn btn-danger" type="button" data-tree-delete="${esc(p.id)}" ${p.id==="P1" ? "disabled" : ""}>Eliminar</button>
      </div>

      <label class="field">
        <span class="field-label">Nombre</span>
        <input class="input" type="text" value="${esc(p.label)}" data-tree-edit="label" />
      </label>

      <div class="row" style="gap:10px; flex-wrap:wrap;">
        <label class="field" style="min-width:220px;">
          <span class="field-label">Sexo</span>
          <select class="select" data-tree-edit="sex">
            <option value="" ${p.sex===null ? "selected" : ""}>—</option>
            <option value="male" ${p.sex==="male" ? "selected" : ""}>Hombre</option>
            <option value="female" ${p.sex==="female" ? "selected" : ""}>Mujer</option>
          </select>
        </label>

        <label class="field" style="min-width:220px;">
          <span class="field-label">Estado</span>
          <select class="select" data-tree-edit="alive">
            <option value="false" ${p.alive!==true ? "selected" : ""}>Fallecido</option>
            <option value="true" ${p.alive===true ? "selected" : ""}>Vivo</option>
          </select>
        </label>
      </div>

      <div class="tree-rel">
        <div><strong>Padre:</strong> ${father ? esc(father.label) : "—"}</div>
        <div><strong>Madre:</strong> ${mother ? esc(mother.label) : "—"}</div>
        <div><strong>Cónyuges:</strong> ${spouses.length ? spouses.map(s=>esc(s.label)).join(", ") : "—"}</div>
        <div><strong>Hijos:</strong> ${kids.length ? kids.map(k=>esc(k.label)).join(", ") : "—"}</div>
      </div>

      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <button class="btn" type="button" data-tree-add="spouse">Añadir cónyuge</button>
        <button class="btn" type="button" data-tree-add="child">Añadir hijo/a</button>
        <button class="btn" type="button" data-tree-add="father" ${p.fatherId ? "disabled" : ""}>Añadir padre</button>
        <button class="btn" type="button" data-tree-add="mother" ${p.motherId ? "disabled" : ""}>Añadir madre</button>
      </div>

      <p class="wizard-hint" style="margin:0;">
        PR16: el cálculo deriva roles solo de ascendencia/descendencia/cónyuge (nietos solo vía hijo varón fallecido).
      </p>
    </section>
  `;
}

function renderMappingPanel(store, fam){
  const st = typeof store?.getState === "function" ? store.getState() : store;
  const expected = st.builder.heirsByRole || {};
  const dec = getPerson(fam, fam.decedentId);

  const mapping = deriveHeirsFromFamily(fam);
  // Build counts from mappedById
  const counts = {};
  Object.keys(expected).forEach((r) => counts[r] = 0);

  Object.values(mapping.mappedById).forEach((role) => {
    if (counts[role] != null) counts[role] += 1;
  });

  const mappedRows = Object.entries(mapping.mappedById).map(([id, role]) => {
    const p = getPerson(fam, id);
    return `<li><strong>${esc(p ? p.label : id)}</strong> → <span class="badge">${esc(role)}</span></li>`;
  }).join("");

  const unmappedRows = mapping.unmappedLiving.map((id) => {
    const p = getPerson(fam, id);
    return `<li><strong>${esc(p ? p.label : id)}</strong> <span class="badge">no mapeado PR16</span></li>`;
  }).join("");

  // show minimal counts summary
  const summary = ["husband","wife","father","mother","son","daughter","sons_son","sons_daughter"]
    .map((r) => counts[r] ? `<span class="badge">${r}:${counts[r]}</span>` : "")
    .filter(Boolean)
    .join(" ");

  return `
    <section class="card card-pad stack">
      <div class="row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <h3 style="margin:0;">Derivación a roles (core)</h3>
        <div class="row" style="gap:6px; flex-wrap:wrap;">${summary || `<span class="badge">sin roles derivados</span>`}</div>
      </div>

      <div class="stack">
        <strong>Mapeados</strong>
        ${mappedRows ? `<ul>${mappedRows}</ul>` : `<p class="wizard-hint" style="margin:0;">Nada mapeado todavía.</p>`}
      </div>

      <div class="stack">
        <strong>No mapeados (vivos)</strong>
        ${unmappedRows ? `<ul>${unmappedRows}</ul>` : `<p class="wizard-hint" style="margin:0;">Ninguno ✅</p>`}
      </div>

      <p class="wizard-hint" style="margin:0;">
        Si necesitas colaterales (hermanos/tíos...), se mantienen en el árbol pero PR16 no los convierte a roles.
      </p>
    </section>
  `;
}

export function renderBuilderTree(store){
  const st = typeof store?.getState === "function" ? store.getState() : store;
  const fam = sanitizeFamily(st.builder.family || makeEmptyFamily());
  const selectedId = st.builder.selectedId || fam.selectedId || fam.decedentId;

  return `
    <section class="stack">
      <div class="card card-pad stack">
        <div class="row" style="justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <div class="stack">
            <h2 style="margin:0;">Builder — Modo Árbol</h2>
            <p class="wizard-hint" style="margin:0;">Crea personas y vínculos directos. La UI deriva roles compatibles con el core.</p>
          </div>
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            <button class="btn" type="button" id="tree-import-wizard">Importar del wizard</button>
            <button class="btn btn-danger" type="button" id="tree-reset">Reiniciar árbol</button>
          </div>
        </div>
      </div>

      <div class="tree-grid">
        <div class="stack">
          <section class="card card-pad stack">
            <h3 style="margin:0;">Personas</h3>
            ${renderPeopleList(fam, selectedId)}
          </section>
        </div>

        <div class="stack">
          ${renderSelectedPanel(fam, selectedId)}
          ${renderMappingPanel(store, fam)}
        </div>
      </div>
    </section>
  `;
}

export function wireBuilderTree(store){
  ensureTreeInitialized(store);

  const st = store.getState();
  const fam = sanitizeFamily(st.builder.family);

  // list select
  document.querySelectorAll("[data-tree-select]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      const id = ev.currentTarget.getAttribute("data-tree-select");
      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          family: selectPerson(s.builder.family, id),
          selectedId: id
        }
      }));
    });
  });

  // edit label/sex/alive
  const panel = document.querySelector("[data-tree-panel]") || document.body;

  const labelInput = document.querySelector('[data-tree-edit="label"]');
  if (labelInput){
    labelInput.addEventListener("input", (ev) => {
      const v = ev.target.value;
      store.setState((s) => {
        const fam2 = sanitizeFamily(s.builder.family);
        const id = s.builder.selectedId || fam2.selectedId;
        return {
          ...s,
          builder: { ...s.builder, family: updatePerson(fam2, id, { label: v }) }
        };
      });
    });
  }

  const sexSel = document.querySelector('[data-tree-edit="sex"]');
  if (sexSel){
    sexSel.addEventListener("change", (ev) => {
      const v = ev.target.value || null;
      store.setState((s) => {
        const fam2 = sanitizeFamily(s.builder.family);
        const id = s.builder.selectedId || fam2.selectedId;
        const fam3 = updatePerson(fam2, id, { sex: v });
        const isDec = id === fam3.decedentId;
        return {
          ...s,
          wizard: isDec ? { ...s.wizard, deceased_sex: (v === "male" || v === "female") ? v : s.wizard.deceased_sex } : s.wizard,
          builder: { ...s.builder, family: fam3 }
        };
      });
    });
  }

  const aliveSel = document.querySelector('[data-tree-edit="alive"]');
  if (aliveSel){
    aliveSel.addEventListener("change", (ev) => {
      const v = ev.target.value === "true";
      store.setState((s) => {
        const fam2 = sanitizeFamily(s.builder.family);
        const id = s.builder.selectedId || fam2.selectedId;
        return { ...s, builder: { ...s.builder, family: updatePerson(fam2, id, { alive: v }) } };
      });
    });
  }

  // add relations
  document.querySelectorAll("[data-tree-add]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      const what = ev.currentTarget.getAttribute("data-tree-add");
      store.setState((s) => {
        let fam2 = sanitizeFamily(s.builder.family);
        const id = s.builder.selectedId || fam2.selectedId;

        if (what === "spouse"){
          fam2 = addSpouse(fam2, id, { alive: true });
        } else if (what === "father"){
          fam2 = addParent(fam2, id, "father", { alive: true });
        } else if (what === "mother"){
          fam2 = addParent(fam2, id, "mother", { alive: true });
        } else if (what === "child"){
          // if parent has exactly 1 spouse -> auto use as other parent
          const p = getPerson(fam2, id);
          const other = (p && p.spouseIds && p.spouseIds.length === 1) ? p.spouseIds[0] : null;
          fam2 = addChild(fam2, id, other, { alive: true });
        }

        return { ...s, builder: { ...s.builder, family: fam2, selectedId: fam2.selectedId } };
      });
    });
  });

  // delete person
  document.querySelectorAll("[data-tree-delete]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      const id = ev.currentTarget.getAttribute("data-tree-delete");
      if (!id || id === "P1") return;
      store.setState((s) => {
        const fam2 = sanitizeFamily(s.builder.family);
        const fam3 = removePerson(fam2, id);
        return { ...s, builder: { ...s.builder, family: fam3, selectedId: fam3.selectedId } };
      });
    });
  });

  // import wizard / reset with modal
  const importBtn = document.getElementById("tree-import-wizard");
  if (importBtn){
    importBtn.addEventListener("click", () => {
      store.setState((s) => ({
        ...s,
        ui: {
          ...s.ui,
          modal: {
            title: "Importar del wizard al árbol",
            body: "Se recreará el árbol a partir del wizard (sexo, cónyuge, padres, hijos). PR16 no importa nietos todavía.",
            confirmLabel: "Importar",
            confirmAction: "builder-tree-import-wizard"
          }
        }
      }), { persist: false });
    });
  }

  const resetBtn = document.getElementById("tree-reset");
  if (resetBtn){
    resetBtn.addEventListener("click", () => {
      store.setState((s) => ({
        ...s,
        ui: {
          ...s.ui,
          modal: {
            title: "Reiniciar árbol",
            body: "Se borrará el árbol actual y se creará un árbol vacío con el causante.",
            confirmLabel: "Reiniciar",
            confirmAction: "builder-tree-reset"
          }
        }
      }), { persist: false });
    });
  }
}

export function deriveHeirsByRoleFromTreeInto(expectedHeirsByRole, family){
  const base = { ...expectedHeirsByRole };
  Object.keys(base).forEach((k) => base[k] = Number(base[k]) || 0);

  const mapping = deriveHeirsFromFamily(family);

  // reset only the PR16-scoped roles, leave others as-is (so advanced roles mode can still exist later)
  const scoped = new Set(["husband","wife","father","mother","son","daughter","sons_son","sons_daughter"]);
  scoped.forEach((r) => { if (base[r] != null) base[r] = 0; });

  Object.values(mapping.mappedById).forEach((role) => {
    if (scoped.has(role) && base[role] != null) base[role] += 1;
  });

  return { heirsByRole: base, mapping };
}
