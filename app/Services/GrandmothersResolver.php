<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Math\Fraction;
use App\Domain\Normalization\HeirRole;
use App\Domain\Rules\RuleBookMaliki;

final class GrandmothersResolver
{
    /**
     * @param array<string,Fraction> $groupShares
     */
    public function resolve(
        array &$groupShares,
        RuleBookMaliki $ruleBook,
        EligibilityResult $eligibility
    ): void {
        if ($eligibility->hasHeir(HeirRole::MOTHER)) {
            unset($groupShares[HeirRole::MATERNAL_GRANDMOTHER], $groupShares[HeirRole::PATERNAL_GRANDMOTHER]);
            return;
        }

        $maternalCount = $eligibility->getHeirCount(HeirRole::MATERNAL_GRANDMOTHER);
        $paternalCount = $eligibility->getHeirCount(HeirRole::PATERNAL_GRANDMOTHER);

        if (($maternalCount + $paternalCount) === 0) {
            return;
        }

        if ($eligibility->hasHeir(HeirRole::FATHER)) {
            $paternalCount = 0;
        }

        if (($maternalCount + $paternalCount) === 0) {
            unset($groupShares[HeirRole::MATERNAL_GRANDMOTHER], $groupShares[HeirRole::PATERNAL_GRANDMOTHER]);
            return;
        }

        $maternalShare = null;
        $paternalShare = null;
        $oneSixth = Fraction::fromString('1/6');

        if ($maternalCount > 0 && $paternalCount > 0) {
            $maternalShare = $oneSixth;
            $paternalShare = $oneSixth;
        } elseif ($maternalCount > 0 && $paternalCount === 0) {
            $maternalShare = $oneSixth;
        } elseif ($paternalCount > 0 && $maternalCount === 0) {
            $paternalShare = $oneSixth;
        }

        if ($maternalShare instanceof Fraction) {
            $groupShares[HeirRole::MATERNAL_GRANDMOTHER] = $maternalShare;
        } else {
            unset($groupShares[HeirRole::MATERNAL_GRANDMOTHER]);
        }

        if ($paternalShare instanceof Fraction) {
            $groupShares[HeirRole::PATERNAL_GRANDMOTHER] = $paternalShare;
        } else {
            unset($groupShares[HeirRole::PATERNAL_GRANDMOTHER]);
        }
    }
}
