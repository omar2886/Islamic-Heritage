import { el, setChildren, safeJson } from "./dom.js";

function kv(label, value, pretty) {
  return el("div", { class: "monoBox" }, [
    el("div", { class: "monoLabel", text: label }),
    el("pre", { class: "mono", text: safeJson(value, pretty) })
  ]);
}

function renderSnapshot(snapshot, pretty) {
  if (!snapshot) {
    return el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: "(no snapshot yet)" })]);
  }

  const meta = snapshot.meta || {};
  const diff = snapshot.diff || null;

  return el("div", {}, [
    kv("Meta", meta, pretty),
    kv("Adapter built payload", snapshot.adapterBuiltPayload, pretty),
    kv("Fetch sent payload", snapshot.fetchSentPayload, pretty),
    kv("Core normalized input", snapshot.coreNormalizedInput, pretty),
    diff ? kv("Diff", diff, pretty) : null
  ]);
}

function renderRoleCompat(state) {
  const rc = state.runtime.roleCompat;

  const row = (label, value) =>
    el("div", { class: "row" }, [el("div", { class: "monoLabel", text: label }), el("div", { class: "mono", text: value })]);

  if (state.runtime.roleCompatLoading) {
    return el("div", { class: "banner warn", text: "Role probe en progreso..." });
  }

  if (state.runtime.roleCompatError) {
    return el("div", { class: "banner warn", text: `Role probe error: ${state.runtime.roleCompatError}` });
  }

  if (!rc) {
    return el("div", { class: "banner warn", text: "Role probe: no ejecutado todavía." });
  }

  const acc = Array.isArray(rc.acceptedRoles) ? rc.acceptedRoles : [];
  const rej = Array.isArray(rc.rejectedRoles) ? rc.rejectedRoles : [];
  const norm = Array.isArray(rc.normalized) ? rc.normalized : [];

  return el("div", { class: "card" }, [
    el("h4", { text: "Compatibilidad roles (roles.php vs calc.php)" }),
    row("probedAt", rc.probedAt || "(unknown)"),
    row("accepted", String(acc.length)),
    row("rejected", String(rej.length)),
    rej.length ? el("pre", { class: "mono", text: rej.join("\n") }) : el("div", { class: "hint", text: "No mismatches detectados." }),
    norm.length ? el("pre", { class: "mono", text: norm.map((x) => `${x.from} -> ${x.to}`).join("\n") }) : null
  ]);
}

export function renderDebug(mount, state, roles, actions) {
  const pretty = !!state.ui.prettyJson;

  const parts = [];

  parts.push(
    el("div", { class: "row" }, [
      el("input", {
        id: "chkPretty",
        type: "checkbox",
        ...(pretty ? { checked: "checked" } : {}),
        onchange: (e) => actions.setPrettyJson(!!e.target.checked)
      }),
      el("label", { for: "chkPretty", text: "Pretty JSON" }),
      el("span", { class: "spacer" }),
      el("button", { onclick: () => actions.probeRoleCompat(), text: "Re-probar roles con calc.php" })
    ])
  );

  parts.push(el("h3", { text: "Snapshot" }));
  parts.push(renderSnapshot(state.runtime.snapshot, pretty));

  parts.push(el("h3", { text: "Roles (roles.php)" }));
  parts.push(el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(roles || null, pretty) })]));

  parts.push(el("h3", { text: "Role probe" }));
  parts.push(renderRoleCompat(state));

  parts.push(el("h3", { text: "Payload (last built)" }));
  parts.push(el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(state.runtime.lastPayload, pretty) })]));

  parts.push(el("h3", { text: "Respuesta (last)" }));
  parts.push(el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(state.runtime.lastResp, pretty) })]));

  setChildren(mount, parts.filter(Boolean));
}
