<?php
  $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
  $requestUri = $_SERVER['REQUEST_URI'] ?? '';
  $requestPath = parse_url($requestUri, PHP_URL_PATH) ?? '';

  $normalizeBase = static function ($value) {
    if ($value === null) {
      return '';
    }
    $trimmed = rtrim((string) $value, '/');
    return $trimmed === DIRECTORY_SEPARATOR ? '' : $trimmed;
  };

  $detectPublicBase = static function (string $scriptName, string $requestPath) {
    foreach ([$scriptName, $requestPath] as $candidate) {
      if ($candidate && preg_match('#^(.*?/public)(?=/|$)#', $candidate, $matches)) {
        return $matches[1];
      }
    }
    $fallback = rtrim(dirname($requestPath ?: $scriptName ?: '/'), '/');
    return $fallback === DIRECTORY_SEPARATOR ? '' : $fallback;
  };

  $joinPath = static function (string $base, string $path) use ($normalizeBase): string {
    $cleanBase = $normalizeBase($base);
    $cleanPath = ltrim($path, '/');
    return $cleanBase === '' ? $cleanPath : $cleanBase . '/' . $cleanPath;
  };

  $PUBLIC_BASE = $normalizeBase($detectPublicBase($scriptName, $requestPath));

  $appBaseCandidates = [
    dirname($scriptName ?: '/'),
    dirname($requestPath ?: '/'),
    $PUBLIC_BASE,
  ];

  $APP_BASE = '';
  foreach ($appBaseCandidates as $candidate) {
    $normalized = $normalizeBase($candidate);
    if ($normalized !== '') {
      $APP_BASE = $normalized;
      break;
    }
  }

  $page = $_GET['page'] ?? 'home';
  $bootMap = [
    'builder' => 'js/boot-builder.js',
    'builder2' => 'js/boot-builder2.js',
    'builder3' => 'js/v3/boot-builder3.js',
    'results' => 'js/boot-results.js',
    'results2' => 'js/boot-results2.js',
    'results3' => 'js/v3/boot-results3.js',
    'home'    => 'js/boot-home.js',
    'genealogy' => 'js/boot-genealogy.js',
    'genealogy2' => 'js/boot-genealogy2.js',
    'genealogy3' => 'js/v3/boot-genealogy3.js',
  ];
  $bootPath = $bootMap[$page] ?? $bootMap['home'];

  $titleMap = [
    'home' => 'Herencia Islámica – Inicio',
    'builder' => 'Herencia Islámica – Constructor',
    'builder2' => 'Herencia Islámica – Constructor V2',
    'builder3' => 'Herencia Islámica – Constructor V3 (beta)',
    'results' => 'Herencia Islámica – Resultados',
    'results2' => 'Herencia Islámica – Resultados V2',
    'results3' => 'Herencia Islámica – Resultados V3 (beta)',
    'genealogy' => 'Herencia Islámica – Genealogía',
    'genealogy2' => 'Herencia Islámica – Genealogía V2',
    'genealogy3' => 'Herencia Islámica – Genealogía V3 (beta)',
  ];
  $pageTitle = $titleMap[$page] ?? 'Herencia Islámica';

  $cssHref = $joinPath($PUBLIC_BASE, 'css/styles.css');
  $bootstrapSrc = $joinPath($PUBLIC_BASE, 'js/bootstrap.js');
  $bootSrc = $joinPath($PUBLIC_BASE, $bootPath);
  $URL_ROLES = $joinPath($PUBLIC_BASE, 'api/roles.php');
  $URL_CALC = $joinPath($PUBLIC_BASE, 'api/calc.php');
  $URL_TOOLS = $joinPath($PUBLIC_BASE, 'tools/explain_smoke.php');
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8') ?></title>

  <link rel="stylesheet" href="<?= htmlspecialchars($cssHref, ENT_QUOTES, 'UTF-8') ?>">

  <script>
    window.__APP_BASE__    = "<?= htmlspecialchars($APP_BASE, ENT_QUOTES, 'UTF-8') ?>";
    window.__PUBLIC_BASE__ = "<?= htmlspecialchars($PUBLIC_BASE, ENT_QUOTES, 'UTF-8') ?>";
    window.__URLS__ = {
      roles: "<?= htmlspecialchars($URL_ROLES, ENT_QUOTES, 'UTF-8') ?>",
      calc: "<?= htmlspecialchars($URL_CALC, ENT_QUOTES, 'UTF-8') ?>",
      tools: "<?= htmlspecialchars($URL_TOOLS, ENT_QUOTES, 'UTF-8') ?>"
    };
  </script>

  <script src="<?= htmlspecialchars($joinPath($PUBLIC_BASE, 'js/error_overlay.js'), ENT_QUOTES, 'UTF-8') ?>"></script>

  <script src="<?= htmlspecialchars($bootstrapSrc, ENT_QUOTES, 'UTF-8') ?>" crossorigin="anonymous"></script>

  <script type="module" src="<?= htmlspecialchars($bootSrc, ENT_QUOTES, 'UTF-8') ?>"></script>
</head>
<body data-page="<?= htmlspecialchars($_GET['page'] ?? 'home', ENT_QUOTES, 'UTF-8') ?>">
