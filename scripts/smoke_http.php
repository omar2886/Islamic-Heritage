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

    $rolesResponse = @file_get_contents("http://127.0.0.1:{$port}/api/roles.php");
    $rolesStatus = $http_response_header[0] ?? '';

    if (strpos($rolesStatus, ' 200 ') === false) {
        fwrite(STDERR, sprintf('[FAIL] HTTP inesperado en roles: %s\n', $rolesStatus));
        exit(1);
    }

    $rolesDecoded = json_decode($rolesResponse, true);
    $roles = $rolesDecoded['roles'] ?? [];
    if (!is_array($roles)) {
        fwrite(STDERR, "[FAIL] respuesta de roles inválida\n");
        exit(1);
    }

    if (in_array('unknown', $roles, true)) {
        fwrite(STDERR, "[FAIL] roles incluye entry 'unknown'\n");
        exit(1);
    }

    echo "[OK] API roles expone catálogo sin 'unknown'\n";

    $largeBody = str_repeat('a', 210000);
    $largeContext = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $largeBody,
            'ignore_errors' => true,
            'timeout' => 5,
        ],
    ]);

    $largeResponse = @file_get_contents("http://127.0.0.1:{$port}/api/calc.php", false, $largeContext);
    $largeStatus = $http_response_header[0] ?? '';

    if (strpos($largeStatus, ' 413 ') === false) {
        fwrite(STDERR, sprintf('[FAIL] HTTP inesperado para payload grande: %s\n', $largeStatus));
        exit(1);
    }

    echo "[OK] API calc rechaza payload grande con 413\n";

    $invalidUiMetaContext = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => json_encode([
                'heirs' => [
                    ['role' => 'husband', 'count' => 1],
                ],
                'ui_meta' => 'x',
            ], JSON_UNESCAPED_SLASHES),
            'ignore_errors' => true,
            'timeout' => 5,
        ],
    ]);

    $invalidUiMetaResponse = @file_get_contents("http://127.0.0.1:{$port}/api/calc.php", false, $invalidUiMetaContext);
    $invalidUiMetaStatus = $http_response_header[0] ?? '';

    if (strpos($invalidUiMetaStatus, ' 400 ') === false) {
        fwrite(STDERR, sprintf('[FAIL] HTTP inesperado para ui_meta inválido: %s\n', $invalidUiMetaStatus));
        exit(1);
    }

    $invalidUiMetaDecoded = json_decode($invalidUiMetaResponse, true);
    $invalidUiMetaError = $invalidUiMetaDecoded['error'] ?? '';

    if ($invalidUiMetaError !== 'ui_meta inválido') {
        fwrite(STDERR, sprintf('[FAIL] error inesperado para ui_meta inválido: %s\n', is_string($invalidUiMetaError) ? $invalidUiMetaError : '(sin error)'));
        exit(1);
    }

    echo "[OK] API calc valida ui_meta y rechaza tipos inválidos con 400\n";

    $unknownContext = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => json_encode([
                'heirs' => [
                    ['role' => 'unknown', 'count' => 1],
                ],
            ], JSON_UNESCAPED_SLASHES),
            'ignore_errors' => true,
            'timeout' => 5,
        ],
    ]);

    $unknownResponse = @file_get_contents("http://127.0.0.1:{$port}/api/calc.php", false, $unknownContext);
    $unknownStatus = $http_response_header[0] ?? '';

    if (strpos($unknownStatus, ' 400 ') === false) {
        fwrite(STDERR, sprintf('[FAIL] HTTP inesperado para rol unknown: %s\n', $unknownStatus));
        exit(1);
    }

    $unknownDecoded = json_decode($unknownResponse, true);
    $unknownError = $unknownDecoded['error'] ?? '';
    if ($unknownError !== 'Rol de heredero inválido en posición 0') {
        fwrite(STDERR, sprintf('[FAIL] error inesperado para rol unknown: %s\n', is_string($unknownError) ? $unknownError : '(sin error)'));
        exit(1);
    }

    echo "[OK] API calc rechaza rol 'unknown' con 400 específico\n";

    $duplicateContext = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => json_encode([
                'heirs' => [
                    ['role' => 'wife', 'count' => 1],
                    ['role' => 'wife', 'count' => 2],
                ],
            ], JSON_UNESCAPED_SLASHES),
            'ignore_errors' => true,
            'timeout' => 5,
        ],
    ]);

    $duplicateResponse = @file_get_contents("http://127.0.0.1:{$port}/api/calc.php", false, $duplicateContext);
    $duplicateStatus = $http_response_header[0] ?? '';

    if (strpos($duplicateStatus, ' 200 ') === false) {
        fwrite(STDERR, sprintf('[FAIL] HTTP inesperado para herederos duplicados: %s\n', $duplicateStatus));
        exit(1);
    }

    $duplicateDecoded = json_decode($duplicateResponse, true);
    if (!is_array($duplicateDecoded) || ($duplicateDecoded['ok'] ?? false) !== true) {
        fwrite(STDERR, '[FAIL] respuesta inesperada para herederos duplicados normalizados\n');
        exit(1);
    }

    echo "[OK] API calc normaliza herederos duplicados y responde 200\n";
} finally {
    if (is_resource($server)) {
        proc_terminate($server);
        proc_close($server);
    }
}

exit(0);
