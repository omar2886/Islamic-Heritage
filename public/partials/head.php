<?php
  $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';

  if (preg_match('#^(.*?/public)(?=/|$)#', $scriptName, $matches)) {
    $PUBLIC_BASE = $matches[1];
  } else {
    $fallbackBase = rtrim(dirname($scriptName ?: '/'), '/');
    if ($fallbackBase === '/') {
      $fallbackBase = '';
    }
    $PUBLIC_BASE = $fallbackBase;
  }

  $appBase = dirname($scriptName ?: '/');
  if ($appBase === '.' || $appBase === DIRECTORY_SEPARATOR) {
    $APP_BASE = '';
  } else {
    $APP_BASE = $appBase;
  }

  $normalizeBase = static function ($value) {
    if ($value === null) {
      return '';
    }
    $trimmed = rtrim((string) $value, '/');
    return $trimmed === DIRECTORY_SEPARATOR ? '' : $trimmed;
  };

  $joinPath = static function (string $base, string $path) use ($normalizeBase): string {
    $cleanBase = $normalizeBase($base);
    $cleanPath = ltrim($path, '/');
    return $cleanBase === '' ? $cleanPath : $cleanBase . '/' . $cleanPath;
  };

  $PUBLIC_BASE = $normalizeBase($PUBLIC_BASE ?? '');
  $APP_BASE = $normalizeBase($APP_BASE ?? '');

  $page = $_GET['page'] ?? 'home';
  $bootMap = [
    'builder' => 'js/boot-builder.js',
    'results' => 'js/boot-results.js',
    'home'    => 'js/boot-home.js',
  ];
  $bootPath = $bootMap[$page] ?? $bootMap['home'];

  $cssHref = $joinPath($PUBLIC_BASE, 'css/styles.css');
  $bootSrc = $joinPath($PUBLIC_BASE, $bootPath);
  $URL_ROLES = $joinPath($PUBLIC_BASE, 'api/roles.php');
  $URL_TOOLS = $joinPath($PUBLIC_BASE, 'tools/explain_smoke.php');
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Calculadora de herencia — Maliki</title>

  <link rel="stylesheet" href="<?= htmlspecialchars($cssHref, ENT_QUOTES, 'UTF-8') ?>">

  <script>
    window.__APP_BASE__    = "<?= htmlspecialchars($APP_BASE, ENT_QUOTES, 'UTF-8') ?>";
    window.__PUBLIC_BASE__ = "<?= htmlspecialchars($PUBLIC_BASE, ENT_QUOTES, 'UTF-8') ?>";
    window.__URLS__ = {
      roles: "<?= htmlspecialchars($URL_ROLES, ENT_QUOTES, 'UTF-8') ?>",
      tools: "<?= htmlspecialchars($URL_TOOLS, ENT_QUOTES, 'UTF-8') ?>"
    };
  </script>

  <script type="module" src="<?= htmlspecialchars($bootSrc, ENT_QUOTES, 'UTF-8') ?>"></script>
</head>
<body data-page="<?= htmlspecialchars($_GET['page'] ?? 'home', ENT_QUOTES, 'UTF-8') ?>">
