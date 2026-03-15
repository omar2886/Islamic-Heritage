<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Math\Fraction;
use App\Domain\Normalization\HeirRole;
use App\Domain\Tracing\TraceEvent;

require_once __DIR__ . '/DescendantsAggregator.php';
require_once __DIR__ . '/ShareAlgebra.php';

final class NormalizedShares
{
    /** @var array<string,Fraction> */
    private array $normalizedGroupShares;

    /** @var array<string,Fraction[]> */
    private array $normalizedIndividualShares;

    private Fraction $sumFixedNormalized;

    private Fraction $residualForAsaba;

    /**
     * @var TraceEvent[]
     */
    private array $traceEvents;

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     * @param TraceEvent[]             $traceEvents
     */
    public function __construct(
        array $groupShares,
        array $individualShares,
        Fraction $residualForAsaba,
        array $traceEvents = []
    ) {
        $this->normalizedGroupShares = $this->normalizeGroupShares($groupShares);
        $this->normalizedIndividualShares = $this->normalizeIndividualShares($individualShares);
        $this->sumFixedNormalized = $this->sumFractions($this->normalizedGroupShares);
        $this->residualForAsaba = $residualForAsaba;
        $this->traceEvents = $this->normalizeTraceEvents($traceEvents);
    }

    /**
     * @return array<string,Fraction>
     */
    public function getNormalizedGroupShares(): array
    {
        return $this->normalizedGroupShares;
    }

    /**
     * @return array<string,Fraction[]>
     */
    public function getNormalizedIndividualShares(): array
    {
        return $this->normalizedIndividualShares;
    }

    public function getSumFixedNormalized(): Fraction
    {
        return $this->sumFixedNormalized;
    }

    public function getResidualForAsaba(): Fraction
    {
        return $this->residualForAsaba;
    }

    /**
     * @return TraceEvent[]
     */
    public function getTraceEvents(): array
    {
        return $this->traceEvents;
    }

