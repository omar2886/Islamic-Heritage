import { UI_VERSION, UI_BUILD } from "../config.js";

export function renderLayout(){
  const year = new Date().getFullYear();

  return `
    <div class="shell">
      <header class="shell-header">
        <div class="container shell-header-inner">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true"></div>
            <div class="brand-title">Islamic Heritage</div>
            <span class="badge">v ${UI_VERSION} ${UI_BUILD}</span>
          </div>
          <button class="btn" type="button" id="btn-noop" title="Sin acción en PR0" disabled>
            UI bootstrap
          </button>
        </div>
      </header>

      <main class="shell-main">
        <div class="container">
          <section class="card card-pad hero">
            <h1>UI base instalada</h1>
            <p>
              Este es el esqueleto estático. En PR0 no hay wizard, no hay builder, no hay resultados y no hay llamadas a API.
            </p>
            <hr class="hr" />
            <div class="stack">
              <div class="row">
                <span class="badge">ES modules</span>
                <span class="badge">Sin framework</span>
                <span class="badge">Sin build</span>
              </div>
              <p class="sr-only" id="status-msg">OK</p>
            </div>
          </section>
        </div>
      </main>

      <footer class="shell-footer">
        <div class="container">
          <div>© ${year} Islamic Heritage. UI PR0.</div>
        </div>
      </footer>
    </div>
  `;
}
