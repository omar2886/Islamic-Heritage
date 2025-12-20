import { runCalc } from "../actions/calc.js";

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function formatCell(value){
  if (value === null || value === undefined || value === "") return "-";
  return escapeHtml(String(value));
}

function safeObject(candidate){
  return candidate && typeof candidate === "object" ? candidate : null;
}

function parseFractionToNumber(fracStr){
  if (fracStr === null || fracStr === undefined) return null;
  if (typeof fracStr === "number" && Number.isFinite(fracStr)) return fracStr;
  const raw = String(fracStr).trim();
  if (!raw) return null;

  if (raw.includes("/")){
    const [numStr, denStr] = raw.split("/");
    const num = Number(numStr);
    const den = Number(denStr);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0){
      return num / den;
    }
  }

  const asNum = Number(raw);
  return Number.isFinite(asNum) ? asNum : null;
}

function fractionToPercentString(fracStr){
  const num = parseFractionToNumber(fracStr);
  if (num === null) return "-";
  return `${(num * 100).toFixed(2)}%`;
}

function normalizeFractionValue(value){
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value.fraction !== undefined){
    return value.fraction;
  }
  const str = String(value).trim();
  return str ? str : null;
}

function formatMoney(value, currency){
  if (value === null || value === undefined) return null;
  if (typeof value === "object"){
    if (value.formatted) return String(value.formatted).trim();
    if (Object.prototype.hasOwnProperty.call(value, "value")) return formatMoney(value.value, value.currency || currency);
    if (Object.prototype.hasOwnProperty.call(value, "amount")) return formatMoney(value.amount, value.currency || currency);
  }
  const base = String(value).trim();
  if (!base) return null;
  return currency ? `${base} ${currency}` : base;
}

function hasAmountValue(value){
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return true;
  if (typeof value === "object"){
    const nested = extractAmountValue(value);
    if (nested !== null && nested !== undefined) return hasAmountValue(nested);
    return false;
  }
  return String(value).trim() !== "";
}

function extractAmountValue(entry){
  if (!entry || typeof entry !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(entry, "amount")) return entry.amount;
  if (Object.prototype.hasOwnProperty.call(entry, "value")) return entry.value;
  if (Object.prototype.hasOwnProperty.call(entry, "money")) return entry.money;
  return null;
}

function aggregateAmountFromEntries(entries){
  const list = Array.isArray(entries) ? entries : [entries];
  const collected = [];

  list.forEach((entry) => {
    const target = entry && typeof entry === "object" && entry.share ? entry.share : entry;
    const amountVal = extractAmountValue(target);
    if (amountVal !== null && amountVal !== undefined) collected.push(amountVal);
  });

  if (!collected.length) return null;

  const numeric = collected.map((val) => Number(val)).filter((num) => Number.isFinite(num));
  if (numeric.length === collected.length && numeric.length > 0){
    return numeric.reduce((acc, num) => acc + num, 0);
  }

  return collected[0];
}

function hasAnyAmountInCollection(map){
  if (!map || typeof map !== "object") return false;
  return Object.values(map).some((val) => {
    if (Array.isArray(val)) return val.some((item) => hasAmountValue(item));
    return hasAmountValue(val);
  });
}

function pickAmountsByRole(output){
  const candidates = [
    safeObject(output?.amounts_by_role),
    safeObject(output?.amounts?.amounts_by_role),
    safeObject(output?.shares?.amounts_by_role),
  ];

  for (const candidate of candidates){
    if (candidate && Object.keys(candidate).length) return candidate;
  }

  return null;
}

function pickEstateValue(output){
  if (!output || typeof output !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(output, "estate_value")) return output.estate_value;
  if (Object.prototype.hasOwnProperty.call(output?.amounts || {}, "estate_value")) return output.amounts.estate_value;
  if (Object.prototype.hasOwnProperty.call(output?.meta || {}, "estate_value")) return output.meta.estate_value;
  return null;
}

