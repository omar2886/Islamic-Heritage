<?php declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'error' => 'POST requerido']);
  exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || trim($raw) === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Body vacío']);
  exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'JSON inválido']);
  exit;
}

$clean = [];

$clean['heirs'] = $data['heirs'] ?? null;
if (!is_array($clean['heirs']) || count($clean['heirs']) === 0) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Lista de herederos requerida']);
  exit;
}

if (array_key_exists('estate_value', $data)) {
  $clean['estate_value'] = $data['estate_value'];
}

if (array_key_exists('currency', $data)) {
  $clean['currency'] = $data['currency'];
}

if (array_key_exists('ui_meta', $data)) {
  $clean['ui_meta'] = $data['ui_meta'];
}

$allowedFlags = ['--explain', '--audit'];
$flags = $data['cli_flags'] ?? null;
if (is_array($flags)) {
  $flags = array_values(array_intersect($allowedFlags, $flags));
}

if (!is_array($flags) || count($flags) === 0) {
  $flags = $allowedFlags;
}

$clean['cli_flags'] = $flags;

try {
  require_once __DIR__ . '/../../scripts/calc_lib.php';
  $out = calc_from_array($clean);

  echo json_encode([
    'ok' => true,
    'output' => $out,
  ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
  http_response_code(500);
  $error = [
    'ok' => false,
    'error' => 'Error interno de cálculo',
  ];

  if (getenv('HERITAGE_DEBUG') === '1') {
    $error['error_detail'] = $e->getMessage();
  }

  echo json_encode($error);
}
