<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Eligibility\EligibilityResult as DomainEligibilityResult;
use App\Domain\Eligibility\HeirRole;

final class EligibilityInvariants
{
    /**
     * @return array{spouses_radd_exclusion:bool,ancestor_block:bool,descendant_block:bool}
     */
    public static function compute(DomainEligibilityResult $e): array
    {
        $inv = ['spouses_radd_exclusion' => true];

        $inv['ancestor_block'] = $e->has(HeirRole::FATHER)
            ? !$e->has(HeirRole::PATERNAL_GRANDFATHER)
            : true;

        $hasMaleDesc = $e->has(HeirRole::SON) || $e->has(HeirRole::SONS_SON);
        $hasSibs = $e->has(HeirRole::FULL_BROTHER)
            || $e->has(HeirRole::CONSANGUINE_BROTHER)
            || $e->has(HeirRole::FULL_SISTER)
            || $e->has(HeirRole::CONSANGUINE_SISTER);

        $inv['descendant_block'] = $hasMaleDesc ? !$hasSibs : true;

        return $inv;
    }
}
