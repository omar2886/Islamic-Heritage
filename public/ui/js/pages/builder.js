import { ROLE_GROUPS, labelForRole } from "../domain/roles.js";

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

export function renderBuilder(state){
  const builder = state.builder;
  const wizard = state.wizard;
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
    },
  }));
}

export function wireBuilder(store){
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
