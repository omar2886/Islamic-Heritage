import { el, setChildren, safeJson } from "./dom.js";
import { t } from "./i18n.js";

function kv(label, value, pretty) {
  return el("div", { class: "monoBox" }, [
    el("div", { class: "monoLabel", text: label }),
    el("pre", { class: "mono", text: safeJson(value, pretty) })
  ]);
}

function renderSnapshot(snapshot, pretty) {
  if (!snapshot) {
    return el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: t("debug.noSnapshot") })]);
  }

  const meta = snapshot.meta || {};
  const diff = snapshot.diff || null;

  return el("div", {}, [
    kv(t("debug.snapshot.meta"), meta, pretty),
    kv(t("debug.snapshot.built"), snapshot.adapterBuiltPayload, pretty),
    kv(t("debug.snapshot.sent"), snapshot.fetchSentPayload, pretty),
    kv(t("debug.snapshot.normalized"), snapshot.coreNormalizedInput, pretty),
    diff ? kv(t("debug.snapshot.diff"), diff, pretty) : null
  ]);
}

function renderRoleCompat(state) {
  const rc = state.runtime.roleCompat;

  const row = (label, value) =>
    el("div", { class: "row" }, [
      el("div", { class: "monoLabel", text: label }),
      el("div", { class: "mono", text: value })
    ]);

  if (state.runtime.roleCompatLoading) {
    return el("div", { class: "banner warn", text: t("debug.roleProbe.loading") });
  }

  if (state.runtime.roleCompatError) {
    return el("div", { class: "banner warn", text: `${t("debug.roleProbe.error")} ${state.runtime.roleCompatError}` });
  }

  if (!rc) {
    return el("div", { class: "banner warn", text: t("debug.roleProbe.none") });
  }

  const acc = Array.isArray(rc.acceptedRoles) ? rc.acceptedRoles : [];
  const rej = Array.isArray(rc.rejectedRoles) ? rc.rejectedRoles : [];
  const norm = Array.isArray(rc.normalized) ? rc.normalized : [];

  return el("div", { class: "card" }, [
    el("h4", { text: t("debug.roleProbe.title") }),
    row(t("debug.roleProbe.probedAt"), rc.probedAt || t("debug.unknown")),
    row(t("debug.roleProbe.accepted"), String(acc.length)),
    row(t("debug.roleProbe.rejected"), String(rej.length)),
    rej.length
      ? el("pre", { class: "mono", text: rej.join("\n") })
      : el("div", { class: "hint", text: t("debug.roleProbe.noMismatches") }),
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
      el("label", { for: "chkPretty", text: t("debug.prettyJson") }),
      el("span", { class: "spacer" }),
      el("button", { onclick: () => actions.probeRoleCompat(), text: t("debug.roleProbe.button") })
    ])
  );

  parts.push(el("h3", { text: t("debug.section.snapshot") }));
  parts.push(renderSnapshot(state.runtime.snapshot, pretty));

  parts.push(el("h3", { text: t("debug.section.roles") }));
  parts.push(el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(roles || null, pretty) })]));

  parts.push(el("h3", { text: t("debug.section.roleProbe") }));
  parts.push(renderRoleCompat(state));

  parts.push(el("h3", { text: t("debug.section.payload") }));
  parts.push(el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(state.runtime.lastPayload, pretty) })]));

  parts.push(el("h3", { text: t("debug.section.response") }));
  parts.push(el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(state.runtime.lastResp, pretty) })]));

  setChildren(mount, parts.filter(Boolean));
}
