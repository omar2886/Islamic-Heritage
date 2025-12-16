<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function jexit(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}

// Localiza calc_lib.php de forma segura
$libRel = __DIR__ . '/../../scripts/calc_lib.php';
$libAbs = realpath($libRel);
if (!$libAbs || !is_file($libAbs)) {
    jexit(500, [
        'ok' => false,
        'error' => 'calc_lib_not_found',
        'libRel' => $libRel,
        'libAbs' => $libAbs
    ]);
}

try {
    require_once $libAbs; // debe exponer calc_from_array()
} catch (Throwable $e) {
    jexit(500, [
        'ok' => false,
        'error' => 'calc_lib_require_failed',
        'message' => $e->getMessage(),
        'trace' => isset($_GET['debug']) ? $e->getTraceAsString() : null
    ]);
}

// Lee input JSON (opcional)
$raw = file_get_contents('php://input') ?: '';
$input = json_decode($raw, true);
if (!is_array($input)) {
    $input = [
        'heirs' => [
            ['role'=>'husband','count'=>1],
            ['role'=>'mother','count'=>1],
            ['role'=>'daughter','count'=>2]
        ],
        'cli_flags' => ['--explain','--audit']
    ];
} else {
    $flags = $input['cli_flags'] ?? [];
    if (!in_array('--explain',$flags,true)) $flags[]='--explain';
    if (!in_array('--audit',$flags,true))   $flags[]='--audit';
    $input['cli_flags'] = $flags;
}

try {
    $out = calc_from_array($input); // usa CalcRunner internamente
    jexit(200, ['ok'=>true, 'input'=>$input, 'output'=>$out]);
} catch (Throwable $e) {
    jexit(500, [
        'ok' => false,
        'error' => get_class($e),
        'message' => $e->getMessage(),
        'trace' => isset($_GET['debug']) ? $e->getTraceAsString() : null
    ]);
}
