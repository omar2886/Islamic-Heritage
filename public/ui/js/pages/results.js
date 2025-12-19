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
  const base = String(value).trim();
  if (!base) return null;
  return currency ? `${base} ${currency}` : base;
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
  if (!output || typeof output !== "object") return [];
  const currency = output.currency ?? raw?.currency ?? null;
  const peopleByRole = safeObject(output.people_by_role) || {};
  const individualShares = safeObject(output.individual_shares) || null;
  const amountsByIndividual = safeObject(output.amounts_by_individual) || safeObject(output?.amounts?.amounts_by_individual) || null;
  const amountsByRole = safeObject(output.amounts_by_role) || safeObject(output?.amounts?.amounts_by_role) || null;

  const ctx = { currency, peopleByRole, individualShares, amountsByIndividual };
  const shares = [];

  const groupShares = safeObject(output.group_shares);
  if (groupShares && Object.keys(groupShares).length){
    Object.entries(groupShares).forEach(([role, fraction]) => {
      const normalizedFraction = normalizeFractionValue(fraction);
      const amount = amountsByRole ? amountsByRole[role] : null;
      shares.push(buildShare(role, normalizedFraction, amount, ctx));
    });
    if (shares.length) return shares;
  }

  const shareGroups = safeObject(output.shares?.final?.groups);
  if (shareGroups && Object.keys(shareGroups).length){
    Object.entries(shareGroups).forEach(([role, fractions]) => {
      const fraction = aggregateFractions(fractions);
      const amount = amountsByRole ? amountsByRole[role] : null;
      shares.push(buildShare(role, fraction, amount, ctx));
    });
    if (shares.length) return shares;
  }

  return [];
}

export function normalizeCalcResponse(response){
  const raw = response ?? null;
  const output = raw && raw.output && typeof raw.output === "object" ? raw.output : null;
  const containers = [raw, output];
  const errors = collectMessages(containers, ["errors", "error"]);
  const warnings = collectMessages(containers, ["warnings", "warning"]);
  const sharesByRole = buildSharesByRole(output, raw);
  const ok = typeof raw?.ok === "boolean" ? raw.ok : raw?.status === "ok" ? true : errors.length === 0;

  return {
    ok,
    output,
    errors,
    warnings,
    sharesByRole,
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

function renderShareTable(shares, hasAmountColumn){
  if (!shares || !shares.length) return "";
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
      <table class="results-table">
        <thead>${header}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>
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
  const output = normalized?.output || null;
  const auditBlock = output?.audit || response?.audit || null;
  const traceBlock = output?.trace || output?.traces || response?.trace || response?.traces || null;
  const explainBlock = output?.explain || response?.explain || null;
  const errorsList = normalized?.errors || [];
  const warningsList = normalized?.warnings || [];
  const rawResponseError = response && typeof response.error === "string" ? response.error : null;
  const hasAmounts = Boolean(output && Object.prototype.hasOwnProperty.call(output, "estate_value"));

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
            ${shareRows && shareRows.length ? renderShareTable(shareRows, hasAmounts) : `
              <div class="stack">
                <p class="wizard-hint" style="margin:0;">No se detectó una tabla de shares. Se muestra la respuesta cruda.</p>
                ${response ? `<pre class="codebox">${escapeHtml(JSON.stringify(response, null, 2))}</pre>` : ""}
              </div>
            `}
            ${renderJsonDetails("JSON completo", normalized?.raw)}
            ${renderJsonDetails("Audit", auditBlock || null)}
            ${renderJsonDetails("Trace", traceBlock || null)}
            ${renderJsonDetails("Explain", explainBlock || null)}
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
