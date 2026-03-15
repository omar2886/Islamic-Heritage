<?php

declare(strict_types=1);

namespace App\Domain\Policies;

use App\Domain\Math\Fraction;

/**
 * @template THeir of \Heir
 */
interface SubstitutionPolicy
{
    /**
     * @param THeir[] $heirs
     * @return THeir[]
     */
    public function apply(array $heirs, Fraction $netEstateCap): array;
}
