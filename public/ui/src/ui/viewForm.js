import { el } from "./dom.js";
import { radioGroup, toggleField, numberField, textField } from "./components.js";
import { UI_SECTIONS, getRoleMeta } from "../domain/roleMap.js";

function renderRoleField(state, actions, roleId) {
  const meta = getRoleMeta(roleId);
  if (!meta) {
    return el("div", { class: "banner error", text: `Role meta missing: ${roleId}` });
  }

  const compat = state.runtime.roleCompat;
  const rejected = new Set(Array.isArray(compat?.rejectedRoles) ? compat.rejectedRoles : []);
  const isRejected = rejected.has(roleId);

  const baseHint = `Role ${meta.id}`;
  const rejectHint = isRejected
    ? "Este role aparece en roles.php pero el core lo ignora (lo normaliza a unknown)."
    : "";
  const hint = rejectHint ? `${baseHint}. ${rejectHint}` : baseHint;

  if (meta.input === "bool") {
    const checked = !!state.heirs[roleId];

    // Hard sex rules: keep visible, but disable the non-applicable spouse field
    let disabled = isRejected;
    if (roleId === "wife" && state.decedent.sex !== "male") disabled = true;
    if (roleId === "husband" && state.decedent.sex !== "female") disabled = true;

    return toggleField({
      label: meta.label,
      checked,
      disabled,
      hint,
      focusKey: `role.${roleId}`,
      onChange: (v) => actions.setHeirBool(roleId, v)
    });
  }

  const value = Number(state.heirs[roleId] || 0);
  return numberField({
    label: meta.label,
    value,
    min: 0,
    max: 999,
    disabled: isRejected,
    hint,
    focusKey: `role.${roleId}`,
    onInput: (v) => actions.setHeirCount(roleId, v)
  });
}

function renderSection(state, actions, section) {
  const fields = section.roles.map((r) => renderRoleField(state, actions, r));

  const isOpen = !!state.ui.sectionsOpen?.[section.id];

  return el(
    "details",
    {
      class: "details",
      "data-section-id": section.id,
      ...(isOpen ? { open: "open" } : {}),
      ontoggle: (e) => {
        // Avoid render-loop: ignore programmatic open/close during render.
        if (!e.isTrusted) return;
        actions.setSectionOpen(section.id, e.currentTarget.open);
      }
    },
    [el("summary", { text: section.title }), el("div", {}, fields)]
  );
}

export function renderForm(mount, state, actions) {
  const parts = [];

  parts.push(
    radioGroup({
      label: "Sexo del causante",
      value: state.decedent.sex,
      focusKey: "decedent.sex",
      options: [
        { value: "male", label: "Hombre" },
        { value: "female", label: "Mujer" }
      ],
      onChange: actions.setSex
    })
  );

  parts.push(
    el("div", { class: "card" }, [
      el("h3", { text: "Herederos" }),
      ...UI_SECTIONS.map((s) => renderSection(state, actions, s)),
      el("div", { class: "cardSep" }),
      toggleField({
        label: "Nietos via hijo: existe al menos un hijo varon fallecido",
        checked: !!state.uiOnly.hasDeceasedSon,
        hint: "UI-only: requerido si indicas nietos via hijo.",
        focusKey: "uiOnly.hasDeceasedSon",
        onChange: actions.setHasDeceasedSon
      })
    ])
  );

  parts.push(
    el("div", { class: "card" }, [
      el("h3", { text: "Herencia" }),
            textField({
        label: "Valor (numero)",
        value: state.estate.value,
        placeholder: "100000",
        focusKey: "estate.value",
        inputMode: "numeric",
        pattern: "[0-9]*",
        onInput: actions.setEstateValue
      }),
      textField({
        label: "Moneda (ISO 4217, opcional)",
        value: state.estate.currency,
        placeholder: "MAD",
        focusKey: "estate.currency",
        onInput: actions.setEstateCurrency
      }),
      toggleField({
        label: "Pretty JSON en Debug",
        checked: !!state.ui.prettyJson,
        focusKey: "ui.prettyJson",
        onChange: actions.setPrettyJson
      })
    ])
  );

  // Small status about role compatibility probe (if available)
  if (state.runtime.roleCompatLoading) {
    parts.push(el("div", { class: "banner warn", text: "Verificando compatibilidad de roles con calc.php..." }));
  } else if (state.runtime.roleCompatError) {
    parts.push(el("div", { class: "banner warn", text: `Compatibilidad roles: error: ${state.runtime.roleCompatError}` }));
  } else if (state.runtime.roleCompat) {
    const rc = state.runtime.roleCompat;
    const rej = Array.isArray(rc.rejectedRoles) ? rc.rejectedRoles.length : 0;
    const acc = Array.isArray(rc.acceptedRoles) ? rc.acceptedRoles.length : 0;
    parts.push(
      el("div", { class: "banner ok" }, [
        el("div", { text: `Compatibilidad roles (calc.php): aceptados=${acc} rechazados=${rej}` }),
        rej > 0
          ? el("small", { class: "hint", text: `Roles ignorados por el core: ${rc.rejectedRoles.join(", ")}` })
          : null
      ])
    );
  }

  mount.innerHTML = "";
  for (const p of parts) mount.appendChild(p);
}
