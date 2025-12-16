<?php
declare(strict_types=1);
require_once __DIR__ . '/_guard.php';

header('Content-Type: application/json');

try {
    require_once __DIR__ . '/../../scripts/calc_lib.php';

    $scenarios = [
        [
            'input' => ['heirs' => [['role' => 'wife', 'count' => 3]]],
            'expect_sum' => '1/4',
        ],
        [
            'input' => ['heirs' => [
                ['role' => 'daughter', 'count' => 1],
                ['role' => 'paternal_uncle', 'count' => 1],
            ]],
            'expect_sum' => '1/1',
        ],
    ];

    $errors = [];
    foreach ($scenarios as $scenario) {
        $output = calc_from_array($scenario['input']);
        $sum = (string) ($output['sum_final'] ?? '');
        if ($sum !== $scenario['expect_sum']) {
            $errors[] = [
                'input' => $scenario['input'],
                'expected_sum' => $scenario['expect_sum'],
                'actual_sum' => $sum,
            ];
        }
    }

    echo json_encode([
        'ok' => $errors === [],
        'errors' => $errors,
    ], JSON_PRETTY_PRINT);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => $exception->getMessage(),
    ], JSON_PRETTY_PRINT);
}
