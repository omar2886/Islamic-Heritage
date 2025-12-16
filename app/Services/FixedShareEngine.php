<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Eligibility\EligibilityContext;
use App\Domain\Eligibility\EligibilityResult as DomainEligibilityResult;
use App\Domain\Math\Fraction;
use App\Domain\Normalization\HeirRole;
use App\Domain\Rules\RuleBookMaliki;
use App\Domain\Tracing\TraceEvent;

require_once __DIR__ . '/../Domain/Eligibility/EligibilityContext.php';
require_once __DIR__ . '/../Domain/Eligibility/EligibilityResult.php';
require_once __DIR__ . '/../Domain/Rules/RuleBookMaliki.php';
require_once __DIR__ . '/../Domain/Shares/FixedShareResult.php';
require_once __DIR__ . '/ShareUtils.php';
require_once __DIR__ . '/DescendantsAggregator.php';
require_once __DIR__ . '/GrandmothersResolver.php';
require_once __DIR__ . '/../Domain/Tracing/TraceEvent.php';

final class FixedShareResult
{
    /** @var array<string,Fraction> */
    private array $groupShares;

    /** @var array<string,Fraction[]> */
    private array $individualShares;

    private Fraction $sumFixed;

    /**
     * @var TraceEvent[]
     */
    private array $traceEvents;

    /**
     * @param TraceEvent[] $traceEvents
     */
    public function __construct(array $groupShares, array $individualShares, array $traceEvents = [])
    {
        $this->groupShares = $this->normalizeGroupShares($groupShares);
        $this->individualShares = $this->normalizeIndividualShares($individualShares);
        $this->sumFixed = $this->sumFractions($this->groupShares);
        $this->traceEvents = $this->normalizeTraceEvents($traceEvents);
    }

    /**
     * @return array<string,Fraction>
     */
    public function getGroupShares(): array
    {
        return $this->groupShares;
    }

    /**
     * @return array<string,string>
     */
    public function groupSharesAsStringMap(): array
    {
        $formatted = [];
        foreach ($this->groupShares as $role => $share) {
            $formatted[$role] = $share->asString();
        }

        ksort($formatted);

        return $formatted;
    }

    /**
     * @return array<string,Fraction[]>
     */
    public function getIndividualShares(): array
    {
        return $this->individualShares;
    }

    public function getSumFixed(): Fraction
    {
        return $this->sumFixed;
    }

    /**
     * @return TraceEvent[]
     */
    public function getTraceEvents(): array
    {
        return $this->traceEvents;
    }

    /**
     * @param array<string,Fraction> $shares
     *
     * @return array<string,Fraction>
     */
    private function normalizeGroupShares(array $shares): array
    {
        $normalized = [];
        foreach ($shares as $role => $share) {
            if (!$share instanceof Fraction) {
                throw new \InvalidArgumentException('Group share entries must be Fraction instances.');
            }

            $normalized[$role] = $share;
        }

        ksort($normalized);

        return $normalized;
    }

