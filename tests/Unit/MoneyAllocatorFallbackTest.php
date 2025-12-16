<?php

declare(strict_types=1);

require_once __DIR__ . '/MiniTestCase.php';
require_once __DIR__ . '/../../app/Services/MoneyAllocator.php';
require_once __DIR__ . '/../../app/Domain/Math/Fraction.php';

use App\Domain\Math\Fraction;
use App\Services\MoneyAllocator;
final class MoneyAllocatorFallbackTest extends MiniTestCase
{
    public function testAllocateHandlesEstateValue(): void
    {
        $fractions = [
            'wife' => Fraction::fromInts(1, 8),
            'son' => Fraction::fromInts(7, 8),
        ];

        $allocations = MoneyAllocator::allocate($fractions, '1000', 2);

        $this->assertSame(2, count($allocations));

        $totalUnits = 0;
        foreach ($allocations as $allocation) {
            [$integer, $fraction] = array_pad(explode('.', $allocation, 2), 2, '');
            $fraction = str_pad($fraction, 2, '0');
            $totalUnits += (int) ($integer . $fraction);
        }

        $formattedTotal = sprintf('%d.%02d', intdiv($totalUnits, 100), $totalUnits % 100);
        $this->assertSame('1000.00', $formattedTotal);
    }

    public function testFallbackDivisionMatchesIntDiv(): void
    {
        MoneyAllocator::__setForceFallbackForTests(true);

        $dividend = '999999999999';
        $divisor = '3';

        $bcDiv = new ReflectionMethod(MoneyAllocator::class, 'bcDiv');
        $bcDiv->setAccessible(true);
        $bcMod = new ReflectionMethod(MoneyAllocator::class, 'bcMod');
        $bcMod->setAccessible(true);

        $quotient = $bcDiv->invoke(null, $dividend, $divisor, 0);
        $remainder = $bcMod->invoke(null, $dividend, $divisor);

        $this->assertSame((string) intdiv(999999999999, 3), $quotient);
        $this->assertSame('0', $remainder);

        MoneyAllocator::__setForceFallbackForTests(false);
    }
}
