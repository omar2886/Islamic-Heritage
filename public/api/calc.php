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

$flags = $data['cli_flags'] ?? null;
if (!is_array($flags)) {
  $flags = ['--explain', '--audit'];
  $data['cli_flags'] = $flags;
}

try {
  require_once __DIR__ . '/../../scripts/calc_lib.php';
  $out = calc_from_array($data);

  echo json_encode([
    'ok' => true,
    'output' => $out,
  ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'ok' => false,
    'error' => 'Error interno de cálculo',
  ]);
}
