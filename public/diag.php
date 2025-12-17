<?php
$token = $_GET['k'] ?? '';
$expected = $_ENV['DIAG_TOKEN'] ?? $_SERVER['DIAG_TOKEN'] ?? 'letmein';

if (!hash_equals($expected, $token)) {
    http_response_code(403);
    echo "Token requerido (?k=...) para diag";
    exit;
}

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

$links = [
    'Home' => $joinPath($PUBLIC_BASE, ''),
    'Builder' => $joinPath($PUBLIC_BASE, 'index.php?page=builder'),
    'CSS' => $joinPath($PUBLIC_BASE, 'css/styles.css'),
    'Boot' => $joinPath($PUBLIC_BASE, 'js/boot-builder.js'),
    'Roles API' => $joinPath($PUBLIC_BASE, 'api/roles.php'),
    'Calc API' => $joinPath($PUBLIC_BASE, 'api/calc.php'),
];
?><!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Diagnóstico de rutas</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 1.5rem; }
    code { background: #f5f5f5; padding: 0.2rem 0.35rem; border-radius: 4px; }
    table { border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; }
  </style>
</head>
<body>
  <h1>Diagnóstico de rutas</h1>
  <p><strong>SCRIPT_NAME:</strong> <code><?= htmlspecialchars($scriptName, ENT_QUOTES, 'UTF-8') ?></code></p>
  <p><strong>REQUEST_URI:</strong> <code><?= htmlspecialchars($requestUri, ENT_QUOTES, 'UTF-8') ?></code></p>
  <p><strong>REQUEST_PATH:</strong> <code><?= htmlspecialchars($requestPath, ENT_QUOTES, 'UTF-8') ?></code></p>
  <p><strong>__PUBLIC_BASE__:</strong> <code><?= htmlspecialchars($PUBLIC_BASE, ENT_QUOTES, 'UTF-8') ?></code></p>
  <p><strong>__APP_BASE__:</strong> <code><?= htmlspecialchars($APP_BASE, ENT_QUOTES, 'UTF-8') ?></code></p>

  <table>
    <thead>
      <tr><th>Recurso</th><th>URL</th></tr>
    </thead>
    <tbody>
      <?php foreach ($links as $label => $href): ?>
        <tr>
          <td><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></td>
          <td><a href="<?= htmlspecialchars($href, ENT_QUOTES, 'UTF-8') ?>"><?= htmlspecialchars($href, ENT_QUOTES, 'UTF-8') ?></a></td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
</body>
</html>
