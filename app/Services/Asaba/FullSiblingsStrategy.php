<?php

declare(strict_types=1);

namespace App\Services\Asaba;

use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Normalization\HeirRole;
use App\Domain\Math\Fraction;
use App\Services\ShareUtils;

require_once __DIR__ . '/../../Domain/Eligibility/EligibilityResult.php';
require_once __DIR__ . '/../../Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../../Domain/Math/Fraction.php';
require_once __DIR__ . '/../ShareUtils.php';
require_once __DIR__ . '/AsabaOutcome.php';
require_once __DIR__ . '/AsabaStrategy.php';

final class FullSiblingsStrategy implements AsabaStrategy
{
    public function tryDistribute(Fraction $residual, EligibilityResult $eligibility): ?AsabaOutcome
    {
        if ($eligibility->hasAnyRole(HeirRole::FATHER, HeirRole::PATERNAL_GRANDFATHER)) {
            return null;
        }

        if ($eligibility->hasAnyRole(HeirRole::SON, HeirRole::SONS_SON)) {
            return null;
        }

        if ($this->shouldDeferToDaughtersCase($eligibility)) {
            return null;
        }

        $brothers = $eligibility->getHeirCount(HeirRole::FULL_BROTHER);
        $sisters = $eligibility->getHeirCount(HeirRole::FULL_SISTER);
        if (($brothers + $sisters) === 0) {
            return null;
        }

        [$maleShares, $femaleShares] = ShareUtils::splitGroupTwoToOne($residual, $brothers, $sisters);

        return AsabaOutcome::fromTwoGroups(
            HeirRole::FULL_BROTHER,
            $maleShares,
            HeirRole::FULL_SISTER,
            $femaleShares,
            'asaba.precedence.full_siblings',
            "Full siblings absorb residual as 'asabah after paternal ascendants are absent.",
            'asaba_full_siblings'
        );
    }

    private function shouldDeferToDaughtersCase(EligibilityResult $eligibility): bool
    {
        $context = $eligibility->getContext();
        $hasFemaleDescendant = $context->hasFemaleDescendant() || $eligibility->getHeirCount(HeirRole::DAUGHTER) > 0;
        if (!$hasFemaleDescendant) {
            return false;
        }

        if ($context->hasMaleDescendant()) {
            return false;
        }

        return !$context->hasAscMale();
    }
}
