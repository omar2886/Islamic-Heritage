<?php
// public/views/genealogy2.php
?>
<div class="container" id="g2-app" data-testid="g2-app">
  <header class="page-head">
    <div class="page-title">
      <h1>Genealogía (V2)</h1>
      <p class="muted">Construye un árbol coherente. Las relaciones imposibles quedan bloqueadas.</p>
    </div>

    <div class="page-actions">
      <a class="btn" href="index.php?page=builder2">Abrir calculadora (V2)</a>
      <a class="btn btn-ghost" href="index.php?page=genealogy&diag=1">Ver Genealogía antigua (diag)</a>
    </div>
  </header>

  <div class="layout-2col" data-testid="g2-layout">
    <!-- Left: list -->
    <section class="panel" id="g2-list-panel" data-testid="g2-list-panel">
      <div class="panel-head">
        <h2>Personas</h2>
        <button class="btn btn-primary" id="g2-new-person" type="button">Nueva persona</button>
      </div>

      <div class="panel-body">
        <input class="input" id="g2-search" type="search" placeholder="Buscar por nombre…" data-testid="g2-search" />
        <div class="spacer"></div>

        <div id="g2-stats" class="stats" data-testid="g2-stats"></div>

        <div id="g2-errors" class="banner banner-error" hidden data-testid="g2-errors"></div>
        <div id="g2-warnings" class="banner banner-warn" hidden data-testid="g2-warnings"></div>

        <div id="g2-people-list" class="list" data-testid="g2-people-list"></div>
      </div>
    </section>

    <!-- Right: editor -->
    <section class="panel" id="g2-editor-panel" data-testid="g2-editor-panel">
      <div class="panel-head">
        <h2>Editor</h2>
        <div class="inline-actions">
          <button class="btn btn-ghost" id="g2-set-decedent" type="button">Usar como causante</button>
          <button class="btn btn-danger" id="g2-delete-person" type="button">Eliminar</button>
        </div>
      </div>

      <div class="panel-body">
        <div id="g2-editor-empty" class="empty" data-testid="g2-editor-empty">
          Selecciona una persona o crea una nueva.
        </div>

        <form id="g2-editor" hidden data-testid="g2-editor">
          <div class="grid-2">
            <label class="field">
              <span>Nombre</span>
              <input class="input" id="g2-name" type="text" maxlength="80" />
            </label>

            <label class="field">
              <span>Sexo</span>
              <select class="select" id="g2-sex">
                <option value="unknown">—</option>
                <option value="male">Varón</option>
                <option value="female">Mujer</option>
              </select>
            </label>

            <label class="field">
              <span>Estado</span>
              <select class="select" id="g2-alive">
                <option value="1">Vivo</option>
                <option value="0">Fallecido</option>
              </select>
            </label>

            <label class="field">
              <span>ID</span>
              <input class="input" id="g2-id" type="text" readonly />
            </label>
          </div>

          <div class="hr"></div>

          <h3>Relaciones</h3>

          <div class="grid-2">
            <label class="field">
              <span>Padre (solo varón)</span>
              <select class="select" id="g2-father"></select>
            </label>

            <label class="field">
              <span>Madre (solo mujer)</span>
              <select class="select" id="g2-mother"></select>
            </label>
          </div>

          <div class="spacer"></div>

          <div class="grid-2">
            <label class="field">
              <span>Cónyuge</span>
              <select class="select" id="g2-spouse-pick"></select>
            </label>

            <div class="field">
              <span>&nbsp;</span>
              <button class="btn" id="g2-add-spouse" type="button">Añadir cónyuge</button>
            </div>
          </div>

          <div id="g2-spouse-list" class="chips" data-testid="g2-spouse-list"></div>

          <div class="hr"></div>

          <div class="footer-actions">
            <button class="btn btn-primary" id="g2-save" type="button">Guardar</button>
            <button class="btn btn-ghost" id="g2-reset" type="button">Reset local</button>
          </div>
        </form>
      </div>
    </section>
  </div>
</div>

<script type="module" src="js/boot-genealogy2.js"></script>