function collectMessages(containers, keys){
  const out = [];
  containers.forEach((item) => {
    if (!item || typeof item !== "object") return;
    keys.forEach((key) => {
      const val = item[key];
      if (!val && val !== 0) return;
      if (Array.isArray(val)){
        val.forEach((entry) => {
          const str = entry === null || entry === undefined ? "" : String(entry);
          if (str.trim()) out.push(str.trim());
        });
        return;
      }
      const str = String(val).trim();
      if (str) out.push(str);
    });
  });
  return out;
}

function aggregateFractions(arr){
  if (!Array.isArray(arr) || !arr.length) return null;
  const normalized = arr
    .map((item) => normalizeFractionValue(item))
    .filter((item) => item !== null);
  if (!normalized.length) return null;

  const parsed = normalized
    .map((item) => parseFractionToNumber(item))
    .filter((num) => num !== null);
  if (parsed.length === normalized.length && parsed.length > 0){
    const sum = parsed.reduce((acc, num) => acc + num, 0);
    return String(sum);
  }

  return normalized[0];
}

function roleCount(role, peopleByRole, individualShares){
  if (Array.isArray(peopleByRole?.[role])) return peopleByRole[role].length;
  if (Array.isArray(individualShares?.[role])) return individualShares[role].length;
  return null;
}

function buildIndividuals(role, peopleByRole, individualShares, amountsByIndividual, currency){
  const shares = Array.isArray(individualShares?.[role]) ? individualShares[role] : null;
  if (!shares || !shares.length) return [];
  const names = Array.isArray(peopleByRole?.[role]) ? peopleByRole[role] : [];
  const amounts = Array.isArray(amountsByIndividual?.[role]) ? amountsByIndividual[role] : [];

  return shares.map((fractionEntry, idx) => {
    const fraction = normalizeFractionValue(fractionEntry);
    const person = names[idx];
    const label = person && typeof person === "object" && person.name ? person.name : `${role} #${idx + 1}`;
    const amountRaw = amounts[idx];
    return {
      label,
      fraction,
      percent: fractionToPercentString(fraction),
      amount: formatMoney(amountRaw, currency),
    };
  });
}

function buildShare(role, fraction, amountRaw, ctx){
  const { currency, peopleByRole, individualShares, amountsByIndividual } = ctx;
  const individuals = buildIndividuals(role, peopleByRole, individualShares, amountsByIndividual, currency);
  return {
    role,
    count: roleCount(role, peopleByRole, individualShares),
    groupFraction: fraction ?? null,
    groupPercent: fractionToPercentString(fraction),
    groupAmount: formatMoney(amountRaw, currency),
    individuals: individuals.length ? individuals : undefined,
  };
}

