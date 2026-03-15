<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Math\Fraction;
use InvalidArgumentException;

final class ShareAlgebra
{
    /**
     * @param array<string,Fraction> $shares
     */
    public static function sum(array $shares): Fraction
    {
        $sum = Fraction::zero();
        foreach ($shares as $share) {
            if (!$share instanceof Fraction) {
                throw new InvalidArgumentException('Share must be a Fraction instance.');
            }

            $sum = $sum->add($share)->reduce();
        }

        return $sum;
    }

    /**
     * @param array<string,Fraction> $shares
     */
    public static function assertSumIsOne(array $shares): void
    {
        $sum = self::sum($shares)->reduce();
        if (!$sum->eq(Fraction::one())) {
            throw new InvalidArgumentException('Invariant Σ!=1: got ' . $sum->asString());
        }
    }
}
