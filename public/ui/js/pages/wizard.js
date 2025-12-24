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
            <p class="wizard-hint" style="margin:0;">Al entrar en el builder se mostrará un import pendiente para aplicar este wizard al árbol.</p>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function wireWizard(store){
  const root = document.getElementById("app");
  if (!root) return;

  if (root.dataset.wizardWired === "1") return;
  root.dataset.wizardWired = "1";

  const setWizard = (patchFn) => {
    store.setState((s) => ({
      ...s,
      wizard: patchFn(s.wizard),
    }));
  };

  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t || !(t instanceof HTMLElement)) return;

    if (t.matches('input[name="wizard-sex"]')){
      const value = t.getAttribute("value") === "female" ? "female" : "male";
      setWizard((w) => {
        const spouseEnabled = !!w.spouse?.enabled;
        return {
          ...w,
          deceased_sex: value,
          spouse: {
            ...w.spouse,
            enabled: spouseEnabled,
            wives_count: value === "male" && spouseEnabled ? (Number.isFinite(Number(w.spouse?.wives_count)) ? Math.max(0, Math.min(4, Math.trunc(Number(w.spouse.wives_count)))) : 0) : 0,
            husband_present: value === "female" && spouseEnabled ? !!w.spouse?.husband_present : false,
          },
        };
      });
      return;
    }

    if (t.id === "wizard-spouse-enabled"){
      const enabled = !!t.checked;
      setWizard((w) => {
        const sex = w.deceased_sex;
        const wivesCount = enabled && sex === "male"
          ? (Number.isFinite(Number(w.spouse?.wives_count)) ? Math.max(0, Math.min(4, Math.trunc(Number(w.spouse.wives_count)))) : 0)
          : 0;
        const husbandPresent = enabled && sex === "female" ? !!w.spouse?.husband_present : false;
        return {
          ...w,
          spouse: {
            ...w.spouse,
            enabled,
            wives_count: wivesCount,
            husband_present: husbandPresent,
          },
        };
      });
      return;
    }

    if (t.id === "wizard-husband-present"){
      setWizard((w) => ({
        ...w,
        spouse: {
          ...w.spouse,
          husband_present: !!t.checked,
        },
      }));
      return;
    }

    if (t.id === "wizard-parent-father"){
      setWizard((w) => ({ ...w, parents: { ...w.parents, father: !!t.checked } }));
      return;
    }

    if (t.id === "wizard-parent-mother"){
      setWizard((w) => ({ ...w, parents: { ...w.parents, mother: !!t.checked } }));
      return;
    }

    if (t.id === "wizard-flag-audit"){
      setWizard((w) => ({ ...w, flags: { ...(w.flags || {}), audit: !!t.checked } }));
      return;
    }

    if (t.id === "wizard-flag-explain"){
      setWizard((w) => ({ ...w, flags: { ...(w.flags || {}), explain: !!t.checked } }));
      return;
    }
  });

  root.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t || !(t instanceof HTMLElement)) return;

    if (t.id === "wizard-estate-value"){
      const raw = String(t.value ?? "");
      setWizard((w) => ({ ...w, estate_value: raw }));
      return;
    }

    if (t.id === "wizard-currency"){
      const raw = String(t.value ?? "");
      const cleaned = raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
      t.value = cleaned;
      setWizard((w) => ({ ...w, currency: cleaned || "MAD" }));
      return;
    }

    if (t.id === "wizard-wives-count"){
      const value = clampInput(t, 4);
      setWizard((w) => ({ ...w, spouse: { ...w.spouse, wives_count: value } }));
      return;
    }

    const descMap = {
      "wizard-desc-son": "son",
      "wizard-desc-daughter": "daughter",
      "wizard-desc-sons_son": "sons_son",
      "wizard-desc-sons_daughter": "sons_daughter",
    };
    if (t.id in descMap){
      const key = descMap[t.id];
      const value = clampInput(t, 100);
      setWizard((w) => ({ ...w, descendants: { ...w.descendants, [key]: value } }));
      return;
    }
  });

  root.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!t || !(t instanceof HTMLElement)) return;

    if (t.id === "wizard-continue"){
      if (t.hasAttribute("disabled")) return;

      // handshake determinista: marca import pendiente en builder (persistente)
      store.setState((s) => ({
        ...s,
        builder: {
          ...s.builder,
          mode: "tree",
          treeUi: {
            ...(s.builder?.treeUi || {}),
            wizardPendingImport: true,
            wizardPendingFrom: "wizard",
          },
        },
      }), { persist: true });

      location.hash = "#/builder";
    }
  });
}