    public function raddApplied(): bool
    {
        foreach ($this->traceEvents as $event) {
            if ($event->phase !== 'RADD') {
                continue;
            }

            $action = $event->data['action'] ?? null;
            if ($action === 'after') {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string,Fraction> $shares
     */
    private function normalizeGroupShares(array $shares): array
    {
        $normalized = [];
        foreach ($shares as $role => $share) {
            if (!$share instanceof Fraction) {
                throw new \InvalidArgumentException('Group shares must be Fraction instances.');
            }

            $normalized[$role] = $share;
        }

        ksort($normalized);

        return $normalized;
    }

    /**
     * @param array<string,Fraction[]> $shares
     */
    private function normalizeIndividualShares(array $shares): array
    {
        $normalized = [];
        foreach ($shares as $role => $fractions) {
            $normalized[$role] = [];
            foreach ($fractions as $fraction) {
                if (!$fraction instanceof Fraction) {
                    throw new \InvalidArgumentException('Individual shares must be Fraction instances.');
                }

                $normalized[$role][] = $fraction;
            }
        }

        ksort($normalized);

        return $normalized;
    }

    /**
     * @param array<string,Fraction> $fractions
     */
    private function sumFractions(array $fractions): Fraction
    {
        $sum = Fraction::zero();
        foreach ($fractions as $fraction) {
            $sum = $sum->add($fraction);
        }

        return $sum;
    }

    /**
     * @param TraceEvent[] $traceEvents
     * @return TraceEvent[]
     */
    private function normalizeTraceEvents(array $traceEvents): array
    {
        $normalized = [];
        foreach ($traceEvents as $event) {
            if (!$event instanceof TraceEvent) {
                throw new \InvalidArgumentException('Trace events must be TraceEvent instances.');
            }

            $normalized[] = $event;
        }

        return $normalized;
    }
}

final class ShareNormalizer
{
    private DescendantsAggregator $descAggr;

    private const SPOUSE_GROUP_KEYS = ['husband', 'wife', 'wives'];

    /**
     * @var TraceEvent[]
     */
    private array $traceEvents = [];

    /**
     * @var array<string,mixed>|null
     */
    private ?array $awlProof = null;

    /**
     * @var array<string,mixed>|null
     */
    private ?array $raddProof = null;

    public function __construct(?DescendantsAggregator $descAggr = null)
    {
        $this->descAggr = $descAggr ?? new DescendantsAggregator();
    }

    public function normalize(
        FixedShareResult $fixedShares,
        EligibilityResult $eligibility,
        bool $applyRadd = true
    ): NormalizedShares
    {
        $this->traceEvents = [];
        $this->awlProof = null;
        $this->raddProof = null;

        $groupShares = $fixedShares->getGroupShares();
        $individualShares = $fixedShares->getIndividualShares();

        $umariyyaApplied = $this->applyUmariyya($groupShares, $individualShares, $eligibility);

        $sumFixed = $umariyyaApplied
            ? $this->sumFractions($groupShares)
            : $fixedShares->getSumFixed();

        $one = Fraction::fromInt(1);
        $comparison = $sumFixed->compareTo($one);

        if ($comparison > 0) {
            return $this->applyAwl($groupShares, $individualShares, $sumFixed);
        }

        if ($comparison === 0) {
            return new NormalizedShares($groupShares, $individualShares, Fraction::zero(), $this->traceEvents);
        }

        $residual = $one->sub($sumFixed)->reduce();

        if (!$applyRadd || $this->hasAsabaPotential($eligibility)) {
            return new NormalizedShares($groupShares, $individualShares, $residual, $this->traceEvents);
        }

        $this->applyRadd($groupShares, $individualShares, $eligibility);

        return new NormalizedShares($groupShares, $individualShares, Fraction::zero(), $this->traceEvents);
    }

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function applyUmariyya(
        array &$groupShares,
        array &$individualShares,
        EligibilityResult $eligibility
    ): bool {
        $context = $eligibility->getContext();
        if (!$context->isUmariyya()) {
            return false;
        }

        $spouseKey = null;
        if (isset($groupShares[HeirRole::HUSBAND])) {
            $spouseKey = HeirRole::HUSBAND;
        } elseif (isset($groupShares['wives'])) {
            $spouseKey = 'wives';
        }

        if ($spouseKey === null) {
            return false;
        }

        $spouseShare = $groupShares[$spouseKey];
        if (!$spouseShare instanceof Fraction) {
            return false;
        }

        $remainder = Fraction::fromInt(1)->sub($spouseShare)->reduce();
        $motherShare = $remainder->div(Fraction::fromInts(3))->reduce();

        $beforeMother = $groupShares[HeirRole::MOTHER] ?? Fraction::zero();
        $groupShares[HeirRole::MOTHER] = $motherShare;
        $individualShares[HeirRole::MOTHER] = [$motherShare];

        $this->trace(
            'UMARIYYA',
            array_values(array_filter([$spouseKey, HeirRole::MOTHER])),
            'Mother receives one third of the remainder (Umariyya adjustment)',
            [
                'action' => 'apply',
                'details' => 'Mother receives one third of the remainder (Umariyya adjustment)',
                'spouse_share' => $spouseShare->asString(),
                'mother_before' => $beforeMother->asString(),
                'mother_after' => $motherShare->asString(),
            ]
        );

        return true;
    }

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function applyAwl(array $groupShares, array $individualShares, Fraction $sumFixed): NormalizedShares
    {
        $beforeGroups = $groupShares;
        $sumFixedCanonical = ShareAlgebra::sum($groupShares)->reduce();

        if ($sumFixedCanonical->lte(Fraction::one())) {
            return new NormalizedShares($groupShares, $individualShares, Fraction::zero(), $this->traceEvents);
        }

        $factor = $sumFixedCanonical;

        $beforeStrings = array_map(static fn (Fraction $fraction): string => $fraction->asString(), $beforeGroups);
        ksort($beforeStrings);

        $this->trace(
            'AWL',
            array_keys($groupShares),
            'Before AWL normalization',
            [
                'action' => 'before',
                'details' => 'Before AWL normalization',
                'factor' => $factor->asString(),
                'shares' => $beforeStrings,
            ]
        );

        $scaledGroups = [];
        foreach ($groupShares as $role => $share) {
            $scaledGroups[$role] = $share->div($factor)->reduce();
        }

        $scaledIndividuals = [];
        foreach ($individualShares as $role => $shares) {
            $scaledIndividuals[$role] = [];
            foreach ($shares as $share) {
                $scaledIndividuals[$role][] = $share->div($factor)->reduce();
            }
        }

        ShareAlgebra::assertSumIsOne($scaledGroups);

        $afterStrings = array_map(static fn (Fraction $fraction): string => $fraction->asString(), $scaledGroups);
        ksort($afterStrings);

        $delta = [];
        foreach ($scaledGroups as $role => $share) {
            $before = $beforeGroups[$role] ?? Fraction::zero();
            $delta[$role] = $share->sub($before)->reduce()->asString();
        }
        ksort($delta);

        $this->awlProof = [
            'sum_fixed' => $sumFixedCanonical->asString(),
            'factor' => $factor->asString(),
            'before' => $beforeStrings,
            'after' => $afterStrings,
            'delta' => $delta,
        ];

        $this->trace(
            'AWL',
            array_keys($groupShares),
            'After AWL normalization',
            [
                'action' => 'after',
                'details' => 'After AWL normalization',
                'factor' => $factor->asString(),
                'shares' => $afterStrings,
                'delta' => $delta,
            ]
        );

        return new NormalizedShares($scaledGroups, $scaledIndividuals, Fraction::zero(), $this->traceEvents);
    }

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function applyRadd(array &$groupShares, array &$individualShares, EligibilityResult $eligibility): void
    {
        $one = Fraction::fromInt(1);
        $sum = $this->sumFractions($groupShares);

        if ($sum->compareTo($one) >= 0) {
            return;
        }

        if ($this->hasAsabaPotential($eligibility)) {
            return;
        }

        $residual = $one->sub($sum)->reduce();
        if ($residual->compareTo(Fraction::zero()) === 0) {
            return;
        }

        $beneficiaries = $this->raddBeneficiaries($groupShares);

        $deltaFractions = [];
        foreach ($groupShares as $role => $_) {
            $deltaFractions[$role] = Fraction::zero();
        }

        if ($beneficiaries === []) {
            $delta = $this->formatFractionMap($deltaFractions);
            $this->raddProof = [
                'residual' => $residual->asString(),
                'beneficiaries' => $beneficiaries,
                'delta' => $delta,
            ];

            $this->trace(
                'RADD',
                $beneficiaries,
                'RADD skipped: no eligible beneficiaries',
                [
                    'action' => 'skipped',
                    'details' => 'No eligible beneficiaries for RADD redistribution',
                    'residual' => $residual->asString(),
                    'beneficiaries' => $beneficiaries,
                    'delta' => $delta,
                ]
            );

            return;
        }

        $base = Fraction::zero();
        foreach ($beneficiaries as $role) {
            $base = $base->add($groupShares[$role])->reduce();
        }

        if ($base->compareTo(Fraction::zero()) === 0) {
            $delta = $this->formatFractionMap($deltaFractions);
            $this->raddProof = [
                'residual' => $residual->asString(),
                'beneficiaries' => $beneficiaries,
                'delta' => $delta,
            ];

            $this->trace(
                'RADD',
                $beneficiaries,
                'RADD skipped: base share is zero',
                [
                    'action' => 'skipped',
                    'details' => 'Beneficiaries have zero base share for RADD redistribution',
                    'residual' => $residual->asString(),
                    'beneficiaries' => $beneficiaries,
                    'delta' => $delta,
                ]
            );

            return;
        }

        $beforeGroups = $groupShares;

        $this->trace(
            'RADD',
            $beneficiaries,
            'Before RADD redistribution',
            [
                'action' => 'before',
                'details' => 'Before RADD redistribution',
                'residual' => $residual->asString(),
                'beneficiaries' => $beneficiaries,
                'delta' => $this->formatFractionMap($deltaFractions),
            ]
        );

        $weightSum = Fraction::zero();
        $incrementSum = Fraction::zero();
        foreach ($beneficiaries as $role) {
            $share = $groupShares[$role];
            $weight = $share->div($base)->reduce();
            $increment = $residual->mul($weight)->reduce();

            $weightSum = $weightSum->add($weight)->reduce();
            $incrementSum = $incrementSum->add($increment)->reduce();
            $deltaFractions[$role] = $increment;

            $newShare = $share->add($increment)->reduce();
            $groupShares[$role] = $newShare;

            if (isset($individualShares[$role]) && $share->compareTo(Fraction::zero()) !== 0) {
                $ratio = $newShare->div($share);
                $individualShares[$role] = array_map(
                    static fn (Fraction $individualShare) => $individualShare->mul($ratio)->reduce(),
                    $individualShares[$role]
                );
            }
        }

        if ($weightSum->compareTo(Fraction::fromInt(1)) !== 0) {
            throw new \RuntimeException('RADD distribution weights must sum to 1.');
        }

        if ($incrementSum->compareTo($residual) !== 0) {
            throw new \RuntimeException('RADD increments must consume the full residual.');
        }

        ShareAlgebra::assertSumIsOne($groupShares);

        $delta = $this->formatFractionMap($deltaFractions);

        $this->raddProof = [
            'residual' => $residual->asString(),
            'beneficiaries' => $beneficiaries,
            'delta' => $delta,
        ];

        $this->trace(
            'RADD',
            $beneficiaries,
            'After RADD redistribution',
            [
                'action' => 'after',
                'details' => 'After RADD redistribution',
                'residual' => $residual->asString(),
                'beneficiaries' => $beneficiaries,
                'delta' => $delta,
            ]
        );
    }

    /**
     * @param array<string,Fraction> $shares
     *
     * @return string[]
     */
    private function raddBeneficiaries(array $shares): array
    {
        $excluded = self::SPOUSE_GROUP_KEYS;
        $beneficiaries = [];

        foreach ($shares as $role => $share) {
            if (in_array($role, $excluded, true)) {
                continue;
            }

            if ($share->compareTo(Fraction::zero()) > 0) {
                $beneficiaries[] = $role;
            }
        }
        return $beneficiaries;
    }

    /**
     * @param array<string,Fraction> $fractions
     *
     * @return array<string,string>
     */
    private function formatFractionMap(array $fractions): array
    {
        $formatted = [];
        foreach ($fractions as $role => $fraction) {
            $formatted[$role] = $fraction->asString();
        }

        return $formatted;
    }

    /**
     * @param array<string,Fraction> $before
     * @param array<string,Fraction> $after
     *
     * @return array<string,string>
     */
    private function diffFractions(array $before, array $after): array
    {
        $delta = [];
        $roles = array_unique(array_merge(array_keys($before), array_keys($after)));
        sort($roles);

        foreach ($roles as $role) {
            $previous = $before[$role] ?? Fraction::zero();
            $current = $after[$role] ?? Fraction::zero();
            $difference = $current->sub($previous);

            if ($difference->compareTo(Fraction::zero()) === 0) {
                continue;
            }

            $asString = $difference->asString();
            if ($difference->compareTo(Fraction::zero()) > 0) {
                $asString = '+' . $asString;
            }

            $delta[$role] = $asString;
        }

        return $delta;
    }

    /**
     * @param array<string,Fraction> $fractions
     */
    private function sumFractions(array $fractions): Fraction
    {
        $sum = Fraction::zero();
        foreach ($fractions as $fraction) {
            $sum = $sum->add($fraction);
        }

        return $sum;
    }

    /**
     * @return array<string,mixed>|null
     */
    public function getAwlProof(): ?array
    {
        return $this->awlProof;
    }

    /**
     * @return array<string,mixed>|null
     */
    public function getRaddProof(): ?array
    {
        return $this->raddProof;
    }

    private function hasAsabaPotential(EligibilityResult $eligibility): bool
    {
        $summary = $this->descAggr->summarize($eligibility);
        if ($this->hasMaleDescendant($summary)) {
            return true;
        }

        if ($this->presence($eligibility, HeirRole::FATHER)) {
            return true;
        }

        if (
            $this->presence($eligibility, HeirRole::PATERNAL_GRANDFATHER)
            && !$this->presence($eligibility, HeirRole::FATHER)
        ) {
            return true;
        }


        if (
            $this->presence($eligibility, HeirRole::PATERNAL_UNCLE)
            || $this->presence($eligibility, HeirRole::CONSANGUINE_PATERNAL_UNCLE)
            || $this->presence($eligibility, HeirRole::PATERNAL_UNCLE_SON)
            || $this->presence($eligibility, HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON)
        ) {
            return true;
        }

        return $this->siblingsEligible($eligibility);

        if ($this->siblingsEligible($eligibility)) {
            return true;
        }

        return $this->paternalUnclesEligible($eligibility, $summary);

    }

    /**
     * @param array<int,array{males:int,females:int,roleMale:?string,roleFemale:?string}> $summary
     */
    private function hasMaleDescendant(array $summary): bool
    {
        foreach ($summary as $group) {
            if (($group['males'] ?? 0) > 0) {
                return true;
            }
        }

        return false;
    }

    private function presence(EligibilityResult $eligibility, string $role): bool
    {
        if (in_array($role, $eligibility->getContext()->blockedRoles, true)) {
            return false;
        }

        return $eligibility->hasHeir($role);
    }

    private function siblingsEligible(EligibilityResult $eligibility): bool
    {
        if ($this->presence($eligibility, HeirRole::FATHER)) {
            return false;
        }

        if ($this->presence($eligibility, HeirRole::PATERNAL_GRANDFATHER)) {
            return false;
        }

        return $this->presence($eligibility, HeirRole::FULL_BROTHER)
            || $this->presence($eligibility, HeirRole::FULL_SISTER)
            || $this->presence($eligibility, HeirRole::CONSANGUINE_BROTHER)
            || $this->presence($eligibility, HeirRole::CONSANGUINE_SISTER);
    }

    /**
     * @param array<int,array{males:int,females:int,roleMale:?string,roleFemale:?string}> $summary
     */
    private function paternalUnclesEligible(EligibilityResult $eligibility, array $summary): bool
    {
        if ($this->presence($eligibility, HeirRole::FATHER)) {
            return false;
        }

        if ($this->presence($eligibility, HeirRole::PATERNAL_GRANDFATHER)) {
            return false;
        }

        if ($this->hasMaleDescendant($summary)) {
            return false;
        }

        return $this->presence($eligibility, HeirRole::PATERNAL_UNCLE)
            || $this->presence($eligibility, HeirRole::PATERNAL_UNCLES_DAUGHTER)
            || $this->presence($eligibility, HeirRole::PATERNAL_UNCLE_SON)
            || $this->presence($eligibility, HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER)
            || $this->presence($eligibility, HeirRole::CONSANGUINE_PATERNAL_UNCLE)
            || $this->presence($eligibility, HeirRole::CONSANGUINE_PATERNAL_UNCLES_DAUGHTER)
            || $this->presence($eligibility, HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON)
            || $this->presence($eligibility, HeirRole::CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER);
    }

    /**
     * @param string[] $targets
     * @param array<string,mixed> $data
     */
    private function trace(string $phase, array $targets, string $reason, array $data = []): void
    {
        $this->traceEvents[] = new TraceEvent(
            sprintf('normalizer.%s', strtolower($phase)),
            $targets,
            $reason,
            $phase,
            $data
        );
    }
}
