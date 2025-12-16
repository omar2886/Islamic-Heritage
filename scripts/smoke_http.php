<?php
declare(strict_types=1);

// Smoke test to validate calc pipeline and HTTP endpoint.
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

$descriptorSpec = [
    0 => ['pipe', 'r'],
    1 => ['file', sys_get_temp_dir() . '/heritage_server_stdout.log', 'a'],
    2 => ['file', sys_get_temp_dir() . '/heritage_server_stderr.log', 'a'],
];

$port = 8123;
$docRoot = $root . '/public';
$command = ['php', '-S', "127.0.0.1:{$port}", '-t', $docRoot];

$server = proc_open($command, $descriptorSpec, $pipes, $docRoot);
if (!is_resource($server)) {
    fwrite(STDERR, "[FAIL] no se pudo iniciar servidor embebido\n");
    exit(1);
}

try {
    usleep(300000);

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => json_encode([
                'heirs' => [
                    ['role' => 'no_such_role', 'count' => 1],
                ],
            ], JSON_UNESCAPED_SLASHES),
            'ignore_errors' => true,
            'timeout' => 5,
        ],
    ]);

    $response = @file_get_contents("http://127.0.0.1:{$port}/api/calc.php", false, $context);
    $statusLine = $http_response_header[0] ?? '';

    if (strpos($statusLine, ' 400 ') === false) {
        fwrite(STDERR, sprintf('[FAIL] HTTP inesperado: %s\n', $statusLine));
        exit(1);
    }

    $decoded = json_decode($response, true);
    $error = $decoded['error'] ?? '';
    if ($error !== 'Rol desconocido en posición 0') {
        fwrite(STDERR, sprintf('[FAIL] error inesperado: %s\n', is_string($error) ? $error : '(sin error)'));
        exit(1);
    }

    echo "[OK] API calc rechaza roles desconocidos con 400\n";
} finally {
    if (is_resource($server)) {
        proc_terminate($server);
        proc_close($server);
    }
}

exit(0);
