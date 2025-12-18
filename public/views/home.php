<?php
  $appBaseClean = rtrim($APP_BASE ?? '', '/');
  $basePath = $appBaseClean !== '' ? $appBaseClean . '/' : '';
  $flowHref = $basePath . 'index.php?page=flow&step=decedent';
?>
<main id="home-root" class="container">
  <h2>Flow Wizard</h2>
  <p>Usa la nueva experiencia guiada para capturar los datos, revisar los resultados y navegar la genealogía.</p>
  <p><a class="btn btn-primary" href="<?= htmlspecialchars($flowHref, ENT_QUOTES, 'UTF-8') ?>">Abrir Flow Wizard</a></p>
</main>