function buildSharesByRole(output, raw){
  if (!output || typeof output !== "object"){
    return { shares: [], hasAmountColumn: false, estateValue: null, currency: null };
  }

  const currency = output.currency ?? raw?.currency ?? null;
  const peopleByRole = safeObject(output.people_by_role) || {};
  const individualShares = safeObject(output.individual_shares) || null;
  const amountsByIndividual =
    safeObject(output.amounts_by_individual) ||
    safeObject(output?.amounts?.amounts_by_individual) ||
    safeObject(output?.shares?.amounts_by_individual) ||
    null;
  const amountsByRole = pickAmountsByRole(output);
  const estateValue = pickEstateValue(output);

  const ctx = { currency, peopleByRole, individualShares, amountsByIndividual };
  const shares = [];
  let hasAmountData = hasAnyAmountInCollection(amountsByRole) || hasAnyAmountInCollection(amountsByIndividual);

  const groupShares = safeObject(output.group_shares);
  if (groupShares && Object.keys(groupShares).length){
    Object.entries(groupShares).forEach(([role, fraction]) => {
      const normalizedFraction = normalizeFractionValue(fraction);
      const amountFromShare = aggregateAmountFromEntries(fraction);
      const amount = amountsByRole && Object.prototype.hasOwnProperty.call(amountsByRole, role) ? amountsByRole[role] : amountFromShare;
      if (hasAmountValue(amount)) hasAmountData = true;
      shares.push(buildShare(role, normalizedFraction, amount, ctx));
    });
    if (shares.length) return { shares, hasAmountColumn: hasAmountData, estateValue, currency };
  }

  const shareGroups = safeObject(output.shares?.final?.groups);
  if (shareGroups && Object.keys(shareGroups).length){
    Object.entries(shareGroups).forEach(([role, fractions]) => {
      const fraction = aggregateFractions(fractions);
      const shareAmount = aggregateAmountFromEntries(fractions);
      const amount = amountsByRole && Object.prototype.hasOwnProperty.call(amountsByRole, role) ? amountsByRole[role] : shareAmount;
      if (hasAmountValue(amount)) hasAmountData = true;
      shares.push(buildShare(role, fraction, amount, ctx));
    });
    if (shares.length) return { shares, hasAmountColumn: hasAmountData, estateValue, currency };
  }

  return { shares: [], hasAmountColumn: hasAmountData, estateValue, currency };
}

export function normalizeCalcResponse(response){
  const raw = response ?? null;
  const output = raw && raw.output && typeof raw.output === "object" ? raw.output : null;
  const containers = [raw, output];
  const errors = collectMessages(containers, ["errors", "error"]);
  const warnings = collectMessages(containers, ["warnings", "warning"]);
  const shareResult = buildSharesByRole(output, raw);
  const ok = typeof raw?.ok === "boolean" ? raw.ok : raw?.status === "ok" ? true : errors.length === 0;

  return {
    ok,
    output,
    errors,
    warnings,
    sharesByRole: shareResult.shares,
    hasAmounts: shareResult.hasAmountColumn,
    estateValue: shareResult.estateValue,
    currency: shareResult.currency,
    raw,
  };
}

