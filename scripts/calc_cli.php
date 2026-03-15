#!/usr/bin/env php
<?php
declare(strict_types=1);

require_once __DIR__ . '/calc_lib.php';

$inputJson = null;
if (in_array('--stdin', $argv, true)) {
    $inputJson = stream_get_contents(STDIN);
}
$input = $inputJson ? json_decode($inputJson, true) : [];

// Asegurar estructura mínima:
if (!is_array($input)) { $input = []; }

// Merge flags desde argv si procede (opcional)
if (!isset($input['cli_flags'])) $input['cli_flags'] = [];
if (in_array('--explain', $argv, true) && !in_array('--explain',$input['cli_flags'],true)) $input['cli_flags'][]='--explain';
if (in_array('--audit',   $argv, true) && !in_array('--audit',  $input['cli_flags'],true)) $input['cli_flags'][]='--audit';

try {
    $out = calc_from_array($input);
    echo json_encode($out, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit(0);
} catch (\Throwable $e) {
    fwrite(STDERR, get_class($e).': '.$e->getMessage().PHP_EOL);
    exit(1);
}
