import { el, setChildren, safeJson } from "./dom.js";

const LABELS_ES = {
  // Core group labels (plural)
  wives: "Esposas",
  sons: "Hijos varones",
  daughters: "Hijas",
  sons_sons: "Nietos por hijo (varones)",
  sons_daughters: "Nietas por hijo",
  full_brothers: "Hermanos completos",
  full_sisters: "Hermanas completas",
  consanguine_brothers: "Hermanos por padre",
  consanguine_sisters: "Hermanas por padre",
  uterine_brothers: "Hermanos por madre",
  uterine_sisters: "Hermanas por madre",

  // Input roles (singular ids)
  father: "Padre",
  mother: "Madre",
  husband: "Esposo",
  wife: "Esposa",
  son: "Hijo varón",
  daughter: "Hija",
  sons_son: "Nieto por hijo (varón)",
  sons_daughter: "Nieta por hijo",
  paternal_grandfather: "Abuelo paterno",
  paternal_grandmother: "Abuela paterna",
  maternal_grandmother: "Abuela materna",
  paternal_uncle: "Tío paterno",
  consanguine_paternal_uncle: "Tío paterno (consanguíneo)",
  paternal_uncle_son: "Hijo de tío paterno",
  consanguine_paternal_uncle_son: "Hijo de tío paterno (consanguíneo)",
  paternal_uncles_daughter: "Hija de tíos paternos",
  consanguine_paternal_uncles_daughter: "Hija de tíos paternos (consanguíneos)",
  paternal_uncle_sons_daughter: "Hija del hijo del tío paterno",
  consanguine_paternal_uncle_sons_daughter: "Hija del hijo del tío paterno (consanguíneo)",
  full_brother: "Hermano completo",
  full_sister: "Hermana completa",
  consanguine_brother: "Hermano por padre",
  consanguine_sister: "Hermana por padre",
  uterine_brother: "Hermano por madre",
  uterine_sister: "Hermana por madre"
};

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

