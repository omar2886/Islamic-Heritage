<?php
  $appBaseClean = rtrim($APP_BASE ?? '', '/');
  $basePath = $appBaseClean !== '' ? $appBaseClean . '/' : '';
  $builderHref = $basePath . 'index.php?page=builder3';
  $resultsHref = $basePath . 'index.php?page=results3';
  $genealogyHref = $basePath . 'index.php?page=genealogy3';
?>
<main id="home-root" class="container">
  <h2>Flujo guiado (V3)</h2>
  <p>Usa la nueva experiencia V3 para capturar los datos, revisar los resultados y navegar la genealogía.</p>
  <ol class="steps">
    <li><a class="btn" href="<?= htmlspecialchars($builderHref, ENT_QUOTES, 'UTF-8') ?>">1. Construir caso</a>: agrega personas, relaciones y reglas aplicables.</li>
    <li><a class="btn" href="<?= htmlspecialchars($resultsHref, ENT_QUOTES, 'UTF-8') ?>">2. Revisar resultados</a>: valida participaciones individuales y sumatorias finales.</li>
    <li><a class="btn" href="<?= htmlspecialchars($genealogyHref, ENT_QUOTES, 'UTF-8') ?>">3. Explorar genealogía</a>: confirma el grafo y las derivaciones.</li>
  </ol>
</main>
