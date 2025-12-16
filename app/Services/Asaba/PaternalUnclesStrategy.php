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

final class PaternalUnclesStrategy implements AsabaStrategy
{
    public function tryDistribute(Fraction $residual, EligibilityResult $eligibility): ?AsabaOutcome
    {
        if ($residual->compareTo(Fraction::zero()) === 0) {
            return null;
        }

        if ($eligibility->hasAnyRole(
            HeirRole::SON,
            HeirRole::SONS_SON,
            HeirRole::FATHER,
            HeirRole::PATERNAL_GRANDFATHER
        )) {
            return null;
        }

        if ($eligibility->hasAnyRole(
            HeirRole::FULL_BROTHER,
            HeirRole::CONSANGUINE_BROTHER,
            HeirRole::FULL_SISTER,
            HeirRole::CONSANGUINE_SISTER
        )) {
            return null;
        }

        $fullUncles = $eligibility->getHeirCount(HeirRole::PATERNAL_UNCLE);
        $fullUnclesDaughters = $eligibility->getHeirCount(HeirRole::PATERNAL_UNCLES_DAUGHTER);
        if (($fullUncles + $fullUnclesDaughters) > 0) {
            [$maleShares, $femaleShares] = ShareUtils::splitGroupTwoToOne($residual, $fullUncles, $fullUnclesDaughters);

            return AsabaOutcome::fromTwoGroups(
                HeirRole::PATERNAL_UNCLE,
                $maleShares,
                HeirRole::PATERNAL_UNCLES_DAUGHTER,
                $femaleShares,
                'asaba.paternal_uncles.full',
                "Paternal uncles inherit the residue as 'asabah when no nearer agnates remain.",
                'asaba_paternal_uncles_full'
            );
        }

        $consanguineUncles = $eligibility->getHeirCount(HeirRole::CONSANGUINE_PATERNAL_UNCLE);
        $consanguineUnclesDaughters = $eligibility->getHeirCount(HeirRole::CONSANGUINE_PATERNAL_UNCLES_DAUGHTER);
        if (($consanguineUncles + $consanguineUnclesDaughters) > 0) {
            [$maleShares, $femaleShares] = ShareUtils::splitGroupTwoToOne(
                $residual,
                $consanguineUncles,
                $consanguineUnclesDaughters
            );

            return AsabaOutcome::fromTwoGroups(
                HeirRole::CONSANGUINE_PATERNAL_UNCLE,
                $maleShares,
                HeirRole::CONSANGUINE_PATERNAL_UNCLES_DAUGHTER,
                $femaleShares,
                'asaba.paternal_uncles.consanguine',
                "Consanguine paternal uncles inherit once no full paternal uncles survive.",
                'asaba_paternal_uncles_consanguine'
            );
        }

        $fullUncleSons = $eligibility->getHeirCount(HeirRole::PATERNAL_UNCLE_SON);
        $fullUncleSonsDaughters = $eligibility->getHeirCount(HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER);
        if (($fullUncleSons + $fullUncleSonsDaughters) > 0) {
            [$maleShares, $femaleShares] = ShareUtils::splitGroupTwoToOne(
                $residual,
                $fullUncleSons,
                $fullUncleSonsDaughters
            );

            return AsabaOutcome::fromTwoGroups(
                HeirRole::PATERNAL_UNCLE_SON,
                $maleShares,
                HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER,
                $femaleShares,
                'asaba.paternal_uncle_sons.full',
                "Sons of paternal uncles inherit the residue when their fathers are absent.",
                'asaba_paternal_uncle_sons_full'
            );
        }

        $consanguineUncleSons = $eligibility->getHeirCount(HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON);
        $consanguineUncleSonsDaughters = $eligibility->getHeirCount(HeirRole::CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER);
        if (($consanguineUncleSons + $consanguineUncleSonsDaughters) > 0) {
            [$maleShares, $femaleShares] = ShareUtils::splitGroupTwoToOne(
                $residual,
                $consanguineUncleSons,
                $consanguineUncleSonsDaughters
            );

            return AsabaOutcome::fromTwoGroups(
                HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON,
                $maleShares,
                HeirRole::CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER,
                $femaleShares,
                'asaba.paternal_uncle_sons.consanguine',
                "Consanguine sons of paternal uncles inherit only when nearer agnates are absent.",
                'asaba_paternal_uncle_sons_consanguine'
            );
        }

        return null;
    }
}
