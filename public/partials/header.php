<?php
  $page = $_GET['page'] ?? 'home';
  $targetMap = [
    'builder' => 'builder-root',
    'builder2' => 'builder2-root',
    'builder3' => 'builder3-root',
    'results' => 'results-root',
    'results2' => 'results-root',
    'results3' => 'results3-root',
    'genealogy' => 'genealogy-root',
    'genealogy2' => 'g2-app',
    'genealogy3' => 'genealogy3-root',
  ];
  $targetId = $targetMap[$page] ?? 'home-root';

  $legacyMode = ($_GET['legacy'] ?? '') === '1';

  $APP_BASE = $APP_BASE ?? (rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/'));
  $appBaseClean = rtrim($APP_BASE ?? '', '/');
  $baseParams = $legacyMode ? ['legacy' => '1'] : [];
  $navHref = function(string $dest, array $params = []) use ($appBaseClean, $baseParams) {
    $query = http_build_query(array_merge($baseParams, ['page' => $dest], $params));
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
    <a href="<?= $navHref('builder3') ?>">Constructor</a>
    <a href="<?= $navHref('results3') ?>">Resultados</a>
    <a href="<?= $navHref('genealogy3') ?>">Genealogía</a>
  </nav>
  <?php if ($legacyMode): ?>
    <nav class="nav nav-secondary" aria-label="Legacy">
      <a href="<?= $navHref('builder') ?>">Legacy</a>
    </nav>
  <?php endif; ?>
</header>
