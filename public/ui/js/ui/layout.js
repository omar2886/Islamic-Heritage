import { UI_VERSION, UI_BUILD } from "../config.js";
import { renderWizard } from "../pages/wizard.js";
import { renderBuilder } from "../pages/builder.js";
import { renderResults } from "../pages/results.js";

function navLink(route, label, currentRoute){
  const active = route === currentRoute;
  const cls = active ? "btn nav-link is-active" : "btn nav-link";
  const aria = active ? ' aria-current="page"' : "";
  return `<a class="${cls}" href="#/${route}"${aria}>${label}</a>`;
}

function renderToasts(toasts){
  if (!toasts || toasts.length === 0) return "";
  const items = toasts.map((t) => `<div class="toast" role="status">${escapeHtml(t.message)}</div>`).join("");
  return `<div class="toast-wrap">${items}</div>`;
}

function renderModal(modal){
  if (!modal) return "";
  const title = escapeHtml(modal.title || "Modal");
  const body = escapeHtml(modal.body || "");
  const confirmAction = typeof modal.confirmAction === "string" ? modal.confirmAction : null;
  const confirmLabel = escapeHtml(modal.confirmLabel || "Confirmar");
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal card card-pad">
        <div class="row" style="justify-content:space-between;">
          <strong>${title}</strong>
          <button class="btn" type="button" id="btn-modal-close" data-focus-key="modal-close">Cerrar</button>
        </div>
        <p style="color:var(--muted); margin:10px 0 0; line-height:1.4;">${body}</p>
        ${confirmAction ? `
          <div class="row" style="justify-content:flex-end; flex-wrap:wrap; margin-top:12px;">
            <button class="btn" type="button" id="btn-modal-confirm" data-confirm-action="${escapeHtml(confirmAction)}">${confirmLabel}</button>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function renderLayout(state, derived){
  const year = new Date().getFullYear();
  const route = derived.route;
  const boot = state.boot || { status: "idle" };

  const mainHtml = (() => {
    if (boot.status === "blocked") return `
      <section class="card card-pad hero">
        <h1>UI bloqueada</h1>
        <p>No coincide el contrato de roles con el servidor, o no se pudo verificar.</p>
        <hr class="hr" />
        <div class="stack">
          <span class="badge">Estado: blocked</span>
          <p style="color:var(--muted); margin:0; line-height:1.4;">${escapeHtml(String(boot.error || "Error desconocido"))}</p>
          ${boot.diff ? `<pre class="codebox">${escapeHtml(JSON.stringify(boot.diff, null, 2))}</pre>` : ""}
          <div class="row">
            <a class="btn" href="#/wizard">Ir a wizard</a>
          </div>
        </div>
      </section>
    `;
    if (route === "wizard") return renderWizard(state, derived);
    if (route === "builder") return renderBuilder(state, derived);
    if (route === "results") return renderResults(state, derived);
  })();

  return `
    <div class="shell" data-route="${route}">
      <header class="shell-header">
        <div class="container shell-header-inner">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true"></div>
            <div class="brand-title">Islamic Heritage</div>
            <span class="badge">v ${UI_VERSION} ${UI_BUILD}</span>
          </div>
          <nav class="nav">
            ${navLink("wizard","Wizard",route)}
            ${navLink("builder","Builder",route)}
            ${navLink("results","Results",route)}
            <button class="btn nav-link" type="button" id="btn-reset" data-focus-key="btn-reset">Nuevo caso</button>
          </nav>
        </div>
      </header>

      <main class="shell-main">
        <div class="container">
          ${boot.status === "checking" ? `
            <div class="card card-pad" style="margin-bottom:12px;">
              <span class="badge">Verificando contrato...</span>
            </div>
          ` : ""}
          ${mainHtml}
        </div>
      </main>

      <footer class="shell-footer">
        <div class="container">
          <div>© ${year} Islamic Heritage. UI ${UI_BUILD}.</div>
        </div>
      </footer>

      ${renderToasts(state.ui.toasts)}
      ${renderModal(state.ui.modal)}
    </div>
  `;
}
