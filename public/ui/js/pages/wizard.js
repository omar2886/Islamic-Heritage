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
  return "Sin especificar";
}

function safeBool(v){
  return v === true;
}

function safeInt(v, min = 0, max = 100){
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function renderWizard(state){
  const wizard = state?.wizard || {};
  const sex = wizard.deceased_sex || "";

  const spouse = wizard.spouse || { enabled: false, wives_count: 0, husband_present: false };
  const spouseEnabled = safeBool(spouse.enabled);

  const parents = wizard.parents || { father: false, mother: false };
  const father = safeBool(parents.father);
  const mother = safeBool(parents.mother);

  const desc = wizard.descendants || { son: 0, daughter: 0, sons_son: 0, sons_daughter: 0 };
  const son = safeInt(desc.son, 0, 50);
  const daughter = safeInt(desc.daughter, 0, 50);
  const sons_son = safeInt(desc.sons_son, 0, 50);
  const sons_daughter = safeInt(desc.sons_daughter, 0, 50);

  const isMale = sex === "male";
  const isFemale = sex === "female";

  const wivesCount = safeInt(spouse.wives_count, 0, 4);
  const husbandPresent = safeBool(spouse.husband_present);

  const canContinue = sex === "male" || sex === "female";

  return `
    <div class="stack" style="gap:12px;">
      <section class="card card-pad stack" style="gap:12px;">
        <div class="row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <strong>Wizard</strong>
          <span class="muted">Define entradas básicas. El árbol se crea/importa desde el Builder.</span>
        </div>

        <div class="grid2">
          <label class="field">
            <span class="label">Sexo del causante</span>
            <div class="row" style="gap:10px; flex-wrap:wrap;">
              <label class="row" style="gap:8px;">
                <input type="radio" name="wizard-sex" value="male" ${isMale ? "checked" : ""}>
                <span>Hombre</span>
              </label>
              <label class="row" style="gap:8px;">
                <input type="radio" name="wizard-sex" value="female" ${isFemale ? "checked" : ""}>
                <span>Mujer</span>
              </label>
            </div>
          </label>

          <div class="field">
            <span class="label">Cónyuge(s)</span>
            <div class="stack" style="gap:8px;">
              <label class="row" style="gap:8px;">
                <input type="checkbox" id="wizard-spouse-enabled" ${spouseEnabled ? "checked" : ""}>
                <span>Hay cónyuge(s)</span>
              </label>

              ${spouseEnabled && isMale ? `
                <label class="field" style="margin:0;">
                  <span class="label">Nº de esposas (0..4)</span>
                  <input type="number" min="0" max="4" step="1" id="wizard-wives-count" value="${wivesCount}">
                </label>
              ` : ""}

              ${spouseEnabled && isFemale ? `
                <label class="row" style="gap:8px;">
                  <input type="checkbox" id="wizard-husband-present" ${husbandPresent ? "checked" : ""}>
                  <span>Esposo presente (vivo)</span>
                </label>
              ` : ""}
            </div>
          </div>

          <div class="field">
            <span class="label">Padres vivos</span>
            <div class="row" style="gap:12px; flex-wrap:wrap;">
              <label class="row" style="gap:8px;">
                <input type="checkbox" id="wizard-father" ${father ? "checked" : ""}>
                <span>Padre</span>
              </label>
              <label class="row" style="gap:8px;">
                <input type="checkbox" id="wizard-mother" ${mother ? "checked" : ""}>
                <span>Madre</span>
              </label>
            </div>
          </div>

          <div class="field">
            <span class="label">Descendientes</span>
            <div class="grid2" style="gap:10px;">
              <label class="field" style="margin:0;">
                <span class="label">Hijos</span>
                <input type="number" min="0" max="50" step="1" id="wizard-son" value="${son}">
                <span class="muted">${formatDesc(son, "hijo", "hijos")}</span>
              </label>
              <label class="field" style="margin:0;">
                <span class="label">Hijas</span>
                <input type="number" min="0" max="50" step="1" id="wizard-daughter" value="${daughter}">
                <span class="muted">${formatDesc(daughter, "hija", "hijas")}</span>
              </label>
              <label class="field" style="margin:0;">
                <span class="label">Nietos (hijo de hijo)</span>
                <input type="number" min="0" max="50" step="1" id="wizard-sons-son" value="${sons_son}">
                <span class="muted">${formatDesc(sons_son, "nieto", "nietos")}</span>
              </label>
              <label class="field" style="margin:0;">
                <span class="label">Nietas (hija de hijo)</span>
                <input type="number" min="0" max="50" step="1" id="wizard-sons-daughter" value="${sons_daughter}">
                <span class="muted">${formatDesc(sons_daughter, "nieta", "nietas")}</span>
              </label>
            </div>
          </div>
        </div>

        <div class="row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div class="muted">
            Reglas: el wizard no modifica el árbol automáticamente. Al entrar al Builder podrás importar con confirmación.
          </div>
          <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap;">
            ${!canContinue ? `<p class="muted" style="margin:0;">Define el sexo del causante para continuar.</p>` : ""}
            <button class="btn" type="button" id="wizard-continue" ${canContinue ? "" : "disabled"}>Continuar al builder</button>
          </div>
        </div>
      </section>
    </div>
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
      wizard: patchFn(s.wizard || {}),
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
      const checked = !!t.checked;
      setWizard((w) => ({
        ...w,
        spouse: { ...(w.spouse || {}), husband_present: checked },
      }));
      return;
    }

    if (t.id === "wizard-father"){
      const checked = !!t.checked;
      setWizard((w) => ({
        ...w,
        parents: { ...(w.parents || {}), father: checked },
      }));
      return;
    }

    if (t.id === "wizard-mother"){
      const checked = !!t.checked;
      setWizard((w) => ({
        ...w,
        parents: { ...(w.parents || {}), mother: checked },
      }));
      return;
    }
  });

  root.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t || !(t instanceof HTMLElement)) return;

    if (t.id === "wizard-wives-count"){
      const n = clampInput(t, 4);
      setWizard((w) => ({
        ...w,
        spouse: { ...(w.spouse || {}), wives_count: n },
      }));
      return;
    }

    const map = {
      "wizard-son": "son",
      "wizard-daughter": "daughter",
      "wizard-sons-son": "sons_son",
      "wizard-sons-daughter": "sons_daughter",
    };

    if (t.id in map){
      const key = map[t.id];
      const n = clampInput(t, 50);
      setWizard((w) => ({
        ...w,
        descendants: { ...(w.descendants || {}), [key]: n },
      }));
      return;
    }
  });

  root.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!t || !(t instanceof HTMLElement)) return;

    if (t.id === "wizard-continue"){
      if (t.hasAttribute("disabled")) return;

      // marcar importación pendiente: la acción explícita ocurre en el Builder (modal confirm)
      store.setState((s) => ({
        ...s,
        builder: { ...(s.builder || {}), wizardPendingImport: true },
      }));

      location.hash = "#/builder";
    }
  });
}
