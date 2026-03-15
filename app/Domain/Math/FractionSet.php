<?php

declare(strict_types=1);

namespace App\Domain\Math;

use InvalidArgumentException;

final class FractionSet
{
    /**
     * @param Fraction[] $values
     */
    public static function sum(array $values): Fraction
    {
        $total = Fraction::zero();
        foreach ($values as $index => $fraction) {
            if (!$fraction instanceof Fraction) {
                throw new InvalidArgumentException(sprintf('Value at index %d must be a Fraction.', $index));
            }

            $total = $total->add($fraction);
        }

        return $total;
    }

    /**
     * Scale the given fractions so that their sum matches the provided target fraction.
     *
     * @param Fraction[] $values
     * @return Fraction[]
     */
    public static function scaleTo(array $values, Fraction $target): array
    {
        if ($values === []) {
            return [];
        }

        $total = self::sum($values);
        if ($total->equals(Fraction::zero())) {
            throw new InvalidArgumentException('Cannot scale fractions when the total is zero.');
        }

        $factor = $target->div($total);

        return array_map(static fn (Fraction $fraction): Fraction => $fraction->mul($factor), $values);
    }
}
