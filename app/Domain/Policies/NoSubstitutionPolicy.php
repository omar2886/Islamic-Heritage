<?php

declare(strict_types=1);

namespace App\Domain\Policies;

use App\Domain\Math\Fraction;

/**
 * @implements SubstitutionPolicy<\Heir>
 */
final class NoSubstitutionPolicy implements SubstitutionPolicy
{
    /**
     * @param \Heir[] $heirs
     * @return \Heir[]
     */
    public function apply(array $heirs, Fraction $netEstateCap): array
    {
        return $heirs;
    }
}
