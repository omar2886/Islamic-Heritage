<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Math\Fraction;

final class ShareUtils
{
    /**
     * @return Fraction[]
     */
    public static function splitGroupEqually(Fraction $group, int $n): array
    {
        if ($n <= 0) {
            return [];
        }

        return array_fill(0, $n, $group->div(Fraction::fromInts($n))->reduce());
    }

    /**
     * @return array{0:Fraction[],1:Fraction[]}
     */
    public static function splitGroupTwoToOne(Fraction $group, int $m, int $f): array
    {
        $weight = $m * 2 + $f;
        if ($weight <= 0) {
            return [[], []];
        }

        $unit = $group->div(Fraction::fromInts($weight))->reduce();

        return [
            array_fill(0, max(0, $m), $unit->mul(Fraction::fromInts(2))->reduce()),
            array_fill(0, max(0, $f), $unit->reduce()),
        ];
    }
}