function renderMessageBlock(title, items, tone){
  if (!items || !items.length) return "";
  const badgeClass = tone === "error" ? "badge badge-error" : "badge badge-warn";
  return `
    <section class="card card-pad stack ${tone === "error" ? "card-error" : "card-warn"}">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <strong>${escapeHtml(title)}</strong>
        <span class="${badgeClass}">${items.length}</span>
      </div>
      <ul class="wizard-list">
        ${items.map((item) => `<li>${formatCell(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderIndividualsBlock(individuals, hasAmountColumn){
  if (!individuals || !individuals.length) return "";
  const header = `
    <tr>
      <th>Persona</th>
      <th>Fracción</th>
      <th>Porcentaje</th>
      ${hasAmountColumn ? `<th>Importe</th>` : ""}
    </tr>
  `;
  const rows = individuals.map((ind) => `
    <tr>
      <td>${formatCell(ind.label)}</td>
      <td>${formatCell(ind.fraction)}</td>
      <td>${formatCell(ind.percent)}</td>
      ${hasAmountColumn ? `<td>${formatCell(ind.amount)}</td>` : ""}
    </tr>
  `).join("");

  return `
    <tr class="results-individuals">
      <td colspan="${hasAmountColumn ? 4 : 3}">
        <details open class="results-details">
          <summary>Detalle individual</summary>
          <table class="results-table results-table-nested">
            <thead>${header}</thead>
            <tbody>${rows}</tbody>
          </table>
        </details>
      </td>
    </tr>
  `;
}

function renderShareTable(shares, hasAmountColumn, estateValue, currency){
  if (!shares || !shares.length) return "";
  const estateValueDisplay = formatMoney(estateValue, currency);
  const header = `
    <tr>
      <th>Rol</th>
      <th>Fracción</th>
      <th>Porcentaje</th>
      ${hasAmountColumn ? `<th>Importe</th>` : ""}
    </tr>
  `;

  const body = shares.map((share) => {
    const amountCell = hasAmountColumn ? `<td>${formatCell(share.groupAmount)}</td>` : "";
    const countHint = typeof share.count === "number" ? `<div class="wizard-hint" style="margin-top:4px;">${share.count} persona${share.count === 1 ? "" : "s"}</div>` : "";
    const individualsRow = renderIndividualsBlock(share.individuals, hasAmountColumn);
    return `
      <tr>
        <td>${formatCell(share.role)}${countHint}</td>
        <td>${formatCell(share.groupFraction)}</td>
        <td>${formatCell(share.groupPercent)}</td>
        ${amountCell}
      </tr>
      ${individualsRow}
    `;
  }).join("");

  return `
    <div class="stack">
      <h3 style="margin:0;">Distribución</h3>
      ${estateValueDisplay ? `<p class="wizard-hint" style="margin:0;">Valor de la herencia: <strong>${formatCell(estateValueDisplay)}</strong></p>` : ""}
      <table class="results-table">
        <thead>${header}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function normalizeListEntries(list){
  if (!Array.isArray(list) || !list.length) return [];
  return list.map((item) => {
    if (item === null || item === undefined) return null;
    if (typeof item === "string") return item.trim() || null;
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    if (typeof item === "object"){
      if (typeof item.label === "string" && item.label.trim()) return item.label.trim();
      if (typeof item.reason === "string" && item.reason.trim()) return item.reason.trim();
      if (typeof item.message === "string" && item.message.trim()) return item.message.trim();
      try{
        return JSON.stringify(item);
      }catch(err){
        return null;
      }
    }
    return String(item);
  }).filter((item) => typeof item === "string" && item.trim().length);
}

function collectGuardList(source, key){
  if (!source || typeof source !== "object") return [];
  const buckets = [
    source?.[key],
    source?.audit?.[key],
    source?.trace?.[key],
    source?.traces?.[key],
  ];
  const merged = [];
  buckets.forEach((bucket) => {
    const normalized = normalizeListEntries(bucket);
    if (normalized.length) merged.push(...normalized);
  });
  return merged;
}

function collectInvariants(source){
  if (!source || typeof source !== "object") return [];
  const inv = source.invariants;

  if (!inv) return [];

  // Caso A: objeto { key: boolean|string|number }
  if (typeof inv === "object" && !Array.isArray(inv)){
    return Object.entries(inv).map(([k, v]) => {
      const val = (v === true) ? "true" : (v === false) ? "false" : String(v);
      return `${k}: ${val}`;
    });
  }

  // Caso B: array
  if (Array.isArray(inv)){
    return inv.map((x) => {
      if (x === null || x === undefined) return null;
      if (typeof x === "string" && x.trim()) return x.trim();
      try { return JSON.stringify(x); } catch (e) { return String(x); }
    }).filter(Boolean);
  }

  // Caso C: scalar
  return [String(inv)];
}

function collectBlocksApplied(source){
  if (!source || typeof source !== "object") return [];
  const arr = source?.audit?.blocks_applied;

  if (!arr) return [];
  if (!Array.isArray(arr)) return [String(arr)];

  return arr.map((x) => {
    if (x === null || x === undefined) return null;
    if (typeof x === "string" && x.trim()) return x.trim();
    if (typeof x === "object"){
      // Prioriza fields comunes si existen
      const code = typeof x.code === "string" ? x.code.trim() : "";
      const msg = typeof x.message === "string" ? x.message.trim() : "";
      if (code && msg) return `${code}: ${msg}`;
      if (code) return code;
      if (msg) return msg;
      try { return JSON.stringify(x); } catch (e) { return null; }
    }
    return String(x);
  }).filter(Boolean);
}

function collectAssertionsFailed(source){
  if (!source || typeof source !== "object") return [];
  const bucket = source?.meta?.assertions_failed;
  return normalizeListEntries(bucket);
}

function renderExplainSteps(source){
  const explain = source && typeof source === "object" ? source : null;
  const steps = explain && typeof explain === "object" ? explain.steps : null;
  if (!Array.isArray(steps) || !steps.length) return "";

  const rows = steps.map((st, idx) => {
    const stage = st && typeof st.stage === "string" ? st.stage : "";
    const rule  = st && typeof st.rule === "string" ? st.rule : "";
    const note  = st && typeof st.note === "string" ? st.note : "";

    const changesObj = st && typeof st.changes === "object" && st.changes ? st.changes : null;
    const changes = changesObj && !Array.isArray(changesObj) ? Object.entries(changesObj) : [];
    const changesHtml = changes.length ? `
      <ul class="wizard-list" style="margin-top:6px;">
        ${changes.map(([k, v]) => {
          const before = v && typeof v === "object" && v.before !== undefined ? String(v.before) : "";
          const after  = v && typeof v === "object" && v.after  !== undefined ? String(v.after)  : "";
          const line = (before || after) ? `${k}: ${before} -> ${after}` : `${k}: ${formatCell(v)}`;
          return `<li>${formatCell(line)}</li>`;
        }).join("")}
      </ul>
    ` : "";

    return `
      <li>
        <div class="row" style="justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <strong>${escapeHtml(stage || `STEP ${idx + 1}`)}</strong>
          <span class="badge">${escapeHtml(rule || "")}</span>
        </div>
        ${note ? `<div class="wizard-hint" style="margin-top:6px;">${escapeHtml(note)}</div>` : ""}
        ${changesHtml}
      </li>
    `;
  }).join("");

  return `
    <section class="card card-pad stack">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <strong>Explicación</strong>
        <span class="badge">${steps.length}</span>
      </div>
      <ul class="wizard-list">
        ${rows}
      </ul>
    </section>
  `;
}

function renderGuardSection(title, items){
  if (!items || !items.length) return "";
  return `
    <section class="card card-pad stack">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <strong>${escapeHtml(title)}</strong>
        <span class="badge">${items.length}</span>
      </div>
      <ul class="wizard-list">
        ${items.map((item) => `<li>${formatCell(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderJsonDetails(title, data){
  if (!data) return "";
  return `
    <details class="results-details">
      <summary>${escapeHtml(title)}</summary>
      <pre class="codebox" style="margin-top:10px;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    </details>
  `;
}

export function renderResults(state){
  const results = state.results || {};
  const builderReady = Boolean(state.builder?.payloadPreview);
  const response = results.response && typeof results.response === "object" ? results.response : null;
  const normalized = response ? normalizeCalcResponse(response) : null;

  const shareRows = results.status === "ok" && builderReady ? normalized?.sharesByRole || [] : [];
  const output = normalized?.output && typeof normalized.output === "object" ? normalized.output : null;

  // Fuente única para diagnósticos: a veces vienen en output, a veces en raíz.
  const source = output || response;

  const auditBlock = source?.audit || null;
  const traceBlock = source?.trace || source?.traces || null;
  const explainData = source?.explain || null;
  const errorsList = normalized?.errors || [];
  const warningsList = normalized?.warnings || [];
  const rawResponseError = response && typeof response.error === "string" ? response.error : null;
  const hasAmounts = Boolean(normalized?.hasAmounts);
  const estateValue = normalized?.estateValue ?? null;
  const currency = normalized?.currency ?? null;
  const exclusionsList = collectGuardList(source, "exclusions");
  const blocksList = collectGuardList(source, "blocks");
  const invariantsList = collectInvariants(source);
  const blocksAppliedList = collectBlocksApplied(source);
  const assertionsFailedList = collectAssertionsFailed(source);

  // FIX: usar explainData (output OR response)
  const explainBlock = renderExplainSteps(explainData);
  const explainDetails = explainBlock ? "" : renderJsonDetails("Explain", explainData || null);

  const statusBadge = results.status === "running" ? `<span class="badge">Calculando...</span>` : "";

  return `
    <section class="stack">
      <div class="card card-pad row" style="justify-content:space-between; gap:12px; align-items:center;">
        <div class="stack">
          <h1 style="margin:0;">Results Viewer</h1>
          <p class="wizard-hint" style="margin:0;">Envía el payload del builder a calc.php y muestra la respuesta real.</p>
        </div>
        <div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">
          ${statusBadge}
          <button class="btn" type="button" id="results-run" ${!builderReady || results.status === "running" ? "disabled" : ""}>Calcular ahora</button>
        </div>
      </div>

      ${!builderReady ? `
        <section class="card card-pad stack">
          <h3 style="margin:0;">Completa builder primero</h3>
          <p class="wizard-hint" style="margin:0;">No hay payload para enviar a calc.php. Vuelve y añade al menos un heredero.</p>
          <div class="row" style="gap:8px; flex-wrap:wrap;">
            <a class="btn" href="#/builder">Volver al builder</a>
          </div>
        </section>
      ` : `
        ${results.status === "error" ? `
          <section class="card card-pad stack">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <strong>Error en cálculo</strong>
              <span class="badge">Status: error</span>
            </div>
            <p style="margin:0; color:var(--muted); line-height:1.4;">${escapeHtml(results.error || "Error desconocido")}</p>
            ${rawResponseError ? `<p style="margin:0;">${escapeHtml(rawResponseError)}</p>` : ""}
            ${response ? `<pre class="codebox">${escapeHtml(JSON.stringify(response, null, 2))}</pre>` : ""}
          </section>
        ` : ""}

        ${results.status === "ok" ? `
          <section class="card card-pad stack">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <strong>Respuesta de calc.php</strong>
              ${results.lastRunAt ? `<span class="wizard-hint">Última ejecución: ${escapeHtml(new Date(results.lastRunAt).toLocaleString())}</span>` : ""}
            </div>
            ${renderMessageBlock("Errores reportados", errorsList, "error")}
            ${renderMessageBlock("Avisos", warningsList, "warn")}
            ${shareRows && shareRows.length ? renderShareTable(shareRows, hasAmounts, estateValue, currency) : `
              <div class="stack">
                <p class="wizard-hint" style="margin:0;">No se detectó una tabla de shares. Se muestra la respuesta cruda.</p>
                ${response ? `<pre class="codebox">${escapeHtml(JSON.stringify(response, null, 2))}</pre>` : ""}
              </div>
            `}
            ${renderGuardSection("Invariantes", invariantsList)}
            ${renderGuardSection("Bloqueos aplicados", blocksAppliedList)}
            ${renderGuardSection("Asserciones fallidas", assertionsFailedList)}
            ${explainBlock}
            ${renderGuardSection("Exclusiones", exclusionsList)}
            ${renderGuardSection("Bloqueos", blocksList)}
            ${renderJsonDetails("JSON completo", normalized?.raw)}
            ${renderJsonDetails("Audit", auditBlock || null)}
            ${renderJsonDetails("Trace", traceBlock || null)}
            ${explainDetails}
          </section>
        ` : `
          <section class="card card-pad stack">
            <p class="wizard-hint" style="margin:0;">Pulsa "Calcular ahora" para obtener la respuesta del core.</p>
          </section>
        `}

        <div class="row" style="gap:8px; flex-wrap:wrap;">
          <a class="btn" href="#/builder">Volver al builder</a>
        </div>
      `}
    </section>
  `;
}

export function wireResults(store){
  const btnRun = document.getElementById("results-run");
  if (btnRun){
    btnRun.addEventListener("click", () => {
      if (btnRun.disabled) return;
      runCalc(store);
    });
  }
}
