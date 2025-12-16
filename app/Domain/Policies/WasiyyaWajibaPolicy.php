<?php

declare(strict_types=1);

namespace App\Domain\Policies;

use App\Domain\Math\Fraction;

/**
 * @implements SubstitutionPolicy<\Heir>
 */
final class WasiyyaWajibaPolicy implements SubstitutionPolicy
{
    /**
     * @var array<string,mixed>|null
     */
    private static ?array $lastComputation = null;

    /**
     * @param \Heir[] $heirs
     * @return \Heir[]
     */
    public function apply(array $heirs, Fraction $netEstateCap): array
    {
        self::$lastComputation = [
            'policy' => 'wasiyya_wajiba',
            'cap' => $netEstateCap,
            'hypothetical' => Fraction::zero(),
            'sum' => Fraction::zero(),
            'branches' => [],
            'reason' => 'no_predeceased_descendants',
        ];

        $branch = $this->detectGrandchildrenBranch($heirs);
        if ($branch['males'] === 0 && $branch['females'] === 0) {
            return $heirs;
        }

        $livingSons = $this->countRole($heirs, \HeirRole::SON);
        $livingDaughters = $this->countRole($heirs, \HeirRole::DAUGHTER);

        $hypotheticalShare = $this->computeHypotheticalShare($livingSons, $livingDaughters);

        self::$lastComputation['hypothetical'] = $hypotheticalShare;
        self::$lastComputation['reason'] = 'eligible_grandchildren';

        $allocatable = $hypotheticalShare;
        $capped = false;
        if ($allocatable->compareTo($netEstateCap) > 0) {
            $allocatable = $netEstateCap;
            $capped = true;
        }

        if ($allocatable->isZero()) {
            self::$lastComputation['sum'] = Fraction::zero();
            self::$lastComputation['branches'] = [];

            return $heirs;
        }

        $distribution = $this->distributeWithinBranch($branch['males'], $branch['females'], $allocatable);

        self::$lastComputation['sum'] = $allocatable;
        self::$lastComputation['branches'] = [[
            'label' => 'predeceased_son_branch',
            'hypothetical' => $hypotheticalShare,
            'share' => $allocatable,
            'limited_by_cap' => $capped,
            'alloc' => $distribution,
        ]];

        return $heirs;
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function getLastComputation(): ?array
    {
        return self::$lastComputation;
    }

    /**
     * @param \Heir[] $heirs
     * @return array{males:int,females:int}
     */
    private function detectGrandchildrenBranch(array $heirs): array
    {
        $males = 0;
        $females = 0;

        foreach ($heirs as $heir) {
            $role = $heir->getRole();
            if ($role === \HeirRole::SONS_SON) {
                $males += $heir->getCount();
            } elseif ($role === \HeirRole::SONS_DAUGHTER) {
                $females += $heir->getCount();
            }
        }

        return ['males' => $males, 'females' => $females];
    }

    private function computeHypotheticalShare(int $livingSons, int $livingDaughters): Fraction
    {
        if ($livingSons === 0 && $livingDaughters === 0) {
            return Fraction::fromInt(1);
        }

        $ghostWeight = 2;
        $totalUnits = ($livingSons * 2) + $livingDaughters + $ghostWeight;

        if ($totalUnits <= 0) {
            return Fraction::zero();
        }

        return Fraction::fromInts($ghostWeight, $totalUnits);
    }

    /**
     * @return array<string,mixed>
     */
    private function distributeWithinBranch(int $maleCount, int $femaleCount, Fraction $total): array
    {
        $maleWeight = $maleCount * 2;
        $femaleWeight = $femaleCount;
        $totalWeight = $maleWeight + $femaleWeight;

        if ($totalWeight === 0) {
            return [
                'grandsons' => [
                    'count' => 0,
                    'total' => Fraction::zero(),
                    'per_capita' => Fraction::zero(),
                ],
                'granddaughters' => [
                    'count' => 0,
                    'total' => Fraction::zero(),
                    'per_capita' => Fraction::zero(),
                ],
            ];
        }

        $maleFraction = $maleWeight === 0
            ? Fraction::zero()
            : $total->mul(Fraction::fromInts($maleWeight, $totalWeight));
        $femaleFraction = $femaleWeight === 0
            ? Fraction::zero()
            : $total->mul(Fraction::fromInts($femaleWeight, $totalWeight));

        $malePerCapita = $maleCount > 0
            ? $maleFraction->div(Fraction::fromInt($maleCount))
            : Fraction::zero();
        $femalePerCapita = $femaleCount > 0
            ? $femaleFraction->div(Fraction::fromInt($femaleCount))
            : Fraction::zero();

        return [
            'grandsons' => [
                'count' => $maleCount,
                'total' => $maleFraction,
                'per_capita' => $malePerCapita,
            ],
            'granddaughters' => [
                'count' => $femaleCount,
                'total' => $femaleFraction,
                'per_capita' => $femalePerCapita,
            ],
        ];
    }

    /**
     * @param \Heir[] $heirs
     */
    private function countRole(array $heirs, string $role): int
    {
        $total = 0;
        foreach ($heirs as $heir) {
            if ($heir->getRole() === $role) {
                $total += $heir->getCount();
            }
        }

        return $total;
    }
}
