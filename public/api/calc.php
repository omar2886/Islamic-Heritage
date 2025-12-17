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
if ($raw !== false && strlen($raw) > 200000) {
  http_response_code(413);
  echo json_encode(['ok' => false, 'error' => 'Payload demasiado grande']);
  exit;
}

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

$heirs = $data['heirs'] ?? null;
if (!is_array($heirs) || $heirs === []) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Lista de herederos requerida']);
  exit;
}

$allowedRoles = RolesCatalog::heirRoles();
$validatedHeirs = [];
foreach ($heirs as $i => $heir) {
  if (!is_array($heir)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "Heredero inválido en posición {$i}"]);
    exit;
  }

  $role = $heir['role'] ?? null;
  $count = $heir['count'] ?? null;

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

$normalizedHeirs = [];
$roleIndex = [];
foreach ($validatedHeirs as $heir) {
  $role = $heir['role'];

  if (isset($roleIndex[$role])) {
    $normalizedHeirs[$roleIndex[$role]]['count'] += $heir['count'];
  } else {
    $roleIndex[$role] = count($normalizedHeirs);
    $normalizedHeirs[] = $heir;
  }
}

foreach ($normalizedHeirs as $i => $heir) {
  if ($heir['count'] > 100) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "Cantidad fuera de rango en posición {$i}"]);
    exit;
  }
}

$clean['heirs'] = $normalizedHeirs;

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
  $uiMeta = $data['ui_meta'];

  if (!is_array($uiMeta)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'ui_meta inválido']);
    exit;
  }

  $allowedMetaKeys = ['sex', 'decedentId', 'source'];
  $filteredUiMeta = [];

  foreach ($allowedMetaKeys as $key) {
    if (array_key_exists($key, $uiMeta)) {
      $filteredUiMeta[$key] = $uiMeta[$key];
    }
  }

  if (array_key_exists('sex', $filteredUiMeta)) {
    $sex = $filteredUiMeta['sex'];

    if (!is_string($sex)) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'error' => 'ui_meta inválido']);
      exit;
    }

    $sex = trim($sex);

    if (!in_array($sex, ['male', 'female', 'unknown'], true)) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'error' => 'ui_meta inválido']);
      exit;
    }

    $filteredUiMeta['sex'] = $sex;
  }

  if (array_key_exists('decedentId', $filteredUiMeta)) {
    $decedentId = $filteredUiMeta['decedentId'];

    if (!is_string($decedentId)) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'error' => 'ui_meta inválido']);
      exit;
    }

    $decedentId = trim($decedentId);

    if (strlen($decedentId) > 32) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'error' => 'ui_meta inválido']);
      exit;
    }

    if ($decedentId !== '' && !preg_match('/^P[0-9]+$/', $decedentId)) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'error' => 'ui_meta inválido']);
      exit;
    }

    $filteredUiMeta['decedentId'] = $decedentId;
  }

  if (array_key_exists('source', $filteredUiMeta)) {
    $source = $filteredUiMeta['source'];

    if (!is_string($source)) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'error' => 'ui_meta inválido']);
      exit;
    }

    $source = trim($source);

    if (strlen($source) > 40) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'error' => 'ui_meta inválido']);
      exit;
    }

    $filteredUiMeta['source'] = $source;
  }

  if (!empty($filteredUiMeta)) {
    $clean['ui_meta'] = $filteredUiMeta;
  }
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
    $error['debug'] = mb_substr($e->getMessage(), 0, 500);
  }

  echo json_encode($error);
}
