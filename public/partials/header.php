<?php
  $page = $_GET['page'] ?? 'home';
  $targetMap = [
    'builder' => 'builder-root',
    'builder2' => 'builder2-root',
    'results' => 'results-root',
    'results2' => 'results-root',
    'genealogy' => 'genealogy-root',
    'genealogy2' => 'g2-app',
  ];
  $targetId = $targetMap[$page] ?? 'home-root';

  $APP_BASE = $APP_BASE ?? (rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/'));
  $appBaseClean = rtrim($APP_BASE ?? '', '/');
  $navHref = function(string $dest, array $params = []) use ($appBaseClean) {
    $query = http_build_query(array_merge(['page' => $dest], $params));
    $path = 'index.php' . ($query ? '?' . $query : '');
    $full = $appBaseClean === '' ? $path : $appBaseClean . '/' . $path;
    return htmlspecialchars($full, ENT_QUOTES, 'UTF-8');
  };
?>
<header class="site-header container" role="banner">
  <a href="#<?= htmlspecialchars($targetId) ?>" class="skip-link">Saltar al contenido</a>
  <h1>Calculadora de herencia islámica — escuela Maliki</h1>
  <nav class="nav" aria-label="Principal">
    <a href="<?= $navHref('home') ?>">Inicio</a>
    <a href="<?= $navHref('builder2') ?>">Constructor V2</a>
    <a href="<?= $navHref('results2') ?>">Resultados V2</a>
    <a href="<?= $navHref('genealogy2') ?>">Genealogía V2</a>
  </nav>
  <nav class="nav nav-secondary" aria-label="Versiones anteriores">
    <span class="nav-label">Legacy:</span>
    <a href="<?= $navHref('builder', ['diag' => '1']) ?>">Constructor clásico</a>
    <a href="<?= $navHref('results', ['diag' => '1']) ?>">Resultados clásicos</a>
    <a href="<?= $navHref('genealogy', ['diag' => '1']) ?>">Genealogía clásica</a>
  </nav>
</header>