function labelEs(role) {
  return LABELS_ES[role] || role;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function fmtList(arr) {
  return arr.join(", ");
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
  // We want a human hint (FARD / ASABA / RADD / AWL). We do NOT infer fiqh,
  // only reflect what the engine exposes.
  const fixed = shares?.fixed?.groups || null;
  const asaba = shares?.asaba?.groups || null;

  if (fixed && Object.prototype.hasOwnProperty.call(fixed, finalKey)) return "FARD";
  if (asaba && Object.prototype.hasOwnProperty.call(asaba, finalKey)) return "ASABA";

  // Handle common pluralization differences between sections
  const mapPluralToSingular = { wives: "wives", sons: "son", daughters: "daughter" };
  const mapped = mapPluralToSingular[finalKey] || null;
  if (mapped && fixed && Object.prototype.hasOwnProperty.call(fixed, mapped)) return "FARD";
  if (mapped && asaba && Object.prototype.hasOwnProperty.call(asaba, mapped)) return "ASABA";

  // If engine exposes phase_ledger deltas we could refine, but keep conservative.
  return "";
}

function table(headers, rows, opts = {}) {
  const thead = el("thead", {}, [
    el("tr", {}, headers.map((h) => el("th", { text: h })))
  ]);
  const tbody = el("tbody", {}, rows);
  return el("table", { class: "resultsTable", ...(opts || {}) }, [thead, tbody]);
}

function rowCells(cells) {
  return el("tr", {}, cells.map((c) => el("td", c)));
}

function badge(text, kind) {
  const cls = kind ? `badge ${kind}` : "badge";
  return el("span", { class: cls, text });
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
    setChildren(mount, [el("div", { class: "banner warn", text: "Calculando..." })]);
    return;
  }

  if (state.runtime.lastError) {
    setChildren(mount, [el("div", { class: "banner error", text: state.runtime.lastError })]);
    return;
  }

  if (!r) {
    setChildren(mount, [el("div", { class: "banner", text: "Sin cálculo aún." })]);
    return;
  }

  if (r.ok !== true) {
    setChildren(mount, [
      el("div", { class: "banner error", text: r.error || "Respuesta ok=false" }),
      el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(r, state.ui.prettyJson) })])
    ]);
    return;
  }

  const output = r.output || {};
  const shares = output.shares || null;

  // Prefer final shares if present; else fall back to group_shares/individual_shares.
  const finalGroups = shares?.final?.groups || output.group_shares || {};
  const finalIndividuals = shares?.final?.individuals || output.individual_shares || {};
  const amountsByGroup = output.amounts_by_role || null;
  const amountsByInd = output.amounts_by_individual || null;

  const top = [];
  top.push(el("div", { class: "banner ok", text: "Resultado OK" }));

  // Main explanation banner (super short)
  if (shares?.fixed?.sumFixed || output.sum_fixed) {
    const sumFixed = shares?.fixed?.sumFixed || output.sum_fixed;
    const residual = shares?.normalized?.residualForAsaba || output.residual_before_asaba || null;
    const bits = [];
    if (sumFixed) bits.push(`Fard total: ${sumFixed}`);
    if (residual) bits.push(`Residual: ${residual}`);
    if (bits.length) top.push(el("div", { class: "hint", text: bits.join(" | ") }));
  }

  // Final table
  const finalRows = [];
  for (const [k, frac] of Object.entries(finalGroups)) {
    const n = countFromIndividuals(finalIndividuals, k) ?? getInputCount(output, k) ?? "";
    const indList = Array.isArray(finalIndividuals?.[k]) ? finalIndividuals[k] : null;

    let eachShare = "";
    let eachMode = "";
    if (indList && indList.length > 0) {
      const u = uniq(indList.map(String));
      if (u.length === 1) {
        eachShare = u[0];
        eachMode = "each";
      } else {
        eachShare = fmtList(u.slice(0, 6));
        if (u.length > 6) eachShare += "...";
        eachMode = "list";
      }
    }

    const tag = phaseTagFor(k, shares);

    const totalAmt = amountsByGroup && Object.prototype.hasOwnProperty.call(amountsByGroup, k) ? String(amountsByGroup[k]) : "";
    let eachAmt = "";
    const indAmtList = Array.isArray(amountsByInd?.[k]) ? amountsByInd[k] : null;
    if (indAmtList && indAmtList.length) {
      const u = uniq(indAmtList.map(String));
      if (u.length === 1) eachAmt = u[0];
      else {
        eachAmt = fmtList(u.slice(0, 6));
        if (u.length > 6) eachAmt += "...";
      }
    }

    finalRows.push(
      rowCells([
        { text: labelEs(k) },
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
    ["Parentesco", "N", "Total (grupo)", "Cada uno", "Total (importe)", "Cada uno (importe)", "Origen"],
    finalRows
  );

  const expl = [
    el("div", { class: "hint" }, [
      el("div", { text: "Interpretación:" }),
      el("ul", {}, [
        el("li", { text: "Total (grupo): fracción total asignada a ese conjunto de herederos (por ejemplo, 'Esposas 1/8')." }),
        el("li", { text: "Cada uno: si el core devuelve reparto individual, aquí aparece la fracción por persona (por ejemplo, 3 esposas: 1/24 cada una)." }),
        el("li", { text: "Origen: FARD si proviene de cuotas fijas; ASABA si proviene de residual. (AWL y RADD aparecerán reflejados en el desglose si se aplican)." })
      ])
    ])
  ];

  const blocks = [];

  // Breakdown: Fixed (Fard)
  if (shares?.fixed?.groups && isObj(shares.fixed.groups)) {
    const g = shares.fixed.groups;
    const i = shares.fixed.individuals || {};
    const rows = Object.entries(g).map(([k, v]) => {
      const ind = Array.isArray(i[k]) ? i[k] : null;
      const n = ind ? ind.length : (getInputCount(output, k) ?? "");
      const each = ind ? (uniq(ind.map(String)).length === 1 ? String(ind[0]) : fmtList(uniq(ind.map(String)))) : "";
      return rowCells([
        { text: labelEs(k) },
        { text: n === "" ? "" : String(n), class: "tdNum" },
        { text: String(v), class: "tdFrac" },
        { text: each, class: "tdFrac" }
      ]);
    });
    blocks.push(section(
      "Fard (cuotas fijas)",
      [
        table(["Parentesco", "N", "Total (grupo)", "Cada uno"], rows),
        shares.fixed.sumFixed ? el("div", { class: "hint", text: `Suma Fard: ${shares.fixed.sumFixed}` }) : null
      ].filter(Boolean),
      true
    ));
  }

  // Breakdown: Awl / Radd (from phase_ledger if any deltas)
  const ledger = Array.isArray(output?.meta?.phase_ledger) ? output.meta.phase_ledger : null;
  if (ledger) {
    const phases = ["AWL", "RADD"];
    for (const ph of phases) {
      const after = ledger.find((e) => e && e.phase === ph && e.action === "after");
      const delta = after?.delta;
      const hasDelta = delta && isObj(delta) && Object.keys(delta).length > 0;
      const title = ph === "AWL" ? "Awl (reducción proporcional)" : "Radd (retorno del residual)";
      if (hasDelta) {
        const rows = Object.entries(delta).map(([k, v]) => rowCells([{ text: labelEs(k) }, { text: String(v), class: "tdFrac" }]));
        blocks.push(section(title, [table(["Parentesco", "Delta"], rows)], false));
      } else {
        blocks.push(section(title, [el("div", { class: "hint", text: "No aplicado en este caso." })], false));
      }
    }
  }

  // Breakdown: Asaba
  if (shares?.asaba && (isObj(shares.asaba.groups) || Array.isArray(shares.asaba.notes))) {
    const g = shares.asaba.groups || {};
    const i = shares.asaba.individuals || {};
    const rows = Object.entries(g).map(([k, v]) => {
      const ind = Array.isArray(i[k]) ? i[k] : null;
      const n = ind ? ind.length : "";
      const each = ind ? (uniq(ind.map(String)).length === 1 ? String(ind[0]) : fmtList(uniq(ind.map(String)))) : "";
      return rowCells([
        { text: labelEs(k) },
        { text: n === "" ? "" : String(n), class: "tdNum" },
        { text: String(v), class: "tdFrac" },
        { text: each, class: "tdFrac" }
      ]);
    });

    const notes = Array.isArray(shares.asaba.notes)
      ? el("ul", {}, shares.asaba.notes.map((n) => el("li", { text: n?.reason || n?.note || safeJson(n, true) })))
      : null;

    blocks.push(section(
      "Asaba (residual)",
      [
        shares.normalized?.residualForAsaba ? el("div", { class: "hint", text: `Residual asignado: ${shares.normalized.residualForAsaba}` }) : null,
        table(["Parentesco", "N", "Total (grupo)", "Cada uno"], rows),
        notes ? el("div", { class: "hint" }, [el("div", { text: "Notas:" }), notes]) : null
      ].filter(Boolean),
      false
    ));
  }

  // Warnings and blocks
  const warnings = Array.isArray(output.warnings) ? output.warnings : [];
  const blocksApplied = Array.isArray(output?.audit?.blocks_applied) ? output.audit.blocks_applied : [];
  if (warnings.length || blocksApplied.length) {
    blocks.push(section(
      "Bloqueos (hajb) y avisos",
      [
        warnings.length
          ? el("div", {}, [
              el("div", { class: "hint", text: "Avisos del core:" }),
              el("ul", {}, warnings.map((w) => el("li", { text: String(w) })))
            ])
          : null,
        blocksApplied.length
          ? el("div", {}, [
              el("div", { class: "hint", text: "Bloqueos aplicados (audit):" }),
              el("ul", {}, blocksApplied.map((b) => el("li", { text: `${b.rule_id}: ${b.reason} -> ${Array.isArray(b.targets) ? b.targets.join(", ") : ""}` })))
            ])
          : null
      ].filter(Boolean),
      false
    ));
  }

  // Raw output (copyable) in results panel (keeps Debug as primary, but this helps users)
  blocks.push(section(
    "JSON (salida del core, copiable)",
    [el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: safeJson(output, state.ui.prettyJson) })])],
    false
  ));

  setChildren(mount, [...top, mainTable, ...expl, ...blocks]);
}
