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

final class SistersWithDaughtersStrategy implements AsabaStrategy
{
    private const FLAG_CONSANGUINE_ASABA_WITH_DAUGHTER = 'maliki.flag.consanguine_asaba_with_daughter';

    public function tryDistribute(Fraction $residual, EligibilityResult $eligibility): ?AsabaOutcome
    {
        $context = $eligibility->getContext();
        $daughterCount = $eligibility->getHeirCount(HeirRole::DAUGHTER);
        $hasFemaleDescendant = $context->hasFemaleDescendant();
        $hasMaleDescendant = $context->hasMaleDescendant();
        $hasDaughterLike = $daughterCount > 0 || $hasFemaleDescendant;

        if (!$hasDaughterLike || $hasMaleDescendant || $context->hasAscMale()) {
            return null;
        }

        $fullBrothers = $eligibility->getHeirCount(HeirRole::FULL_BROTHER);
        $fullSisters = $eligibility->getHeirCount(HeirRole::FULL_SISTER);

        if ($fullBrothers > 0) {
            [$maleShares, $femaleShares] = ShareUtils::splitGroupTwoToOne($residual, $fullBrothers, $fullSisters);

            return AsabaOutcome::fromTwoGroups(
                HeirRole::FULL_BROTHER,
                $maleShares,
                HeirRole::FULL_SISTER,
                $femaleShares,
                'asaba_full_siblings_with_daughters',
                'Full brothers take residue (2:1) in presence of daughters'
            );
        }

        if ($context->isKalala() && $fullSisters > 0) {
            $shares = ShareUtils::splitGroupEqually($residual, $fullSisters);

            return AsabaOutcome::fromSingleGroup(
                HeirRole::FULL_SISTER,
                $shares,
                'asaba_with_daughter',
                "Full sister ta'sib with daughter(s)",
                'equal'
            );
        }

        if (
            $context->isKalala()
            && $this->hasSpecialFlag($eligibility, self::FLAG_CONSANGUINE_ASABA_WITH_DAUGHTER)
        ) {
            $consanguineBrothers = $eligibility->getHeirCount(HeirRole::CONSANGUINE_BROTHER);
            if ($consanguineBrothers === 0) {
                $consanguineSisters = $eligibility->getHeirCount(HeirRole::CONSANGUINE_SISTER);
                if ($consanguineSisters > 0) {
                    $shares = ShareUtils::splitGroupEqually($residual, $consanguineSisters);

                    return AsabaOutcome::fromSingleGroup(
                        HeirRole::CONSANGUINE_SISTER,
                        $shares,
                        'asaba_with_daughter',
                        "Consanguine sister ta'sib with daughter(s)",
                        'equal'
                    );
                }
            }
        }

        return null;
    }

    private function hasSpecialFlag(EligibilityResult $eligibility, string $flagId): bool
    {
        return in_array($flagId, $eligibility->getContext()->getAppliedSpecialFlags(), true);
    }
}
