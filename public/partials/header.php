<?php
  $page = $_GET['page'] ?? 'home';
  if ($page === 'builder') {
    $targetId = 'builder-root';
  } elseif ($page === 'results') {
    $targetId = 'results-root';
  } elseif ($page === 'genealogy') {
    $targetId = 'genealogy-root';
  } else {
    $targetId = 'home-root';
  }
  $APP_BASE = $APP_BASE ?? (rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/'));
  $appBaseClean = rtrim($APP_BASE ?? '', '/');
  $navHref = function(string $dest) use ($appBaseClean) {
    $path = 'index.php?page=' . $dest;
    $full = $appBaseClean === '' ? $path : $appBaseClean . '/' . $path;
    return htmlspecialchars($full, ENT_QUOTES, 'UTF-8');
  };
?>
<header class="site-header container" role="banner">
  <a href="#<?= htmlspecialchars($targetId) ?>" class="skip-link">Saltar al contenido</a>
  <h1>Calculadora de herencia islámica — escuela Maliki</h1>
  <nav class="nav" aria-label="Principal">
    <a href="<?= $navHref('home') ?>">Inicio</a>
    <a href="<?= $navHref('builder') ?>">Constructor</a>
    <a href="<?= $navHref('results') ?>">Resultados</a>
    <a href="<?= $navHref('genealogy') ?>">Genealogía</a>
  </nav>
</header>
