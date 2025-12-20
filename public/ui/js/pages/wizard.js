function clampInput(el, max = 100){
  const raw = el.value === "" ? 0 : Number(el.value);
  const safe = Number.isFinite(raw) ? Math.trunc(raw) : 0;
  const clamped = Math.min(max, Math.max(0, safe));
  el.value = clamped;
  return clamped;
}

function formatDesc(value, singular, plural){
  const n = Number(value) || 0;
  if (n === 0) return `Sin ${plural}`;
  if (n === 1) return `1 ${singular}`;
  return `${n} ${plural}`;
}

function labelSex(value){
  if (value === "male") return "Hombre";
  if (value === "female") return "Mujer";
  return "pendiente";
}

export function renderWizard(state){
  const wizard = state.wizard;
  const warnings = [];
  if (!wizard.deceased_sex){
    warnings.push("Selecciona el sexo del causante para continuar.");
  }
  if (wizard.spouse.enabled && !wizard.deceased_sex){
    warnings.push("Define el sexo antes de detallar el cónyuge.");
  }

  const spouseSection = wizard.deceased_sex === "male" ? `
    <div class="stack">
      <label class="row" style="justify-content:space-between; gap:8px;">
        <span>Esposas supervivientes</span>
        <span class="badge">0 a 4</span>
      </label>
      <input
        class="input"
        id="wizard-wives-count"
        type="number"
        min="0"
        max="4"
        value="${wizard.spouse.enabled ? wizard.spouse.wives_count : 0}"
        ${!wizard.spouse.enabled || wizard.deceased_sex !== "male" ? "disabled" : ""}
      />
      <p class="wizard-hint">Solo aplica cuando el causante es hombre. La UI impide indicar esposas si no corresponde.</p>
    </div>
  ` : `
    <div class="stack">
      <label class="row" style="gap:8px;">
        <input
          type="checkbox"
          id="wizard-husband-present"
          ${wizard.spouse.enabled && wizard.deceased_sex === "female" && wizard.spouse.husband_present ? "checked" : ""}
          ${!wizard.spouse.enabled || wizard.deceased_sex !== "female" ? "disabled" : ""}
        />
        <span>¿Esposo vivo?</span>
      </label>
      <p class="wizard-hint">Solo aplica cuando el causante es mujer.</p>
    </div>
  `;

  const summarySpouse = (() => {
    if (!wizard.spouse.enabled) return "Sin cónyuge registrado";
    if (wizard.deceased_sex === "male") return `Cónyuge: ${wizard.spouse.wives_count} esposa(s)`;
    if (wizard.deceased_sex === "female") return wizard.spouse.husband_present ? "Cónyuge: esposo presente" : "Cónyuge: sin esposo";
    return "Cónyuge pendiente de sexo";
  })();

  return `
    <section class="stack" aria-label="Case wizard">
      <div class="card card-pad stack">
        <div class="row" style="justify-content:space-between; align-items:flex-start;">
          <div class="stack">
            <h1 style="margin:0;">Case Wizard</h1>
            <p style="margin:0;">Guía asistida para preparar el caso antes del builder.</p>
          </div>
          <span class="badge">Guardado local</span>
        </div>
        <p class="wizard-hint" style="margin-top:-4px;">Los datos se guardan automáticamente en el navegador.</p>
      </div>

      <div class="wizard-grid">
        <div class="stack">
          <div class="card card-pad stack">
            <h2 style="margin:0;">Datos del causante</h2>
            <div class="row" style="flex-wrap:wrap;">
              <label class="row" style="gap:8px;">
                <input type="radio" name="wizard-sex" value="male" ${wizard.deceased_sex === "male" ? "checked" : ""} />
                <span>Hombre</span>
              </label>
              <label class="row" style="gap:8px;">
                <input type="radio" name="wizard-sex" value="female" ${wizard.deceased_sex === "female" ? "checked" : ""} />
                <span>Mujer</span>
              </label>
            </div>
          </div>

          <div class="card card-pad stack">
            <h2 style="margin:0;">Patrimonio</h2>
            <div class="wizard-fields">
              <label class="stack">
                <span>Patrimonio (opcional)</span>
                <input
                  class="input"
                  id="wizard-estate-value"
                  type="text"
                  inputmode="decimal"
                  placeholder="Ej. 100000"
                  value="${wizard.estate_value ?? ""}"
                />
              </label>
              <label class="stack">
                <span>Moneda (3 letras)</span>
                <input
                  class="input"
                  id="wizard-currency"
                  type="text"
                  maxlength="3"
                  placeholder="MAD"
                  value="${wizard.currency ?? "MAD"}"
                  list="currency-list"
                />
                <datalist id="currency-list">
                  <option value="MAD"></option>
                  <option value="EUR"></option>
                  <option value="USD"></option>
                  <option value="SAR"></option>
                </datalist>
              </label>
            </div>
            <p class="wizard-hint">Opcional. Si se indica, el resultado incluirá importes.</p>
          </div>

          <div class="card card-pad stack">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <h2 style="margin:0;">Cónyuge sobreviviente</h2>
              <label class="row" style="gap:8px;">
                <input type="checkbox" id="wizard-spouse-enabled" ${wizard.spouse.enabled ? "checked" : ""} />
                <span>Hay cónyuge</span>
              </label>
            </div>
            ${spouseSection}
          </div>

          <div class="card card-pad stack">
            <h2 style="margin:0;">Descendencia</h2>
            <div class="wizard-fields">
              <label class="stack">
                <span>Hijos</span>
                <input class="input" id="wizard-desc-son" type="number" min="0" max="100" value="${wizard.descendants.son}" />
              </label>
              <label class="stack">
                <span>Hijas</span>
                <input class="input" id="wizard-desc-daughter" type="number" min="0" max="100" value="${wizard.descendants.daughter}" />
              </label>
              <label class="stack">
                <span>Nietos por hijo</span>
                <input class="input" id="wizard-desc-sons_son" type="number" min="0" max="100" value="${wizard.descendants.sons_son}" />
                <p class="wizard-hint">Contar solo nietos que provienen de un hijo fallecido.</p>
              </label>
              <label class="stack">
                <span>Nietas por hijo</span>
                <input class="input" id="wizard-desc-sons_daughter" type="number" min="0" max="100" value="${wizard.descendants.sons_daughter}" />
              </label>
            </div>
          </div>

          <div class="card card-pad stack">
            <h2 style="margin:0;">Padres</h2>
            <div class="row" style="flex-wrap:wrap;">
              <label class="row" style="gap:8px;">
                <input type="checkbox" id="wizard-parent-father" ${wizard.parents.father ? "checked" : ""} />
                <span>Padre vivo</span>
              </label>
              <label class="row" style="gap:8px;">
                <input type="checkbox" id="wizard-parent-mother" ${wizard.parents.mother ? "checked" : ""} />
                <span>Madre viva</span>
              </label>
            </div>
          </div>

          <div class="card card-pad stack">
            <h2 style="margin:0;">Opciones de salida</h2>
            <div class="stack">
              <label class="row" style="gap:8px; align-items:center;">
                <input type="checkbox" id="wizard-flag-audit" ${wizard.flags?.audit !== false ? "checked" : ""} />
                <span>Audit</span>
              </label>
              <label class="row" style="gap:8px; align-items:center;">
                <input type="checkbox" id="wizard-flag-explain" ${wizard.flags?.explain !== false ? "checked" : ""} />
                <span>Explain</span>
              </label>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card card-pad stack wizard-summary">
            <h3 style="margin:0;">Resumen</h3>
            <ul class="wizard-list">
              <li>Sexo del causante: ${labelSex(wizard.deceased_sex)}</li>
              <li>${summarySpouse}</li>
              <li>Descendencia directa: ${formatDesc(wizard.descendants.son, "hijo", "hijos")} · ${formatDesc(wizard.descendants.daughter, "hija", "hijas")}</li>
              <li>Nietos por hijo: ${formatDesc(wizard.descendants.sons_son, "nieto", "nietos")} · ${formatDesc(wizard.descendants.sons_daughter, "nieta", "nietas")}</li>
              <li>Padre: ${wizard.parents.father ? "vivo" : "ausente"} · Madre: ${wizard.parents.mother ? "viva" : "ausente"}</li>
              <li>Patrimonio: ${
                (wizard.estate_value && String(wizard.estate_value).trim())
                  ? `${String(wizard.estate_value).trim()} ${(wizard.currency || "").trim() ? String(wizard.currency).trim().toUpperCase() : ""}`.trim()
                  : "no definido"
              }</li>
            </ul>
            ${warnings.length ? `
              <div class="wizard-alert">
                ${warnings.map((w) => `<div>• ${w}</div>`).join("")}
              </div>
            ` : `<p class="wizard-hint">Listo para continuar al builder.</p>`}
            <button class="btn" type="button" id="wizard-continue" ${wizard.deceased_sex ? "" : "disabled"}>Continuar al builder</button>
            <p class="wizard-hint" style="margin:0;">El botón se habilita cuando se define el sexo del causante.</p>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function wireWizard(store){
  const sexRadios = document.querySelectorAll('input[name="wizard-sex"]');
  sexRadios.forEach((el) => {
    el.addEventListener("change", () => {
      const value = el.value === "female" ? "female" : "male";
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          deceased_sex: value,
          spouse: {
            ...s.wizard.spouse,
            enabled: s.wizard.spouse.enabled,
            wives_count: value === "female" ? 0 : (s.wizard.spouse.enabled ? s.wizard.spouse.wives_count : 0),
            husband_present: value === "male" ? false : (s.wizard.spouse.enabled ? s.wizard.spouse.husband_present : false),
          },
        },
      }));
    });
  });

  const estateValueEl = document.getElementById("wizard-estate-value");
  if (estateValueEl){
    estateValueEl.addEventListener("input", (ev) => {
      const raw = String(ev.target.value ?? "");
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          estate_value: raw,
        },
      }));
    });
  }

  const currencyEl = document.getElementById("wizard-currency");
  if (currencyEl){
    currencyEl.addEventListener("input", (ev) => {
      const raw = String(ev.target.value ?? "");
      const upper = raw.toUpperCase();
      ev.target.value = upper;
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          currency: upper,
        },
      }));
    });
  }

  const flagAudit = document.getElementById("wizard-flag-audit");
  if (flagAudit){
    flagAudit.addEventListener("change", (ev) => {
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          flags: {
            ...(s.wizard.flags || {}),
            audit: ev.target.checked,
          },
        },
      }));
    });
  }

  const flagExplain = document.getElementById("wizard-flag-explain");
  if (flagExplain){
    flagExplain.addEventListener("change", (ev) => {
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          flags: {
            ...(s.wizard.flags || {}),
            explain: ev.target.checked,
          },
        },
      }));
    });
  }

  const spouseEnabled = document.getElementById("wizard-spouse-enabled");
  if (spouseEnabled){
    spouseEnabled.addEventListener("change", (ev) => {
      const enabled = ev.target.checked;
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          spouse: {
            ...s.wizard.spouse,
            enabled,
            wives_count: enabled ? s.wizard.spouse.wives_count : 0,
            husband_present: enabled ? s.wizard.spouse.husband_present : false,
          },
        },
      }));
    });
  }

  const wivesCount = document.getElementById("wizard-wives-count");
  if (wivesCount){
    wivesCount.addEventListener("input", (ev) => {
      const value = clampInput(ev.target, 4);
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          spouse: { ...s.wizard.spouse, wives_count: value },
        },
      }));
    });
  }

  const husband = document.getElementById("wizard-husband-present");
  if (husband){
    husband.addEventListener("change", (ev) => {
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          spouse: { ...s.wizard.spouse, husband_present: ev.target.checked },
        },
      }));
    });
  }

  const descendantFields = [
    { id: "wizard-desc-son", key: "son" },
    { id: "wizard-desc-daughter", key: "daughter" },
    { id: "wizard-desc-sons_son", key: "sons_son" },
    { id: "wizard-desc-sons_daughter", key: "sons_daughter" },
  ];
  descendantFields.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", (ev) => {
      const value = clampInput(ev.target, 100);
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          descendants: { ...s.wizard.descendants, [key]: value },
        },
      }));
    });
  });

  const parentFather = document.getElementById("wizard-parent-father");
  if (parentFather){
    parentFather.addEventListener("change", (ev) => {
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          parents: { ...s.wizard.parents, father: ev.target.checked },
        },
      }));
    });
  }

  const parentMother = document.getElementById("wizard-parent-mother");
  if (parentMother){
    parentMother.addEventListener("change", (ev) => {
      store.setState((s) => ({
        ...s,
        wizard: {
          ...s.wizard,
          parents: { ...s.wizard.parents, mother: ev.target.checked },
        },
      }));
    });
  }

  const continueBtn = document.getElementById("wizard-continue");
  if (continueBtn){
    continueBtn.addEventListener("click", () => {
      if (continueBtn.disabled) return;
      location.hash = "#/builder";
    });
  }
}
