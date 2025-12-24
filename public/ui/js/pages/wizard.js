// public/ui/js/pages/wizard.js
import { escapeHtml } from "../ui/escape.js";
import { renderIcon } from "../ui/icons.js";

function clampInt(v, min, max){
  const n = parseInt(String(v ?? "0"), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function setWizard(store, fn){
  store.setState((s) => {
    const w = s.wizard || {};
    const next = fn(w);
    return { ...s, wizard: next };
  }, { persist: true });
}

export function renderWizard(state){
  const w = state?.wizard || {};
  const sex = w.deceased_sex || "";
  const spouse = w.spouse || { enabled: false, wives_count: 0, husband_present: false };
  const parents = w.parents || { father: false, mother: false };
  const desc = w.descendants || { son: 0, daughter: 0, sons_son: 0, sons_daughter: 0 };

  const isMale = sex === "male";
  const isFemale = sex === "female";

  const wivesCount = clampInt(spouse.wives_count, 0, 4);
  const estateValue = String(w.estate_value ?? "");
  const currency = w.currency || "MAD";

  const canContinue = sex === "male" || sex === "female";

  return `
    <div class="stack" style="gap:12px;">
      <section class="card card-pad stack" style="gap:12px;">
        <div class="row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <strong>Wizard</strong>
          <span class="muted">Define entradas básicas y luego importa al árbol desde el Builder</span>
        </div>

        <div class="grid2">
          <label class="field">
            <span class="label">Sexo del causante</span>
            <div class="row" style="gap:10px; flex-wrap:wrap;">
              <label class="row" style="gap:8px;">
                <input type="radio" name="wizard-deceased-sex" id="wizard-deceased-male" value="male" ${isMale ? "checked" : ""}>
                <span>Hombre</span>
              </label>
              <label class="row" style="gap:8px;">
                <input type="radio" name="wizard-deceased-sex" id="wizard-deceased-female" value="female" ${isFemale ? "checked" : ""}>
                <span>Mujer</span>
              </label>
            </div>
          </label>

          <label class="field">
            <span class="label">Valor de la herencia</span>
            <div class="row" style="gap:10px;">
              <input class="input" id="wizard-estate-value" type="number" min="0" step="1" value="${escapeHtml(estateValue)}" placeholder="Ej: 250000">
              <select class="input" id="wizard-currency" style="max-width:110px;">
                <option value="MAD" ${currency === "MAD" ? "selected" : ""}>MAD</option>
                <option value="EUR" ${currency === "EUR" ? "selected" : ""}>EUR</option>
                <option value="USD" ${currency === "USD" ? "selected" : ""}>USD</option>
              </select>
            </div>
            <div class="muted" style="margin-top:6px;">Obligatorio para calcular resultados.</div>
          </label>
        </div>
      </section>

      <section class="card card-pad stack" style="gap:12px;">
        <strong>Cónyuge</strong>

        ${isMale ? `
          <div class="stack" style="gap:10px;">
            <label class="field">
              <span class="label">Esposas vivas (0 a 4)</span>
              <input class="input" id="wizard-wives-count" type="number" min="0" max="4" step="1" value="${escapeHtml(String(wivesCount))}">
            </label>
            <div class="muted">En MVP: se crean ese número de esposas vivas al importar al árbol.</div>
          </div>
        ` : ""}

        ${isFemale ? `
          <div class="stack" style="gap:10px;">
            <label class="row" style="gap:10px; align-items:center;">
              <input type="checkbox" id="wizard-husband-present" ${spouse.husband_present ? "checked" : ""}>
              <span>Esposo vivo</span>
            </label>
            <div class="muted">En MVP: si está activo, se crea un esposo vivo al importar al árbol.</div>
          </div>
        ` : ""}

        ${(!isMale && !isFemale) ? `<div class="muted">Selecciona primero el sexo del causante.</div>` : ""}

      </section>

      <section class="card card-pad stack" style="gap:12px;">
        <strong>Padres del causante</strong>
        <div class="grid2">
          <label class="row" style="gap:10px; align-items:center;">
            <input type="checkbox" id="wizard-parent-father" ${parents.father ? "checked" : ""}>
            <span>Padre vivo</span>
          </label>
          <label class="row" style="gap:10px; align-items:center;">
            <input type="checkbox" id="wizard-parent-mother" ${parents.mother ? "checked" : ""}>
            <span>Madre viva</span>
          </label>
        </div>
      </section>

      <section class="card card-pad stack" style="gap:12px;">
        <strong>Descendientes del causante</strong>

        <div class="grid2">
          <label class="field">
            <span class="label">Hijos (varones)</span>
            <input class="input" id="wizard-desc-son" type="number" min="0" step="1" value="${escapeHtml(String(clampInt(desc.son, 0, 99)))}">
          </label>
          <label class="field">
            <span class="label">Hijas</span>
            <input class="input" id="wizard-desc-daughter" type="number" min="0" step="1" value="${escapeHtml(String(clampInt(desc.daughter, 0, 99)))}">
          </label>
        </div>

        <div class="grid2">
          <label class="field">
            <span class="label">Nietos (hijos de hijo)</span>
            <input class="input" id="wizard-desc-sons-son" type="number" min="0" step="1" value="${escapeHtml(String(clampInt(desc.sons_son, 0, 99)))}">
          </label>
          <label class="field">
            <span class="label">Nietas (hijas de hijo)</span>
            <input class="input" id="wizard-desc-sons-daughter" type="number" min="0" step="1" value="${escapeHtml(String(clampInt(desc.sons_daughter, 0, 99)))}">
          </label>
        </div>

        <div class="muted">
          Nota MVP: los nietos solo se crearán al importar si existe al menos un hijo varón (o se creará uno si pides nietos y no hay hijos).
        </div>
      </section>

      <section class="card card-pad row" style="justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <div class="stack">
          <strong>Continuar</strong>
          <div class="muted">El Wizard no cambia el árbol automáticamente. Importa explícitamente desde el Builder.</div>
        </div>
        <button class="btn btn-primary" type="button" data-wizard-action="go-builder" ${canContinue ? "" : "disabled"}>
          ${renderIcon("arrowRight")} Ir al Builder
        </button>
      </section>
    </div>
  `;
}

export function bindWizardEvents(store){
  const root = document.getElementById("page-wizard");
  if (!root) return;

  // Sexo
  const male = document.getElementById("wizard-deceased-male");
  const female = document.getElementById("wizard-deceased-female");

  const onSexChange = (sex) => {
    setWizard(store, (w) => ({
      ...w,
      deceased_sex: sex,
      spouse: sex === "male"
        ? { enabled: true, wives_count: clampInt(w?.spouse?.wives_count ?? 0, 0, 4), husband_present: false }
        : { enabled: true, wives_count: 0, husband_present: Boolean(w?.spouse?.husband_present) },
    }));
  };

  if (male) male.addEventListener("change", () => { if (male.checked) onSexChange("male"); });
  if (female) female.addEventListener("change", () => { if (female.checked) onSexChange("female"); });

  // Valor herencia
  const estate = document.getElementById("wizard-estate-value");
  if (estate){
    estate.addEventListener("input", () => {
      const v = estate.value;
      setWizard(store, (w) => ({ ...w, estate_value: v }));
    });
    estate.addEventListener("change", () => {
      const v = estate.value;
      setWizard(store, (w) => ({ ...w, estate_value: v }));
    });
  }

  const currency = document.getElementById("wizard-currency");
  if (currency){
    currency.addEventListener("change", () => {
      const v = currency.value || "MAD";
      setWizard(store, (w) => ({ ...w, currency: v }));
    });
  }

  // Cónyuge (hombre)
  const wives = document.getElementById("wizard-wives-count");
  if (wives){
    const commit = () => {
      const v = clampInt(wives.value, 0, 4);
      // BUGFIX: guardar también en input (no depender de blur)
      if (String(wives.value) !== String(v)) wives.value = String(v);

      setWizard(store, (w) => ({
        ...w,
        spouse: {
          enabled: true,
          wives_count: v,
          husband_present: false,
        },
      }));
    };
    wives.addEventListener("input", commit);
    wives.addEventListener("change", commit);
    wives.addEventListener("blur", commit);
  }

  // Cónyuge (mujer)
  const husband = document.getElementById("wizard-husband-present");
  if (husband){
    const commit = () => {
      setWizard(store, (w) => ({
        ...w,
        spouse: {
          enabled: true,
          wives_count: 0,
          husband_present: Boolean(husband.checked),
        },
      }));
    };
    husband.addEventListener("change", commit);
    husband.addEventListener("click", commit);
  }

  // Padres
  const pf = document.getElementById("wizard-parent-father");
  if (pf){
    const commit = () => {
      setWizard(store, (w) => ({ ...w, parents: { ...(w.parents || {}), father: Boolean(pf.checked) } }));
    };
    pf.addEventListener("change", commit);
    pf.addEventListener("click", commit);
  }

  const pm = document.getElementById("wizard-parent-mother");
  if (pm){
    const commit = () => {
      setWizard(store, (w) => ({ ...w, parents: { ...(w.parents || {}), mother: Boolean(pm.checked) } }));
    };
    pm.addEventListener("change", commit);
    pm.addEventListener("click", commit);
  }

  // Descendientes
  const bindNum = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    const commit = () => {
      const v = clampInt(el.value, 0, 99);
      if (String(el.value) !== String(v)) el.value = String(v);
      setWizard(store, (w) => ({
        ...w,
        descendants: { ...(w.descendants || {}), [key]: v },
      }));
    };
    el.addEventListener("input", commit);
    el.addEventListener("change", commit);
    el.addEventListener("blur", commit);
  };

  bindNum("wizard-desc-son", "son");
  bindNum("wizard-desc-daughter", "daughter");
  bindNum("wizard-desc-sons-son", "sons_son");
  bindNum("wizard-desc-sons-daughter", "sons_daughter");

  // Navegación
  root.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-wizard-action]") : null;
    if (!btn) return;
    const act = btn.getAttribute("data-wizard-action");

    if (act === "go-builder"){
      // Commit extra para inputs visibles antes de navegar (evita pérdida por falta de blur)
      if (wives) wives.dispatchEvent(new Event("change", { bubbles: true }));
      if (estate) estate.dispatchEvent(new Event("change", { bubbles: true }));

      // Router por hash
      window.location.hash = "#/builder";
    }
  });
}
