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
  if (value === null || value === undefined || value === "") return "—";
  return escapeHtml(String(value));
}

function baseResponse(response){
  if (response && typeof response === "object" && response.output && typeof response.output === "object"){
    return response.output;
  }
  return response && typeof response === "object" ? response : null;
}

function normalizeGroupObject(obj){
  if (!obj || typeof obj !== "object") return null;
  const rows = Object.entries(obj).map(([role, fraction]) => ({
    role,
    fraction,
    percent: null,
    amount: null,
  }));
  return rows.length ? rows : null;
}

function normalizeShareArray(arr){
  if (!Array.isArray(arr)) return null;
  const rows = [];
  arr.forEach((item) => {
    if (Array.isArray(item)){
      const [role, fraction, percent, amount] = item;
      rows.push({ role, fraction, percent, amount });
      return;
    }
    if (item && typeof item === "object"){
      const role = item.role ?? item.name ?? item.heir ?? item.beneficiary ?? item.id ?? null;
      const fraction = item.fraction ?? item.share ?? item.part ?? item.ratio ?? item.value ?? null;
      const percent = item.percent ?? item.percentage ?? item.pct ?? null;
      const amount = item.amount ?? item.total ?? item.import ?? item.importe ?? null;
      if (role || fraction || percent || amount){
        rows.push({ role, fraction, percent, amount });
      }
      return;
    }
    if (typeof item === "string" && item.trim() !== ""){
      rows.push({ role: item, fraction: item, percent: null, amount: null });
    }
  });
  return rows.length ? rows : null;
}

function extractAmounts(base){
  if (!base || typeof base !== "object") return null;
  const candidates = [
    base?.amounts?.amounts_by_role,
    base?.amounts_by_role,
  ];
  for (const cand of candidates){
    if (cand && typeof cand === "object") return cand;
  }
  return null;
}

function normalizeShareContainer(container, base){
  if (!container) return null;

  let rows = null;
  if (Array.isArray(container)){
    rows = normalizeShareArray(container);
  } else if (typeof container === "object"){
    const distribution = container.distribution || container.items || container.list;
    if (Array.isArray(distribution)){
      rows = normalizeShareArray(distribution);
    } else {
      const groupObj = container.final?.groups || container.groups || container.group_shares || container.amounts_by_role;
      rows = normalizeGroupObject(groupObj);
    }
  }

  if (rows && rows.length){
    const amounts = extractAmounts(base);
    if (amounts){
      rows = rows.map((row) => ({
        ...row,
        amount: row.amount ?? amounts[row.role] ?? null,
      }));
    }
    return rows;
  }

  return null;
}

function extractShareRows(response){
  const base = baseResponse(response);
  if (!base) return null;

  const candidates = [
    base?.shares,
    base?.result,
    base?.distribution,
    base?.group_shares,
  ];

  for (const cand of candidates){
    const rows = normalizeShareContainer(cand, base);
    if (rows && rows.length) return rows;
  }
  return null;
}

function takeData(response, keys){
  const holders = [response, baseResponse(response)];
  for (const holder of holders){
    if (!holder || typeof holder !== "object") continue;
    for (const key of keys){
      if (Object.prototype.hasOwnProperty.call(holder, key)){
        return holder[key];
      }
    }
  }
  return null;
}

function takeList(response, keys){
  const data = takeData(response, keys);
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (typeof data === "string") return [data];
  return null;
}

function renderShareTable(rows){
  if (!rows || !rows.length) return "";
  const body = rows.map((row) => `
    <tr>
      <td>${formatCell(row.role)}</td>
      <td>${formatCell(row.fraction)}</td>
      <td>${formatCell(row.percent)}</td>
      <td>${formatCell(row.amount)}</td>
    </tr>
  `).join("");
  return `
    <div class="stack">
      <h3 style="margin:0;">Distribución</h3>
      <table class="results-table">
        <thead>
          <tr>
            <th>Rol</th>
            <th>Fracción</th>
            <th>Porcentaje</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          ${body}
        </tbody>
      </table>
    </div>
  `;
}

function renderListBlock(title, items){
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

export function renderResults(state){
  const results = state.results || {};
  const builderReady = Boolean(state.builder?.payloadPreview);
  const response = results.response && typeof results.response === "object" ? results.response : null;
  const shareRows = results.status === "ok" && builderReady ? extractShareRows(response) : null;
  const auditBlock = takeData(response, ["audit"]);
  const traceBlock = takeData(response, ["trace", "traces"]);
  const exclusions = takeList(response, ["exclusions"]);
  const blocks = takeList(response, ["blocks"]);
  const errorsList = takeList(response, ["errors"]);
  const rawResponseError = takeData(response, ["error"]);
  const responseError = typeof rawResponseError === "string" ? rawResponseError : null;

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
            ${responseError ? `<p style="margin:0;">${escapeHtml(responseError)}</p>` : ""}
            ${response ? `<pre class="codebox">${escapeHtml(JSON.stringify(response, null, 2))}</pre>` : ""}
          </section>
        ` : ""}

        ${results.status === "ok" ? `
          <section class="card card-pad stack">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <strong>Respuesta de calc.php</strong>
              ${results.lastRunAt ? `<span class="wizard-hint">Última ejecución: ${escapeHtml(new Date(results.lastRunAt).toLocaleString())}</span>` : ""}
            </div>
            ${shareRows ? renderShareTable(shareRows) : `
              <div class="stack">
                <p class="wizard-hint" style="margin:0;">No se detectó una tabla de shares. Se muestra la respuesta cruda.</p>
                <pre class="codebox">${escapeHtml(JSON.stringify(response, null, 2))}</pre>
              </div>
            `}
            ${response ? `
              <div class="stack">
                <details>
                  <summary>Ver respuesta completa</summary>
                  <pre class="codebox" style="margin-top:10px;">${escapeHtml(JSON.stringify(response, null, 2))}</pre>
                </details>
              </div>
            ` : ""}
          </section>

          ${auditBlock ? `
            <section class="card card-pad stack">
              <strong>Audit</strong>
              <pre class="codebox">${escapeHtml(JSON.stringify(auditBlock, null, 2))}</pre>
            </section>
          ` : ""}

          ${traceBlock ? `
            <section class="card card-pad stack">
              <strong>Trace</strong>
              <pre class="codebox">${escapeHtml(JSON.stringify(traceBlock, null, 2))}</pre>
            </section>
          ` : ""}

          ${renderListBlock("Exclusiones", exclusions || [])}
          ${renderListBlock("Bloqueos", blocks || [])}
          ${renderListBlock("Errores reportados", errorsList || [])}
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