    /**
     * @param array<string,Fraction[]> $shares
     *
     * @return array<string,Fraction[]>
     */
    private function normalizeIndividualShares(array $shares): array
    {
        $normalized = [];
        foreach ($shares as $role => $fractions) {
            $normalized[$role] = [];
            foreach ($fractions as $fraction) {
                if (!$fraction instanceof Fraction) {
                    throw new \InvalidArgumentException('Individual share entries must be Fraction instances.');
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

final class FixedShareEngine
{
    private DescendantsAggregator $descAggr;

    private GrandmothersResolver $grandmothersResolver;

    /**
     * @var TraceEvent[]
     */
    private array $traceEvents = [];

    public function __construct(
        ?DescendantsAggregator $descAggr = null,
        ?GrandmothersResolver $grandmothersResolver = null
    )
    {
        $this->descAggr = $descAggr ?? new DescendantsAggregator();
        $this->grandmothersResolver = $grandmothersResolver ?? new GrandmothersResolver();
    }

    /**
     * @param array<string,int> $heirCounts
     */
    public function compute(array $heirCounts, ?EligibilityContext $context = null): FixedShareResult
    {
        $this->traceEvents = [];

        $groupShares = [];
        $individualShares = [];

        $initialState = $groupShares;
        $this->tracePhase('FIXED', 'before', $initialState, $initialState);

        $descendantSummary = $this->descAggr->summarizeCounts($heirCounts);
        [$hasMaleDescendants, $hasFemaleDescendants] = $this->descendantPresenceFromSummary($descendantSummary);
        $hasDescendants = $context?->hasDescendants() ?? ($descendantSummary !== []);

        $spouseShare = Fraction::zero();

        if (($heirCounts['husband'] ?? 0) > 0) {
            $share = $hasDescendants ? Fraction::fromString('1/4') : Fraction::fromString('1/2');
            $groupShares['husband'] = $share;
            $individualShares['husband'] = [$share];
            $spouseShare = $share;
        }

        if (($heirCounts['wife'] ?? 0) > 0) {
            $wivesCount = $heirCounts['wife'];
            $share = $hasDescendants ? Fraction::fromString('1/8') : Fraction::fromString('1/4');
            $groupShares['wives'] = $share;
            $individualShares['wives'] = $this->createEqualShares($share, $wivesCount);
            $spouseShare = $share;
        }

        if (($heirCounts['mother'] ?? 0) > 0) {
            $motherSpecialApplied = $this->applyMotherThirdOfRemainder(
                $heirCounts,
                $hasDescendants,
                $spouseShare,
                $context,
                $groupShares,
                $individualShares
            );

            if (!$motherSpecialApplied) {
                $motherShare = $this->computeMotherShare($heirCounts, $hasDescendants, $context);
                $groupShares['mother'] = $motherShare;
                $individualShares['mother'] = [$motherShare];
            }
        }

        if (($heirCounts['father'] ?? 0) > 0) {
            $fatherShare = null;
            if ($hasDescendants) {
                $fatherShare = Fraction::fromString('1/6');
            }

            if ($fatherShare instanceof Fraction) {
                $groupShares['father'] = $fatherShare;
                $individualShares['father'] = [$fatherShare];
            }
        }

        if (($heirCounts['paternal_grandfather'] ?? 0) > 0 && ($heirCounts['father'] ?? 0) === 0) {
            $grandfatherShare = null;
            if ($hasDescendants) {
                $grandfatherShare = Fraction::fromString('1/6');
            }

            if ($grandfatherShare instanceof Fraction) {
                $groupShares['paternal_grandfather'] = $grandfatherShare;
                $individualShares['paternal_grandfather'] = $this->createEqualShares($grandfatherShare, $heirCounts['paternal_grandfather']);
            }
        }

        $daughterCount = $heirCounts['daughter'] ?? 0;
        $sonCount = $heirCounts['son'] ?? 0;
        if ($daughterCount > 0 && $sonCount === 0) {
            $share = $daughterCount === 1
                ? Fraction::fromString('1/2')
                : Fraction::fromString('2/3');
            $groupShares['daughter'] = $share;
            $individualShares['daughter'] = $this->createEqualShares($share, $daughterCount);
        }

        $this->applyDescendantComplementFromCounts($heirCounts, $descendantSummary, $groupShares, $individualShares);

        $fullSisterCount = $heirCounts['full_sister'] ?? 0;
        $consanguineSisterCount = $heirCounts['consanguine_sister'] ?? 0;
        $hasMaleAscendants = ($heirCounts['father'] ?? 0) > 0 || ($heirCounts['paternal_grandfather'] ?? 0) > 0;

        if (!$hasMaleDescendants && !$hasFemaleDescendants && !$hasMaleAscendants) {
            if ($fullSisterCount > 0) {
                $share = Fraction::fromString($fullSisterCount === 1 ? '1/2' : '2/3');
                $groupShares['full_sister'] = $share;
                $individualShares['full_sister'] = $this->createEqualShares($share, $fullSisterCount);
            } elseif ($consanguineSisterCount > 0) {
                $share = Fraction::fromString($consanguineSisterCount === 1 ? '1/2' : '2/3');
                $groupShares['consanguine_sister'] = $share;
                $individualShares['consanguine_sister'] = $this->createEqualShares($share, $consanguineSisterCount);
            }
        }

        $uterineTotal = ($heirCounts['uterine_brother'] ?? 0) + ($heirCounts['uterine_sister'] ?? 0);
        $uterinesBlocked = $context?->uterinesBlocked ?? $this->uterinesBlocked($heirCounts, $hasDescendants);
        if ($uterineTotal > 0 && !$uterinesBlocked) {
            $share = $uterineTotal === 1 ? Fraction::fromString('1/6') : Fraction::fromString('1/3');
            $groupShares['uterine_siblings'] = $share;
            $individualShares['uterine_siblings'] = $this->createEqualShares($share, $uterineTotal);
        }

        $this->applyUmariyya($groupShares, $individualShares, $context);

        $this->tracePhase('FIXED', 'after', $initialState, $groupShares);

        return new FixedShareResult($groupShares, $individualShares, $this->traceEvents);
    }

    private function trace(string $ruleId, array $targets, string $reason, array $data = [], ?string $phase = 'FIXED'): void
    {
        $this->traceEvents[] = new TraceEvent($ruleId, $targets, $reason, $phase, $data);
    }

    /**
     * @param string                 $phase
     * @param string                 $moment
     * @param array<string,Fraction> $before
     * @param array<string,Fraction> $after
     */
    private function tracePhase(string $phase, string $moment, array $before, array $after): void
    {
        $delta = $this->diffFractions($before, $after);
        ksort($delta);

        $targets = $delta === [] ? array_keys($after) : array_keys($delta);

        $phaseKey = strtoupper($phase);
        $momentKey = strtolower($moment);
        $ruleId = sprintf('phase.%s.%s', strtolower($phaseKey), $momentKey);
        $details = $this->localizePhaseDetails($phaseKey, $momentKey);

        $this->traceEvents[] = new TraceEvent(
            $ruleId,
            $targets,
            $details,
            $phase,
            [
                'action' => $momentKey,
                'details' => $details,
                'delta' => $delta,
            ]
        );
    }

    private function localizePhaseDetails(string $phase, string $moment): string
    {
        $phaseName = $this->spanishPhaseName($phase);

        return match ($moment) {
            'before' => sprintf('Antes de la fase de %s.', $phaseName),
            'after' => sprintf('Después de la fase de %s.', $phaseName),
            default => sprintf('Momento "%s" de la fase de %s.', $moment, $phaseName),
        };
    }

    private function spanishPhaseName(string $phase): string
    {
        return match ($phase) {
            'FIXED' => 'cuotas fijas (Furūḍ)',
            'SPECIAL' => 'casos especiales',
            'AWL' => 'normalización (ʿawl)',
            'RADD' => 'redistribución (radd)',
            'ASABA' => 'residuarios (ʿaṣabah)',
            'BLOCK' => 'exclusiones (ḥajb)',
            default => strtolower($phase),
        };
    }

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function applyUmariyya(
        array &$groupShares,
        array &$individualShares,
        ?EligibilityContext $context
    ): void {
        if (!($context?->isUmariyya() ?? false)) {
            return;
        }

        $spouseRole = null;
        if (isset($groupShares[HeirRole::HUSBAND])) {
            $spouseRole = HeirRole::HUSBAND;
        } elseif (isset($groupShares['wives'])) {
            $spouseRole = 'wives';
        }

        if ($spouseRole === null) {
            return;
        }

        $spouse = $groupShares[$spouseRole] ?? null;
        if (!$spouse instanceof Fraction) {
            return;
        }

        $remainder = Fraction::fromInt(1)->sub($spouse)->reduce();
        $motherShare = $remainder->div(Fraction::fromInts(3))->reduce();

        $groupShares[HeirRole::MOTHER] = $motherShare;
        $individualShares[HeirRole::MOTHER] = [$motherShare];

        $targets = array_values(array_filter([$spouseRole, HeirRole::MOTHER], 'is_string'));

        $this->trace(
            'UMARIYYA',
            $targets,
            'Mother takes 1/3 of remainder',
            [
                'remainder' => $remainder->asString(),
                'mother' => $motherShare->asString(),
                'spouse' => $spouse->asString(),
            ]
        );
    }

    /**
     * @param array<string,Fraction> $before
     * @param array<string,Fraction> $after
     *
     * @return array<string,string>
     */
    private function diffFractions(array $before, array $after): array
    {
        $roles = array_unique(array_merge(array_keys($before), array_keys($after)));
        sort($roles);

        $delta = [];
        foreach ($roles as $role) {
            $previous = $before[$role] ?? Fraction::zero();
            $current = $after[$role] ?? Fraction::zero();
            $difference = $current->sub($previous);

            if ($difference->compareTo(Fraction::zero()) === 0) {
                continue;
            }

            $formatted = $difference->asString();
            if ($difference->compareTo(Fraction::zero()) > 0) {
                $formatted = '+' . $formatted;
            }

            $delta[$role] = $formatted;
        }

        return $delta;
    }

    public function computeFixedShares(DomainEligibilityResult $eligibility, RuleBookMaliki $ruleBook): \FixedShareResult
    {
        $heirCounts = $this->collectCountsFromEligibility($eligibility);
        $legacyResult = $this->compute($heirCounts, $eligibility->getContext());

        $groupShares = $legacyResult->getGroupShares();
        $individualShares = $legacyResult->getIndividualShares();

        $this->grandmothersResolver->resolve($groupShares, $ruleBook, $eligibility);
        $this->computePaternalGrandfather($eligibility, $groupShares);
        $this->computeDescendantComplement($eligibility, $groupShares, $individualShares, $ruleBook);

        $this->computeSistersFixed($eligibility, $groupShares, $individualShares);
        $this->computeUterines($eligibility, $groupShares, $individualShares);
        $this->applyMotherReduction($eligibility, $groupShares, $individualShares, $ruleBook);

        if (isset($groupShares[HeirRole::MATERNAL_GRANDMOTHER])) {
            $count = $eligibility->getHeirCount(HeirRole::MATERNAL_GRANDMOTHER);
            if ($count > 0 && !isset($individualShares[HeirRole::MATERNAL_GRANDMOTHER])) {
                $perHeir = $groupShares[HeirRole::MATERNAL_GRANDMOTHER]
                    ->div(Fraction::fromInt($count));
                $individualShares[HeirRole::MATERNAL_GRANDMOTHER] = array_fill(0, $count, $perHeir);
            }
        }

        if (isset($groupShares[HeirRole::PATERNAL_GRANDMOTHER]) && !isset($individualShares[HeirRole::PATERNAL_GRANDMOTHER])) {
            $count = $eligibility->getHeirCount(HeirRole::PATERNAL_GRANDMOTHER);
            if ($count > 0) {
                $perHeir = $groupShares[HeirRole::PATERNAL_GRANDMOTHER]
                    ->div(Fraction::fromInt($count));
                $individualShares[HeirRole::PATERNAL_GRANDMOTHER] = array_fill(0, $count, $perHeir);
            }
        }

        if (
            isset($groupShares[HeirRole::PATERNAL_GRANDFATHER])
            && !isset($individualShares[HeirRole::PATERNAL_GRANDFATHER])
        ) {
            $count = $eligibility->getHeirCount(HeirRole::PATERNAL_GRANDFATHER);
            if ($count > 0) {
                $perHeir = $groupShares[HeirRole::PATERNAL_GRANDFATHER]
                    ->div(Fraction::fromInt($count));
                $individualShares[HeirRole::PATERNAL_GRANDFATHER] = array_fill(0, $count, $perHeir);
            }
        }

        $sumFixed = Fraction::zero();
        foreach ($groupShares as $share) {
            $sumFixed = $sumFixed->add($share);
        }

        return \FixedShareResult::fromParts(
            $groupShares,
            $individualShares,
            $sumFixed,
            $eligibility->getContext()->motherThirdOfRemainderCandidate
        );
    }

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function computeUterines(
        DomainEligibilityResult $e,
        array &$groupShares,
        array &$individualShares
    ): void {
        $context = $e->getContext();

        if ($context->hasDescendants() || $context->hasAscMale()) {
            return;
        }

        $brothers = $this->count($e, HeirRole::UTERINE_BROTHER);
        $sisters = $this->count($e, HeirRole::UTERINE_SISTER);
        $total = $brothers + $sisters;

        if ($total === 0) {
            return;
        }

        $groupShare = Fraction::fromString($total === 1 ? '1/6' : '1/3');
        $groupShares['uterine_siblings'] = $groupShare;
        $individualShares['uterine_siblings'] = ShareUtils::splitGroupEqually($groupShare, $total);
        $this->trace(
            'UTERINES_KALALA',
            ['uterine_siblings'],
            'Uterine heirs share in kalala',
            ['count' => $total]
        );
    }

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function applyMotherReduction(
        DomainEligibilityResult $e,
        array &$groupShares,
        array &$individualShares,
        RuleBookMaliki $ruleBook
    ): void {
        $motherKey = HeirRole::MOTHER;
        if (!isset($groupShares[$motherKey])) {
            return;
        }

        $rules = $ruleBook->motherReduction();
        if ($rules === []) {
            return;
        }

        $context = $e->getContext();
        if (!$context->evaluateOr(false, $rules)) {
            return;
        }

        $share = Fraction::fromString('1/6');
        if ($groupShares[$motherKey]->compareTo($share) === 0) {
            return;
        }

        $groupShares[$motherKey] = $share;
        $individualShares[$motherKey] = [$share];
        $this->trace(
            'MOTHER_REDUCTION',
            [$motherKey],
            'Mother reduced to 1/6 due to siblings.',
            []
        );
    }

    /**
     * @param array<string,Fraction> $groupShares
     */
    private function computePaternalGrandfather(DomainEligibilityResult $e, array &$groupShares): void
    {
        if (!$this->presence($e, HeirRole::PATERNAL_GRANDFATHER)) {
            return;
        }

        if ($this->presence($e, HeirRole::FATHER)) {
            return;
        }

        $context = $e->getContext();
        $contextHasDescendants = method_exists($context, 'hasDescendants')
            ? $context->hasDescendants()
            : null;

        $hasDescendants = $contextHasDescendants ?? $this->hasDescendantLike($e);

        if ($hasDescendants) {
            $groupShares[HeirRole::PATERNAL_GRANDFATHER] = Fraction::fromString('1/6');
        }
    }

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function computeDescendantComplement(
        DomainEligibilityResult $e,
        array &$groupShares,
        array &$individualShares,
        RuleBookMaliki $ruleBook
    ): void {
        $this->applyGranddaughtersTwoThirds($e, $ruleBook, $groupShares, $individualShares);
    }

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function applyGranddaughtersTwoThirds(
        DomainEligibilityResult $e,
        RuleBookMaliki $ruleBook,
        array &$groupShares,
        array &$individualShares
    ): void {
        $ruleEnabled = (bool) ($ruleBook->flag('daughter_granddaughter_two_thirds') ?? true);
        if (!$ruleEnabled) {
            return;
        }

        if ($this->count($e, HeirRole::DAUGHTER) !== 1) {
            return;
        }

        if ($this->presence($e, HeirRole::SON) || $this->presence($e, HeirRole::SONS_SON)) {
            return;
        }

        $summary = $this->descAggr->summarize($e);
        if ($summary === []) {
            return;
        }

        foreach ($summary as $degree => $group) {
            if ($degree < 2) {
                continue;
            }

            $males = (int) ($group['males'] ?? 0);
            if ($males > 0) {
                break;
            }

            $females = (int) ($group['females'] ?? 0);
            $roleFemale = $group['roleFemale'] ?? null;
            if ($females <= 0 || $roleFemale === null) {
                continue;
            }

            $share = Fraction::fromString('1/6');
            $groupShares[$roleFemale] = $share;
            $individualShares[$roleFemale] = $this->createEqualShares($share, $females);

            $this->trace(
                'COMPLEMENT_2_THIRDS',
                [$roleFemale],
                'Granddaughters complete two-thirds with single daughter',
                [
                    'degree' => $degree,
                    'grant' => '1/6',
                ]
            );

            break;
        }
    }

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function computeSistersFixed(
        DomainEligibilityResult $e,
        array &$groupShares,
        array &$individualShares
    ): void {
        $context = $e->getContext();

        if (!$context->isKalala() || $context->hasFemaleDescendant()) {
            return;
        }

        $fullSisterCount = $this->count($e, HeirRole::FULL_SISTER);
        if ($fullSisterCount > 0) {
            $share = Fraction::fromString($fullSisterCount === 1 ? '1/2' : '2/3');
            $groupShares[HeirRole::FULL_SISTER] = $share;
            $individualShares[HeirRole::FULL_SISTER] = ShareUtils::splitGroupEqually($share, $fullSisterCount);

            return;
        }

        $consanguineSisterCount = $this->count($e, HeirRole::CONSANGUINE_SISTER);
        if ($consanguineSisterCount <= 0) {
            return;
        }

        $share = Fraction::fromString($consanguineSisterCount === 1 ? '1/2' : '2/3');
        $groupShares[HeirRole::CONSANGUINE_SISTER] = $share;
        $individualShares[HeirRole::CONSANGUINE_SISTER] = ShareUtils::splitGroupEqually($share, $consanguineSisterCount);
    }

    /**
     * @return array<string,int>
     */
    private function collectCountsFromEligibility(DomainEligibilityResult $eligibility): array
    {
        return $eligibility->counts();
    }

    private function presence(DomainEligibilityResult $eligibility, string $role): bool
    {
        if (in_array($role, $eligibility->getContext()->blockedRoles, true)) {
            return false;
        }

        return $eligibility->hasHeir($role);
    }

    private function count(DomainEligibilityResult $eligibility, string $role): int
    {
        if (in_array($role, $eligibility->getContext()->blockedRoles, true)) {
            return 0;
        }

        return $eligibility->getHeirCount($role);
    }

    /**
     * @param array<int,array{males:int,females:int,roleMale:?string,roleFemale:?string}> $summary
     * @return array{0:bool,1:bool}
     */
    private function descendantPresenceFromSummary(array $summary): array
    {
        $hasMale = false;
        $hasFemale = false;

        foreach ($summary as $group) {
            if (($group['males'] ?? 0) > 0) {
                $hasMale = true;
            }
            if (($group['females'] ?? 0) > 0) {
                $hasFemale = true;
            }

            if ($hasMale && $hasFemale) {
                break;
            }
        }

        return [$hasMale, $hasFemale];
    }

    /**
     * @param array<int,array{males:int,females:int,roleMale:?string,roleFemale:?string}> $summary
     * @return array{role:string,count:int}|null
     */
    private function findNearestFemaleOnlyDescendants(array $summary): ?array
    {
        foreach ($summary as $degree => $group) {
            if ($degree < 2) {
                continue;
            }

            $males = $group['males'] ?? 0;
            if ($males > 0) {
                break;
            }

            $females = $group['females'] ?? 0;
            if ($females <= 0) {
                continue;
            }

            $role = $group['roleFemale'];
            if ($role === null) {
                continue;
            }

            return ['role' => $role, 'count' => $females];
        }

        return null;
    }

    /**
     * @param array<string,int> $heirCounts
     * @param array<int,array{males:int,females:int,roleMale:?string,roleFemale:?string}> $summary
     * @param array<string,Fraction> $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function applyDescendantComplementFromCounts(
        array $heirCounts,
        array $summary,
        array &$groupShares,
        array &$individualShares
    ): void {
        if (($heirCounts['son'] ?? 0) > 0) {
            return;
        }

        if (($heirCounts['daughter'] ?? 0) !== 1) {
            return;
        }

        $candidate = $this->findNearestFemaleOnlyDescendants($summary);
        if ($candidate === null || $candidate['count'] <= 0) {
            return;
        }

        $share = Fraction::fromString('1/6');
        $role = $candidate['role'];
        $groupShares[$role] = $share;
        $individualShares[$role] = $this->createEqualShares($share, $candidate['count']);
    }

    private function hasDescendantLike(DomainEligibilityResult $eligibility): bool
    {
        $summary = $this->descAggr->summarize($eligibility);

        foreach ($summary as $group) {
            if (($group['males'] ?? 0) > 0 || ($group['females'] ?? 0) > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string,int> $heirCounts
     */
    private function computeMotherShare(
        array $heirCounts,
        bool $hasDescendants,
        ?EligibilityContext $context
    ): Fraction {
        if ($context instanceof EligibilityContext) {
            $motherReduced = $context->motherReduced;
        } else {
            $motherReduced = $hasDescendants || $this->hasTwoOrMoreSiblings($heirCounts);
        }

        return $motherReduced
            ? Fraction::fromString('1/6')
            : Fraction::fromString('1/3');
    }

    /**
     * @param array<string,int> $heirCounts
     * @param array<string,Fraction> $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function applyMotherThirdOfRemainder(
        array $heirCounts,
        bool $hasDescendants,
        Fraction $spouseShare,
        ?EligibilityContext $context,
        array &$groupShares,
        array &$individualShares
    ): bool {
        $motherCount = $heirCounts['mother'] ?? 0;
        if ($motherCount <= 0) {
            return false;
        }

        $thirdOfRemainder = $context?->motherThirdOfRemainderCandidate
            ?? $this->isMotherThirdOfRemainderCase($heirCounts, $hasDescendants, $spouseShare);

        if (!$thirdOfRemainder) {
            return false;
        }

        $remainder = Fraction::fromInt(1)->sub($spouseShare);
        $motherShare = $remainder->mul(Fraction::fromString('1/3'))->reduce();

        $groupShares['mother'] = $motherShare;
        $individualShares['mother'] = [$motherShare];

        return true;
    }


    /**
     * @param array<string,int> $heirCounts
     */
    private function isMotherThirdOfRemainderCase(array $heirCounts, bool $hasDescendants, Fraction $spouseShare): bool
    {
        if ($hasDescendants) {
            return false;
        }

        $hasHusband = ($heirCounts['husband'] ?? 0) > 0;

        if (!$hasHusband) {
            return false;
        }

        if (($heirCounts['father'] ?? 0) === 0) {
            return false;
        }

        return $spouseShare->compareTo(Fraction::zero()) > 0;
    }

    /**
     * @param array<string,int> $heirCounts
     */
    private function hasTwoOrMoreSiblings(array $heirCounts): bool
    {
        $siblings = 0;
        foreach (['full_brother', 'full_sister', 'consanguine_brother', 'consanguine_sister', 'uterine_brother', 'uterine_sister'] as $role) {
            $siblings += $heirCounts[$role] ?? 0;
        }

        return $siblings >= 2;
    }

    /**
     * @param array<string,int> $heirCounts
     */
    private function uterinesBlocked(array $heirCounts, bool $hasDescendants): bool
    {
        if ($hasDescendants) {
            return true;
        }

        return ($heirCounts['father'] ?? 0) > 0 || ($heirCounts['paternal_grandfather'] ?? 0) > 0;
    }

    /**
     * @return Fraction[]
     */
    private function createEqualShares(Fraction $totalShare, int $count): array
    {
        return ShareUtils::splitGroupEqually($totalShare, $count);
    }
}
