<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Normalization\HeirRole;

final class EligibilityValidator
{
    /**
     * @param array<int,array{role:string,count:mixed}> $heirs
     *
     * @return array<int,array{role:string,count:int}>
     */
    public static function normalizeInput(array $heirs): array
    {
        $wifeCount = 0;
        $normalized = [];

        foreach ($heirs as $heir) {
            if (!is_array($heir)) {
                continue;
            }

            $role = (string) ($heir['role'] ?? '');
            $count = (int) ($heir['count'] ?? 0);

            if (in_array($role, ['wife', 'wives'], true)) {
                $wifeCount += $count;
                continue;
            }

            $normalized[] = ['role' => $role, 'count' => $count];
        }

        if ($wifeCount > 0) {
            $normalized[] = ['role' => 'wife', 'count' => $wifeCount];
        }

        return $normalized;
    }

    /**
     * @return list<string>
     */
    public static function validate(EligibilityResult $eligibility): array
    {
        $warnings = [];

        $wifeCount = $eligibility->getHeirCount(HeirRole::WIFE);
        $wivesCount = $eligibility->getHeirCount('wives');
        if ($wifeCount > 0 && $wivesCount > 0) {
            $warnings[] = sprintf(
                "Conflicting spouse entries detected (wife=%d, wives=%d); treating them as a single wives group.",
                $wifeCount,
                $wivesCount
            );
        }

        if ($eligibility->hasHeir(HeirRole::FATHER) && $eligibility->hasHeir(HeirRole::PATERNAL_GRANDFATHER)) {
            $warnings[] = 'Father present: paternal_grandfather entry ignored.';
        }

        $hasMaleDescendant = $eligibility->hasHeir(HeirRole::SON) || $eligibility->hasHeir(HeirRole::SONS_SON);
        if ($hasMaleDescendant) {
            $blockedBrothers = [];
            if ($eligibility->hasHeir(HeirRole::FULL_BROTHER)) {
                $blockedBrothers[] = HeirRole::FULL_BROTHER;
            }
            if ($eligibility->hasHeir(HeirRole::CONSANGUINE_BROTHER)) {
                $blockedBrothers[] = HeirRole::CONSANGUINE_BROTHER;
            }

            if ($blockedBrothers !== []) {
                $warnings[] = sprintf(
                    'Male descendant present: %s entries ignored.',
                    implode(', ', $blockedBrothers)
                );
            }
        }

        if ($eligibility->hasHeir(HeirRole::FULL_BROTHER) && $eligibility->hasHeir(HeirRole::CONSANGUINE_BROTHER)) {
            $warnings[] = 'Consanguine brothers are blocked by full brothers.';
        }

        if ($eligibility->hasAnyRole(HeirRole::FATHER, HeirRole::PATERNAL_GRANDFATHER)
            && $eligibility->hasAnyRole(
                HeirRole::PATERNAL_UNCLE,
                HeirRole::PATERNAL_UNCLE_SON,
                HeirRole::CONSANGUINE_PATERNAL_UNCLE,
                HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON
            )
        ) {
            $warnings[] = 'Ascendant male present: paternal uncles/nephews are blocked.';
        }

        return $warnings;
    }
}
