import { el, setChildren, safeJson } from "./dom.js";
import { t } from "./i18n.js";

const GROUP_TO_INPUT_CANDIDATES = {
  wives: ["wives", "wife"],
  sons: ["son"],
  daughters: ["daughter"],
  sons_sons: ["sons_son"],
  sons_daughters: ["sons_daughter"],
  full_brothers: ["full_brother"],
  full_sisters: ["full_sister"],
  consanguine_brothers: ["consanguine_brother"],
  consanguine_sisters: ["consanguine_sister"],
  uterine_brothers: ["uterine_brother"],
  uterine_sisters: ["uterine_sister"]
};

function label(key) {
  const k = `label.${key}`;
  const v = t(k);
  return v === k ? key : v;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function fmtList(arr) {
  return arr.join(", ");
}

function fmtValueCounts(arr) {
  const counts = new Map();
  for (const raw of arr) {
    const v = String(raw);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const parts = [];
  for (const [v, c] of counts.entries()) parts.push(c > 1 ? `${v} x${c}` : v);
  return parts.join(", ");
}

function isObj(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function getInputCount(output, groupLabel) {
  const inputHeirs = output?.input?.heirs;
  if (!Array.isArray(inputHeirs)) return null;

  const candidates = GROUP_TO_INPUT_CANDIDATES[groupLabel] || [groupLabel];
  for (const cand of candidates) {
    const hit = inputHeirs.find((h) => h && h.role === cand);
    if (hit && typeof hit.count === "number") return hit.count;
    if (hit && typeof hit.count === "string" && hit.count.trim() !== "") {
      const n = Number(hit.count);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function countFromIndividuals(individuals, groupLabel) {
  const v = individuals?.[groupLabel];
  if (Array.isArray(v)) return v.length;
  return null;
}

function phaseTagFor(finalKey, shares) {
  const fixed = shares?.fixed?.groups || null;
  const asaba = shares?.asaba?.groups || null;

  if (fixed && Object.prototype.hasOwnProperty.call(fixed, finalKey)) return "FARD";
  if (asaba && Object.prototype.hasOwnProperty.call(asaba, finalKey)) return "ASABA";

  const mapPluralToSingular = { wives: "wives", sons: "son", daughters: "daughter" };
  const mapped = mapPluralToSingular[finalKey] || null;
  if (mapped && fixed && Object.prototype.hasOwnProperty.call(fixed, mapped)) return "FARD";
  if (mapped && asaba && Object.prototype.hasOwnProperty.call(asaba, mapped)) return "ASABA";

  return "";
}

function table(headers, rows, opts = {}) {
  const thead = el("thead", {}, [el("tr", {}, headers.map((h) => el("th", { text: h })))]);
  const tbody = el("tbody", {}, rows);
  return el("table", { class: "resultsTable", ...(opts || {}) }, [thead, tbody]);
}

function rowCells(cells) {
  return el("tr", {}, cells.map((c) => el("td", c)));
}

function section(title, bodyNodes, open = false) {
  return el("details", { class: "section", open: open ? "open" : null }, [
    el("summary", { text: title }),
    el("div", { class: "sectionBody" }, bodyNodes)
  ]);
}

export function renderResult(mount, state) {
  const r = state.runtime.lastResponse;

  if (state.runtime.isLoading) {
    setChildren(mount, [el("div", { class: "banner warn", text: t("results.loading") })]);
    return;
  }

  if (state.runtime.lastError) {
    setChildren(mount, [el("div", { class: "banner error", text: state.runtime.lastError })]);
    return;
  }

  if (!r) {
    setChildren(mount, [el("div", { class: "banner", text: t("results.none") })]);
    return;
  }

  if (r.ok !== true) {
    setChildren(mount, [
      el("div", { class: "banner error", text: r.error || "ok=false" }),
      el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(r, state.ui.prettyJson) })])
    ]);
    return;
  }

  const output = r.output || {};
  const shares = output.shares || null;

  const finalGroups = shares?.final?.groups || output.group_shares || {};
  const finalIndividuals = shares?.final?.individuals || output.individual_shares || {};
  const amountsByGroup = output.amounts_by_role || null;
  const amountsByInd = output.amounts_by_individual || null;

  const top = [el("div", { class: "banner ok", text: t("results.ok") })];

  if (shares?.fixed?.sumFixed || output.sum_fixed) {
    const sumFixed = shares?.fixed?.sumFixed || output.sum_fixed;
    const residual = shares?.normalized?.residualForAsaba || output.residual_before_asaba || null;
    const bits = [];
    if (sumFixed) bits.push(`${t("results.fardTotal")}: ${sumFixed}`);
    if (residual) bits.push(`${t("results.residual")}: ${residual}`);
    if (bits.length) top.push(el("div", { class: "hint", text: bits.join(" | ") }));
  }

  const finalRows = [];
  for (const [k, frac] of Object.entries(finalGroups)) {
    const n = countFromIndividuals(finalIndividuals, k) ?? getInputCount(output, k) ?? "";
    const indList = Array.isArray(finalIndividuals?.[k]) ? finalIndividuals[k] : null;

    let eachShare = "";
    if (indList && indList.length > 0) {
      const u = uniq(indList.map(String));
      if (u.length === 1) eachShare = u[0];
      else {
        eachShare = fmtList(u.slice(0, 6));
        if (u.length > 6) eachShare += "...";
      }
    }

    const tag = phaseTagFor(k, shares);
    const totalAmt = amountsByGroup && Object.prototype.hasOwnProperty.call(amountsByGroup, k) ? String(amountsByGroup[k]) : "";
    let eachAmt = "";
    const indAmtList = Array.isArray(amountsByInd?.[k]) ? amountsByInd[k] : null;
    if (indAmtList && indAmtList.length) {
      const summary = fmtValueCounts(indAmtList.map(String));
      const parts = summary.split(", ");
      eachAmt = parts.length <= 6 ? summary : parts.slice(0, 6).join(", ") + "...";
    }

    finalRows.push(
      rowCells([
        { text: label(k) },
        { text: n === "" ? "" : String(n), class: "tdNum" },
        { text: String(frac), class: "tdFrac" },
        { text: eachShare, class: "tdFrac" },
        { text: totalAmt, class: "tdNum" },
        { text: eachAmt, class: "tdNum" },
        { text: tag, class: "tdTag" }
      ])
    );
  }

  const mainTable = table(
    [
      t("results.col.relationship"),
      t("results.col.n"),
      t("results.col.groupShare"),
      t("results.col.eachShare"),
      t("results.col.groupAmount"),
      t("results.col.eachAmount"),
      t("results.col.origin")
    ],
    finalRows
  );

  const expl = el("div", { class: "hint" }, [
    el("div", { text: t("results.interpretation") }),
    el("ul", {}, [
      el("li", { text: t("results.help.groupTotal") }),
      el("li", { text: t("results.help.each") }),
      el("li", { text: t("results.help.origin") })
    ])
  ]);

  const blocks = [];

  // Fixed
  if (shares?.fixed?.groups && isObj(shares.fixed.groups)) {
    const g = shares.fixed.groups;
    const i = shares.fixed.individuals || {};
    const rows = Object.entries(g).map(([k, v]) => {
      const ind = Array.isArray(i[k]) ? i[k] : null;
      const n = ind ? ind.length : getInputCount(output, k) ?? "";
      const each = ind ? (uniq(ind.map(String)).length === 1 ? String(ind[0]) : fmtList(uniq(ind.map(String)))) : "";
      return rowCells([
        { text: label(k) },
        { text: n === "" ? "" : String(n), class: "tdNum" },
        { text: String(v), class: "tdFrac" },
        { text: each, class: "tdFrac" }
      ]);
    });
    blocks.push(
      section(
        t("results.section.fixed"),
        [
          table([t("results.col.relationship"), t("results.col.n"), t("results.col.groupShare"), t("results.col.eachShare")], rows),
          shares.fixed.sumFixed ? el("div", { class: "hint", text: `${t("results.sum")} ${shares.fixed.sumFixed}` }) : null
        ].filter(Boolean),
        true
      )
    );
  }

  // Awl / Radd via ledger
  const ledger = Array.isArray(output?.meta?.phase_ledger) ? output.meta.phase_ledger : null;
  if (ledger) {
    const phases = ["AWL", "RADD"];
    for (const ph of phases) {
      const after = ledger.find((e) => e && e.phase === ph && e.action === "after");
      const delta = after?.delta;
      const hasDelta = delta && isObj(delta) && Object.keys(delta).length > 0;
      const title = ph === "AWL" ? t("results.section.awl") : t("results.section.radd");
      if (hasDelta) {
        const rows = Object.entries(delta).map(([k, v]) =>
          rowCells([{ text: label(k) }, { text: String(v), class: "tdFrac" }])
        );
        blocks.push(section(title, [table([t("results.col.relationship"), t("results.col.delta")], rows)], false));
      } else {
        blocks.push(section(title, [el("div", { class: "hint", text: t("results.notApplied") })], false));
      }
    }
  }

  // Asaba
  if (shares?.asaba && (isObj(shares.asaba.groups) || Array.isArray(shares.asaba.notes))) {
    const g = shares.asaba.groups || {};
    const i = shares.asaba.individuals || {};
    const rows = Object.entries(g).map(([k, v]) => {
      const ind = Array.isArray(i[k]) ? i[k] : null;
      const n = ind ? ind.length : "";
      const each = ind ? (uniq(ind.map(String)).length === 1 ? String(ind[0]) : fmtList(uniq(ind.map(String)))) : "";
      return rowCells([
        { text: label(k) },
        { text: n === "" ? "" : String(n), class: "tdNum" },
        { text: String(v), class: "tdFrac" },
        { text: each, class: "tdFrac" }
      ]);
    });

    const notes = Array.isArray(shares.asaba.notes)
      ? el("ul", {}, shares.asaba.notes.map((n) => el("li", { text: n?.reason || n?.note || safeJson(n, true) })))
      : null;

    blocks.push(
      section(
        t("results.section.asaba"),
        [
          shares.normalized?.residualForAsaba
            ? el("div", { class: "hint", text: `${t("results.residualAssigned")} ${shares.normalized.residualForAsaba}` })
            : null,
          table([t("results.col.relationship"), t("results.col.n"), t("results.col.groupShare"), t("results.col.eachShare")], rows),
          notes ? el("div", { class: "hint" }, [el("div", { text: t("results.notes") }), notes]) : null
        ].filter(Boolean),
        false
      )
    );
  }

  // Blocks and warnings
  const warnings = Array.isArray(output.warnings) ? output.warnings : [];
  const blocksApplied = Array.isArray(output?.audit?.blocks_applied) ? output.audit.blocks_applied : [];
  if (warnings.length || blocksApplied.length) {
    const renderBlock = (b) => {
      const reason = b && b.reason != null ? String(b.reason) : "";
      const targets = Array.isArray(b?.targets) ? b.targets.map(String) : [];
      const tail = targets.length ? ` (${t("results.blocks.affects")} ${targets.join(", ")})` : "";
      return el("li", { text: `${reason}${tail}` });
    };

    blocks.push(
      section(
        t("results.section.blocks"),
        [
          warnings.length
            ? el("div", {}, [
                el("div", { class: "hint", text: t("results.warnings") }),
                el("ul", {}, warnings.map((w) => el("li", { text: String(w) })))
              ])
            : null,
          blocksApplied.length
            ? el("div", {}, [
                el("div", { class: "hint", text: t("results.blocksApplied") }),
                el("ul", {}, blocksApplied.map(renderBlock))
              ])
            : null
        ].filter(Boolean),
        false
      )
    );
  }

  blocks.push(
    section(
      t("results.section.json"),
      [el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(output, state.ui.prettyJson) })])],
      false
    )
  );

  setChildren(mount, [...top, mainTable, expl, ...blocks]);
}
