<?php
  $appBaseClean = rtrim($APP_BASE ?? '', '/');
  $builderHref = ($appBaseClean !== '' ? $appBaseClean . '/' : '') . 'index.php?page=builder2';
?>
<main id="home-root" class="container"><p>Bienvenido. Ve al <a class="btn" href="<?= htmlspecialchars($builderHref, ENT_QUOTES, 'UTF-8') ?>">Constructor</a>.</p></main>
