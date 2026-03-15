<?php
declare(strict_types=1);

require_once __DIR__ . '/../../scripts/calc_lib.php';

class_exists(\App\Scripts\CalcRunner::class);

$input = [
    'heirs' => [
        ['role' => 'daughter', 'count' => 1],
        ['role' => 'paternal_uncle', 'count' => 1],
    ],
    'cli_flags' => ['--audit', '--strict'],
];

$out = calc_from_array($input);

$groupShares = $out['group_shares'] ?? [];
if (($groupShares['daughter'] ?? null) !== '1/2') {
    fwrite(STDERR, 'Unexpected daughter share: ' . ($groupShares['daughter'] ?? 'null') . PHP_EOL);
    exit(1);
}

if (($groupShares['paternal_uncle'] ?? null) !== '1/2') {
    fwrite(STDERR, 'Unexpected paternal_uncle share: ' . ($groupShares['paternal_uncle'] ?? 'null') . PHP_EOL);
    exit(1);
}

$audit = $out['audit'] ?? [];
if (($audit['radd'] ?? null) !== null) {
    fwrite(STDERR, 'RADD should be gated but audit.radd is present' . PHP_EOL);
    exit(1);
}

if (($out['residual_consumed'] ?? null) !== '1/2') {
    fwrite(STDERR, 'Residual should be consumed by ASABA as 1/2' . PHP_EOL);
    exit(1);
}

$warnings = $out['warnings'] ?? [];
foreach ($warnings as $warning) {
    if (is_string($warning) && str_contains($warning, 'Unknown heir role')) {
        fwrite(STDERR, 'Unexpected warning: ' . $warning . PHP_EOL);
        exit(1);
    }
}

echo "OK" . PHP_EOL;
