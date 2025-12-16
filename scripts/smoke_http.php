<?php
declare(strict_types=1);

// Smoke test to validate calc pipeline without HTTP server.
$root = dirname(__DIR__);
require_once $root . '/scripts/calc_lib.php';

if (!function_exists('calc_from_array')) {
    fwrite(STDERR, "[FAIL] calc_from_array no disponible\n");
    exit(1);
}

$payload = [
    'heirs' => [
        ['role' => 'husband', 'count' => 1],
        ['role' => 'daughter', 'count' => 1],
    ],
    'cli_flags' => ['--explain', '--audit'],
];

try {
    $output = calc_from_array($payload);
} catch (\Throwable $throwable) {
    fwrite(STDERR, '[ERROR] calc_from_array: ' . $throwable->getMessage() . PHP_EOL);
    exit(1);
}

if (!is_array($output)) {
    fwrite(STDERR, "[FAIL] salida inesperada de calc_from_array\n");
    exit(1);
}

$expectedKeys = ['group_shares', 'individual_shares', 'sum_final'];
foreach ($expectedKeys as $key) {
    if (!array_key_exists($key, $output)) {
        fwrite(STDERR, sprintf('[FAIL] falta clave %s en la salida\n', $key));
        exit(1);
    }
}

$sumFinal = (string) ($output['sum_final'] ?? '');
if ($sumFinal !== '1/1') {
    fwrite(STDERR, sprintf('[FAIL] sum_final esperado 1/1, obtenido %s\n', $sumFinal));
    exit(1);
}

echo "[OK] calc_from_array devuelve estructura básica (sum_final=1/1)\n";
exit(0);
