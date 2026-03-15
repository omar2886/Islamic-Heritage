import { el } from "./dom.js";

export function radioGroup({ label, value, options, onChange, focusKey = "" }) {
  const items = options.map((opt) => {
    const id = `${label}_${opt.value}`;
    const input = el("input", {
      type: "radio",
      name: label,
      id,
      value: opt.value,
      ...(opt.value === value ? { checked: "checked" } : {}),
      ...(focusKey ? { "data-focus-key": `${focusKey}:${opt.value}` } : {}),
      onchange: (e) => onChange(e.target.value)
    });
    const lab = el("label", { for: id }, [opt.label]);

    return el("div", { class: "row" }, [input, lab]);
  });

  return el("div", { class: "field" }, [el("label", { text: label }), ...items]);
}

export function toggleField({ label, checked, onChange, disabled = false, hint = "", focusKey = "" }) {
  const id = `t_${label.replace(/\s+/g, "_")}`;
  const input = el("input", {
    type: "checkbox",
    id,
    ...(checked ? { checked: "checked" } : {}),
    ...(disabled ? { disabled: "disabled" } : {}),
    ...(focusKey ? { "data-focus-key": focusKey } : {}),
    onchange: (e) => onChange(!!e.target.checked)
  });
  const lab = el("label", { for: id }, [label]);

  return el("div", { class: "field" }, [
    el("div", { class: "row" }, [input, lab]),
    hint ? el("small", { class: "hint", text: hint }) : null
  ]);
}

export function numberField({
  label,
  value,
  min,
  max,
  onInput,
  hint = "",
  disabled = false,
  focusKey = ""
}) {
  const input = el("input", {
    type: "number",
    value: String(value),
    min: String(min),
    max: String(max),
    inputmode: "numeric",
    ...(disabled ? { disabled: "disabled" } : {}),
    ...(focusKey ? { "data-focus-key": focusKey } : {}),
    oninput: (e) => onInput(e.target.value)
  });
  return el("div", { class: "field" }, [
    el("label", { text: label }),
    input,
    hint ? el("small", { class: "hint", text: hint }) : null
  ]);
}

export function textField({
  label,
  value,
  placeholder,
  onInput,
  focusKey = "",
  inputMode = "",
  pattern = "",
  type = "text"
}) {
  const input = el("input", {
    type: String(type || "text"),
    value: String(value ?? ""),
    placeholder: String(placeholder || ""),
    ...(inputMode ? { inputmode: String(inputMode) } : {}),
    ...(pattern ? { pattern: String(pattern) } : {}),
    ...(focusKey ? { "data-focus-key": focusKey } : {}),
    oninput: (e) => onInput(e.target.value)
  });

  return el("div", { class: "field" }, [el("label", { text: label }), input]);
}
