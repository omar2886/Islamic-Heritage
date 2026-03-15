<?php

require_once __DIR__ . '/../app/Domain/Math/Fraction.php';
require_once __DIR__ . '/../app/Services/MoneyAllocator.php';

use App\Domain\Math\Fraction;
use App\Services\MoneyAllocator;

$failures = 0;

function assertAmountMap(array $expected, array $actual, string $label, int &$failures): void
{
    if ($expected !== $actual) {
        $failures++;
        printf(
            "[FAIL] %s expected %s got %s\n",
            $label,
            json_encode($expected, JSON_UNESCAPED_SLASHES),
            json_encode($actual, JSON_UNESCAPED_SLASHES)
        );

        return;
    }

    printf("[OK] %s\n", $label);
}

$fractions = [
    'daughter_1' => Fraction::fromString('1/3'),
    'daughter_2' => Fraction::fromString('1/3'),
    'father' => Fraction::fromString('1/3'),
];
$expected = [
    'daughter_1' => '3333.33',
    'daughter_2' => '3333.33',
    'father' => '3333.34',
];
$result = MoneyAllocator::allocate($fractions, '10000.00', 2);
assertAmountMap($expected, $result, 'equal thirds allocation', $failures);

$expectedTieEven = ['estate' => '1.00'];
$resultTieEven = MoneyAllocator::allocate(['estate' => Fraction::fromInt(1)], '1.005', 2);
assertAmountMap($expectedTieEven, $resultTieEven, 'round half even ties to even', $failures);

$expectedTieOdd = ['estate' => '1.02'];
$resultTieOdd = MoneyAllocator::allocate(['estate' => Fraction::fromInt(1)], '1.015', 2);
assertAmountMap($expectedTieOdd, $resultTieOdd, 'round half even rounds odd up', $failures);

if ($failures > 0) {
    printf("\nFailures: %d\n", $failures);
    exit(1);
}

printf("\nAll tests passed (%d cases).\n", 3);
exit(0);
