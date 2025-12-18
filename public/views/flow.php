<main class="container flow">
  <header class="flow__header">
    <div>
      <p class="eyebrow">Flow Wizard</p>
      <h1>Nueva experiencia guiada</h1>
      <p class="muted">Captura la información del causante, agrega herederos, revisa los datos y consulta los resultados sin salir de este flujo.</p>
    </div>
  </header>
  <nav class="flow__steps" aria-label="Pasos del proceso">
    <button type="button" data-step="decedent">Paso 1 · Causante</button>
    <button type="button" data-step="heirs">Paso 2 · Familia/Herederos</button>
    <button type="button" data-step="review">Paso 3 · Revisión</button>
    <button type="button" data-step="results">Paso 4 · Resultados</button>
  </nav>
  <section id="flow-root"></section>
  <footer class="flow__footer">
    <div class="flow__footer-actions">
      <button type="button" class="btn" data-action="back">Atrás</button>
      <button type="button" class="btn btn-primary" data-action="next">Siguiente</button>
      <button type="button" class="btn btn-ghost" data-action="recalc">Recalcular</button>
    </div>
  </footer>
</main>
