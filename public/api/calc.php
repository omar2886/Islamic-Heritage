<?php declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../scripts/calc_runtime.php';

use App\Domain\RolesCatalog;

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

$validatedHeirs = [];
$allowedRoles = RolesCatalog::all();

foreach ($clean['heirs'] as $i => $h) {
  if (!is_array($h)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "Heredero inválido en posición {$i}"]); 
    exit;
  }

  $role = $h['role'] ?? null;
  $count = $h['count'] ?? null;

  $role = is_string($role) ? trim($role) : '';
  if ($role === '' || strlen($role) > 64) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "Rol de heredero inválido en posición {$i}"]);
    exit;
  }

  if (!in_array($role, $allowedRoles, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "Rol desconocido en posición {$i}"]);
    exit;
  }

  if (is_int($count)) {
    $countInt = $count;
  } elseif (is_string($count) && ctype_digit($count)) {
    $countInt = (int) $count;
  } else {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "Cantidad inválida en posición {$i}"]);
    exit;
  }

  if ($countInt < 1 || $countInt > 100) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "Cantidad fuera de rango en posición {$i}"]);
    exit;
  }

  $validatedHeirs[] = [
    'role' => $role,
    'count' => $countInt,
  ];
}

$clean['heirs'] = $validatedHeirs;

if (array_key_exists('estate_value', $data)) {
  $estateValue = $data['estate_value'];

  if (is_int($estateValue) || is_float($estateValue)) {
    $estateValue = rtrim(rtrim(sprintf('%.6F', $estateValue), '0'), '.');
  } elseif (is_string($estateValue)) {
    $estateValue = trim($estateValue);

    if (strpos($estateValue, '.') === false && strpos($estateValue, ',') !== false) {
      $estateValue = str_replace(',', '.', $estateValue);
    }
  } else {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'estate_value inválido']);
    exit;
  }

  if (!preg_match('/^[0-9]{1,18}(\.[0-9]{1,6})?$/', $estateValue)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'estate_value inválido']);
    exit;
  }

  [$intPart, $decimalPart] = array_pad(explode('.', $estateValue, 2), 2, '');

  if (strlen($intPart) === 18 && $intPart === '999999999999999999' && $decimalPart !== '' && (int) $decimalPart > 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'estate_value inválido']);
    exit;
  }

  $clean['estate_value'] = $estateValue;
}

if (array_key_exists('currency', $data)) {
  $currency = $data['currency'];

  if (!is_string($currency)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'currency inválido']);
    exit;
  }

  $currency = trim($currency);

  if (!preg_match('/^[A-Z]{3}$/', $currency)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'currency inválido']);
    exit;
  }

  $clean['currency'] = $currency;
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
