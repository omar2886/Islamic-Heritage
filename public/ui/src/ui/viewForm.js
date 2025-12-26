import { el } from "./dom.js";
import { radioGroup, toggleField, numberField, textField } from "./components.js";
import { UI_SECTIONS, getRoleMeta } from "../domain/roleMap.js";
import { t } from "./i18n.js";

function roleLabel(roleId, fallback) {
  const k = `role.${roleId}`;
  const v = t(k);
  return v === k ? (fallback || roleId) : v;
}

function renderRoleField(state, actions, roleId) {
  const meta = getRoleMeta(roleId);
  if (!meta) {
    return el("div", { class: "banner error", text: `Role meta missing: ${roleId}` });
  }

  const compat = state.runtime.roleCompat;
  const rejected = new Set(Array.isArray(compat?.rejectedRoles) ? compat.rejectedRoles : []);
  const isRejected = rejected.has(roleId);

  const baseHint = t("form.roleHintBase", { id: meta.id });
  const rejectHint = isRejected ? t("form.roleIgnored") : "";
  const hint = rejectHint ? `${baseHint} ${rejectHint}` : baseHint;

  const label = roleLabel(roleId, meta.label);

  if (meta.input === "bool") {
    const checked = !!state.heirs[roleId];

    // Hard sex rules: keep visible, but disable the non-applicable spouse field.
    let disabled = isRejected;
    if (roleId === "wife" && state.decedent.sex !== "male") disabled = true;
    if (roleId === "husband" && state.decedent.sex !== "female") disabled = true;

    return toggleField({
      label,
      checked,
      disabled,
      hint,
      focusKey: `role.${roleId}`,
      onChange: (v) => actions.setHeirBool(roleId, v)
    });
  }

  const value = Number(state.heirs[roleId] || 0);
  return numberField({
    label,
    value,
    min: meta.min ?? 0,
    max: meta.max ?? 999,
    disabled: isRejected,
    hint,
    focusKey: `role.${roleId}`,
    onInput: (v) => actions.setHeirCount(roleId, v)
  });
}

function renderSection(state, actions, section) {
  const fields = section.roles.map((r) => renderRoleField(state, actions, r));
  const isOpen = !!state.ui.sectionsOpen?.[section.id];

  // Extra context hints for a couple of sections where users commonly get confused.
  const extraHints = [];

  if (section.id === "grandparents") {
    extraHints.push(el("div", { class: "hint", text: t("form.grandparentsHint") }));
  }

  if (section.id === "grandchildren") {
    extraHints.push(el("div", { class: "hint", text: t("form.grandchildrenLineageHint") }));
    const grandTotal = Number(state.heirs.sons_son || 0) + Number(state.heirs.sons_daughter || 0);
    const sonsCount = Number(state.heirs.son || 0);
    if (grandTotal > 0 && sonsCount > 0) {
      extraHints.push(el("div", { class: "banner warn", text: t("form.grandchildrenBlockedHint") }));
    }
  }

  const sectionTitleKey = `section.${section.id}`;
  const sectionTitle = t(sectionTitleKey) === sectionTitleKey ? section.title : t(sectionTitleKey);

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
    [el("summary", { text: sectionTitle }), el("div", {}, [...extraHints, ...fields])]
  );
}

function renderFiqhSelector(state, actions) {
  const select = el(
    "select",
    {
      "data-focus-key": "ui.fiqhSchool",
      onchange: (e) => actions.setFiqhSchool(e.target.value)
    },
    [
      el("option", { value: "maliki", text: t("fiqh.maliki") }),
      el("option", { value: "hanafi", text: t("fiqh.hanafi"), disabled: "disabled" }),
      el("option", { value: "shafii", text: t("fiqh.shafii"), disabled: "disabled" }),
      el("option", { value: "hanbali", text: t("fiqh.hanbali"), disabled: "disabled" })
    ]
  );
  select.value = state.ui.fiqhSchool || "maliki";

  return el("div", { class: "row", style: "align-items:center;gap:10px;margin:0 0 10px 0" }, [
    el("div", { class: "hint", text: t("form.fiqhSchool") }),
    select
  ]);
}

export function renderForm(mount, state, actions) {
  const parts = [];

  parts.push(
    radioGroup({
      label: t("form.decedentSex"),
      value: state.decedent.sex,
      focusKey: "decedent.sex",
      options: [
        { value: "male", label: t("sex.male") },
        { value: "female", label: t("sex.female") }
      ],
      onChange: actions.setSex
    })
  );

  parts.push(
    el("div", { class: "card" }, [
      renderFiqhSelector(state, actions),
      el("h3", { text: t("form.heirs") }),
      ...UI_SECTIONS.map((s) => renderSection(state, actions, s)),
      el("div", { class: "cardSep" }),
      toggleField({
        label: t("form.hasDeceasedSon"),
        checked: !!state.uiOnly.hasDeceasedSon,
        hint: t("form.hasDeceasedSonHint"),
        focusKey: "uiOnly.hasDeceasedSon",
        onChange: actions.setHasDeceasedSon
      })
    ])
  );

  parts.push(
    el("div", { class: "card" }, [
      el("h3", { text: t("form.estate") }),
      textField({
        label: t("form.estateValue"),
        value: state.estate.value,
        placeholder: "100000",
        focusKey: "estate.value",
        inputMode: "numeric",
        pattern: "[0-9]*",
        onInput: actions.setEstateValue
      }),
      textField({
        label: t("form.estateCurrency"),
        value: state.estate.currency,
        placeholder: "MAD",
        focusKey: "estate.currency",
        onInput: actions.setEstateCurrency
      }),
      toggleField({
        label: t("form.prettyJson"),
        checked: !!state.ui.prettyJson,
        focusKey: "ui.prettyJson",
        onChange: actions.setPrettyJson
      })
    ])
  );

  // Small status about role compatibility probe (if available)
  if (state.runtime.roleCompatLoading) {
    parts.push(el("div", { class: "banner warn", text: t("roleCompat.loading") }));
  } else if (state.runtime.roleCompatError) {
    parts.push(el("div", { class: "banner warn", text: `${t("roleCompat.error")} ${state.runtime.roleCompatError}` }));
  } else if (state.runtime.roleCompat) {
    const rc = state.runtime.roleCompat;
    const rej = Array.isArray(rc.rejectedRoles) ? rc.rejectedRoles.length : 0;
    const acc = Array.isArray(rc.acceptedRoles) ? rc.acceptedRoles.length : 0;
    parts.push(
      el("div", { class: "banner ok" }, [
        el("div", { text: t("roleCompat.ok", { acc, rej }) }),
        rej > 0
          ? el("small", { class: "hint", text: t("roleCompat.ignored", { roles: rc.rejectedRoles.join(", ") }) })
          : null
      ])
    );
  }

  mount.innerHTML = "";
  for (const p of parts) mount.appendChild(p);
}
