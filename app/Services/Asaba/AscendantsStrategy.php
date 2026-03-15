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

final class AscendantsStrategy implements AsabaStrategy
{
    public function tryDistribute(Fraction $residual, EligibilityResult $eligibility): ?AsabaOutcome
    {
        if ($eligibility->hasHeir(HeirRole::FATHER)) {
            $count = $eligibility->getHeirCount(HeirRole::FATHER);
            if ($count <= 0) {
                return null;
            }

            $context = $eligibility->getContext();
            $reason = $context->hasDescendants()
                ? 'Father absorbs residual in presence of descendants without a son.'
                : 'Father absorbs entire residual as sole residuary.';

            $shares = ShareUtils::splitGroupEqually($residual, $count);

            return AsabaOutcome::fromSingleGroup(
                HeirRole::FATHER,
                $shares,
                'asaba.precedence.father',
                $reason,
                'single'
            );
        }

        if ($eligibility->hasHeir(HeirRole::PATERNAL_GRANDFATHER)) {
            $count = $eligibility->getHeirCount(HeirRole::PATERNAL_GRANDFATHER);
            if ($count <= 0) {
                return null;
            }

            $shares = ShareUtils::splitGroupEqually($residual, $count);

            return AsabaOutcome::fromSingleGroup(
                HeirRole::PATERNAL_GRANDFATHER,
                $shares,
                'asaba.precedence.paternal_grandfather',
                'Paternal grandfather absorbs residual once father is absent.',
                'single'
            );
        }

        return null;
    }
}
