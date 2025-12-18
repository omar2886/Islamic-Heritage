<?php
  $appBaseClean = rtrim($APP_BASE ?? '', '/');
  $builderHref = ($appBaseClean !== '' ? $appBaseClean . '/' : '') . 'index.php?page=builder3';
?>
<main id="home-root" class="container"><p>Bienvenido. Prueba el nuevo <a class="btn" href="<?= htmlspecialchars($builderHref, ENT_QUOTES, 'UTF-8') ?>">Constructor V3 (beta)</a>.</p></main>
