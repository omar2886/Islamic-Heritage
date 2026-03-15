<?php

require_once __DIR__ . '/Fixtures.php';
require_once __DIR__ . '/../app/Services/EligibilityEngine.php';
require_once __DIR__ . '/../app/Services/FixedShareEngine.php';
require_once __DIR__ . '/../app/Services/ShareNormalizer.php';
require_once __DIR__ . '/../app/Services/Asaba/AsabaEngine.php';
require_once __DIR__ . '/../app/Domain/Rules/RuleBookMaliki.php';
require_once __DIR__ . '/../app/Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../app/Domain/Math/Fraction.php';
require_once __DIR__ . '/../app/Domain/Shares/NormalizedShares.php';
require_once __DIR__ . '/../app/Services/EligibilityInvariants.php';

use App\Services\Asaba\AsabaEngine;
use App\Services\EligibilityEngine;
use App\Services\FixedShareEngine;
use App\Services\ShareNormalizer;
use App\Services\EligibilityInvariants;
use App\Domain\Eligibility\EligibilityResult as NamespacedEligibilityResult;
use App\Domain\Math\Fraction;
use App\Domain\Presentation\RoleNamer;
use App\Domain\Rules\RuleBookMaliki;

final class PipelineState
{
    public function __construct(
        public readonly NormalizationResult $normalization,
        public readonly NamespacedEligibilityResult $eligibility,
        public readonly FixedShareResult $fixedShares,
        public readonly NormalizedShares $normalizedShares,
        public readonly AsabaResult $asabaResult,
        /** @var array<string,Fraction> */
        public readonly array $finalGroupShares,
        /** @var array<string,Fraction[]> */
        public readonly array $finalIndividualShares
    ) {
    }
}

final class PipelineRunner
{
    private EligibilityEngine $eligibilityEngine;
    private FixedShareEngine $fixedShareEngine;
    private ShareNormalizer $shareNormalizer;
    private AsabaEngine $asabaEngine;
    private RuleBookMaliki $globalRuleBook;

    public function __construct(
        EligibilityEngine $eligibilityEngine,
        FixedShareEngine $fixedShareEngine,
        ShareNormalizer $shareNormalizer,
        AsabaEngine $asabaEngine,
        RuleBookMaliki $globalRuleBook
    ) {
        $this->eligibilityEngine = $eligibilityEngine;
        $this->fixedShareEngine = $fixedShareEngine;
        $this->shareNormalizer = $shareNormalizer;
        $this->asabaEngine = $asabaEngine;
        $this->globalRuleBook = $globalRuleBook;
    }

    /**
     * @param FixtureCase[] $fixtures
     */
    public function runAll(array $fixtures): void
    {
        $total = count($fixtures);
        $failures = 0;

        foreach ($fixtures as $fixture) {
            try {
                $state = $this->executePipeline($fixture);
                $this->checkExpectations($fixture, $state);
                printf("[OK] %s\n", $fixture->getCaseId());
            } catch (AssertionFailed $failure) {
                $failures++;
                fprintf(STDERR, "[FAIL] %s: %s\n", $fixture->getCaseId(), $failure->getMessage());
            } catch (Throwable $throwable) {
                $failures++;
                fprintf(STDERR, "[ERROR] %s: %s\n", $fixture->getCaseId(), $throwable->getMessage());
            }
        }

        printf("\nCases: %d, Failures: %d\n", $total, $failures);

        if ($failures > 0) {
            throw new RuntimeException('One or more fixtures failed.');
        }
    }

    private function executePipeline(FixtureCase $fixture): PipelineState
    {
        $normalization = $fixture->toNormalizationResult();
        $ruleBook = $this->globalRuleBook;
        $overrides = $fixture->getRulebookOverrides();
        if ($overrides !== []) {
            $ruleBook = $this->globalRuleBook->withFeatureFlagOverrides($overrides);
        }

        $eligibility = $this->eligibilityEngine->determineEligibility($normalization, $ruleBook);

        $fixedShares = $this->fixedShareEngine->computeFixedShares($eligibility, $ruleBook);
        $serviceFixedShares = new \App\Services\FixedShareResult(
            $fixedShares->getGroupShares(),
            $fixedShares->getIndividualShares()
        );
        $normalizedLegacy = $this->shareNormalizer->normalize($serviceFixedShares, $eligibility, false);
        $normalizedShares = \NormalizedShares::create(
            $normalizedLegacy->getNormalizedGroupShares(),
            $normalizedLegacy->getNormalizedIndividualShares(),
            $normalizedLegacy->getSumFixedNormalized()
        );

        $asabaResult = \AsabaResult::empty();
        $residualForAsaba = $normalizedLegacy->getResidualForAsaba();
        if ($residualForAsaba->compareTo(Fraction::zero()) > 0) {
            $asabaResult = $this->asabaEngine->computeResidual($normalizedShares, $eligibility, $ruleBook);

            if (!$asabaResult->hasAsabah()) {
                $normalizedLegacy = $this->shareNormalizer->normalize($serviceFixedShares, $eligibility, true);
                $normalizedShares = \NormalizedShares::create(
                    $normalizedLegacy->getNormalizedGroupShares(),
                    $normalizedLegacy->getNormalizedIndividualShares(),
                    $normalizedLegacy->getSumFixedNormalized()
                );
                $asabaResult = \AsabaResult::empty();
            }
        }

        [$finalGroupShares, $finalIndividualShares] = $this->aggregateFinalShares($normalizedShares, $asabaResult, $eligibility);

        return new PipelineState(
            $normalization,
            $eligibility,
            $fixedShares,
            $normalizedShares,
            $asabaResult,
            $finalGroupShares,
            $finalIndividualShares
        );
    }

    private function checkExpectations(FixtureCase $fixture, PipelineState $state): void
    {
        $this->assertExpectedShares($fixture, $state);

        if ($fixture->shouldCheckInvariant('sum_to_one')) {
            $this->assertSumToOne($state->finalGroupShares, $fixture->getCaseId());
        }
        if ($fixture->shouldCheckInvariant('spouses_excluded_from_radd')) {
            $this->assertSpousesNotRaisedOnRadd($state);
        }
        if ($fixture->shouldCheckInvariant('awl_preserves_ratios')) {
            $this->assertAwlScaling($state);
        }
        if ($fixture->shouldCheckInvariant('no_blocked_receives_share')) {
            $this->assertNoBlockedShare($state, $fixture->getCaseId());
        }
        if ($fixture->shouldCheckInvariant('collective_matches_individuals')) {
            $this->assertCollectiveMatchesIndividuals($state, $fixture->getCaseId());
        }
        if ($fixture->shouldCheckInvariant('deterministic')) {
            $this->assertDeterministic($fixture, $state);
        }

        $this->assertAsabaMixedRatios($state, $fixture->getCaseId());
        $this->assertFullSiblingPriority($state, $fixture->getCaseId());

        if ($fixture->getFractionTests() !== []) {
            $this->assertFractionOperations($fixture);
        }
    }

    private function assertExpectedShares(FixtureCase $fixture, PipelineState $state): void
    {
        foreach ($fixture->getExpectedGroupShares() as $role => $expected) {
            $actual = $this->resolveGroupShare($state->finalGroupShares, $role);
            FractionAssertions::assertFractionEq(
                sprintf('%s.group.%s', $fixture->getCaseId(), $role),
                $expected,
                $actual
            );
        }

        foreach ($fixture->getExpectedIndividualShares() as $role => $expectedList) {
            $actualList = $this->resolveIndividualShares($state->finalIndividualShares, $role);
            FractionAssertions::assertFractionListEq(
                sprintf('%s.individuals.%s', $fixture->getCaseId(), $role),
                $expectedList,
                $actualList
            );
        }
    }

    /**
     * @param array<string,Fraction> $groupShares
     */
    private function assertSumToOne(array $groupShares, string $caseId): void
    {
        $sum = Fraction::zero();
        foreach ($groupShares as $share) {
            $sum = $sum->add($share);
        }

        FractionAssertions::assertFractionEq(
            sprintf('%s.sum_to_one', $caseId),
            Fraction::fromInt(1),
            $sum
        );
    }

    private function assertSpousesNotRaisedOnRadd(PipelineState $state): void
    {
        $fixedSum = $state->fixedShares->getSumFixed();
        $normalizedSum = $state->normalizedShares->getSumFixedNormalized();
        $difference = $normalizedSum->sub($fixedSum);

        if ($difference->compareTo(Fraction::zero()) <= 0) {
            return;
        }

        if (!$state->normalizedShares->getResidualForAsaba()->isZero()) {
            return;
        }

        $fixedGroups = $state->fixedShares->getGroupShares();
        foreach (['husband', 'wives'] as $spouseRole) {
            if (!isset($fixedGroups[$spouseRole])) {
                continue;
            }

            $finalShare = $this->resolveGroupShare($state->finalGroupShares, $spouseRole);
            FractionAssertions::assertFractionEq(
                sprintf('radd.spouse.%s', $spouseRole),
                $fixedGroups[$spouseRole],
                $finalShare
            );
        }
    }

    private function assertAwlScaling(PipelineState $state): void
    {
        $sumFixed = $state->fixedShares->getSumFixed();
        $excess = $sumFixed->sub(Fraction::fromInt(1));
        if ($excess->compareTo(Fraction::zero()) <= 0) {
            return;
        }

        $factor = Fraction::fromInt(1)->div($sumFixed);
        $fixedGroups = $state->fixedShares->getGroupShares();
        $normalizedGroups = $state->normalizedShares->getGroupShares();

        foreach ($fixedGroups as $role => $share) {
            if ($share->isZero()) {
                continue;
            }

            if (!isset($normalizedGroups[$role])) {
                throw new AssertionFailed(sprintf('Awl scaling missing normalized share for role "%s".', $role));
            }

            $normalizedShare = $normalizedGroups[$role];
            $ratio = $normalizedShare->div($share);
            FractionAssertions::assertFractionEq(sprintf('awl.factor.%s', $role), $factor, $ratio);
        }
    }

    private function assertNoBlockedShare(PipelineState $state, string $caseId): void
    {
        $blockedRoles = $state->eligibility->getContext()->blockedRoles;
        foreach ($blockedRoles as $role) {
            $keys = $this->mapBlockedRoleKeys($role);
            foreach ($keys as $key) {
                $groupShare = $state->finalGroupShares[$key] ?? Fraction::zero();
                if (!$groupShare->isZero()) {
                    throw new AssertionFailed(sprintf('%s.blocked.%s has non-zero group share.', $caseId, $role));
                }

                $individuals = $state->finalIndividualShares[$key] ?? [];
                foreach ($individuals as $idx => $share) {
                    if (!$share->isZero()) {
                        throw new AssertionFailed(sprintf('%s.blocked.%s[%d] has non-zero share.', $caseId, $role, $idx));
                    }
                }
            }
        }
    }

    private function assertCollectiveMatchesIndividuals(PipelineState $state, string $caseId): void
    {
        foreach ($state->finalIndividualShares as $role => $individuals) {
            if ($individuals === []) {
                continue;
            }

            $sum = Fraction::zero();
            foreach ($individuals as $share) {
                $sum = $sum->add($share);
            }

            $groupShare = $state->finalGroupShares[$role] ?? Fraction::zero();
            FractionAssertions::assertFractionEq(sprintf('%s.collective.%s', $caseId, $role), $groupShare, $sum);
        }
    }

    private function assertDeterministic(FixtureCase $fixture, PipelineState $state): void
    {
        $secondRun = $this->executePipeline($fixture);
        FractionAssertions::assertFractionMapEq($state->finalGroupShares, $secondRun->finalGroupShares, 'deterministic.groups');

        foreach ($state->finalIndividualShares as $role => $shares) {
            $otherShares = $secondRun->finalIndividualShares[$role] ?? [];
            FractionAssertions::assertFractionListEq(sprintf('deterministic.%s', $role), $shares, $otherShares);
        }
    }

    private function assertAsabaMixedRatios(PipelineState $state, string $caseId): void
    {
        $pairs = [
            ['male' => 'son', 'female' => 'daughter'],
            ['male' => 'sons_son', 'female' => 'sons_daughter'],
            ['male' => 'full_brother', 'female' => 'full_sister'],
            ['male' => 'consanguine_brother', 'female' => 'consanguine_sister'],
        ];

        foreach ($pairs as $pair) {
            $maleShares = $state->finalIndividualShares[$pair['male']] ?? [];
            $femaleShares = $state->finalIndividualShares[$pair['female']] ?? [];

            $maleShares = array_values(array_filter($maleShares, static function (Fraction $share): bool {
                return !$share->isZero();
            }));
            $femaleShares = array_values(array_filter($femaleShares, static function (Fraction $share): bool {
                return !$share->isZero();
            }));

            if ($maleShares === [] || $femaleShares === []) {
                continue;
            }

            $maleTotal = array_reduce(
                $maleShares,
                static fn (Fraction $carry, Fraction $share): Fraction => $carry->add($share),
                Fraction::zero()
            );

            $femaleTotal = array_reduce(
                $femaleShares,
                static fn (Fraction $carry, Fraction $share): Fraction => $carry->add($share),
                Fraction::zero()
            );

            FractionAssertions::assertFractionEq(
                sprintf('%s.asaba_ratio.%s/%s', $caseId, $pair['male'], $pair['female']),
                $femaleTotal->mul(Fraction::fromInt(2)),
                $maleTotal
            );
        }
    }

    private function assertFullSiblingPriority(PipelineState $state, string $caseId): void
    {
        $pairs = [
            ['full' => 'full_brother', 'consanguine' => 'consanguine_brother'],
            ['full' => 'full_sister', 'consanguine' => 'consanguine_sister'],
        ];

        foreach ($pairs as $pair) {
            if (!isset($state->finalGroupShares[$pair['full']])) {
                continue;
            }

            $fullShare = $state->finalGroupShares[$pair['full']];
            if ($fullShare->isZero()) {
                continue;
            }

            $consanguineShare = $state->finalGroupShares[$pair['consanguine']] ?? Fraction::zero();
            FractionAssertions::assertFractionEq(
                sprintf('%s.full_priority.%s', $caseId, $pair['consanguine']),
                Fraction::zero(),
                $consanguineShare
            );

            $individuals = $state->finalIndividualShares[$pair['consanguine']] ?? [];
            foreach ($individuals as $index => $share) {
                FractionAssertions::assertFractionEq(
                    sprintf('%s.full_priority.%s[%d]', $caseId, $pair['consanguine'], $index),
                    Fraction::zero(),
                    $share
                );
            }
        }
    }

    private function assertFractionOperations(FixtureCase $fixture): void
    {
        foreach ($fixture->getFractionTests() as $index => $spec) {
            $label = sprintf('%s.fraction_tests[%d]', $fixture->getCaseId(), $index);
            $operation = strtolower($spec['op'] ?? '');
            $operandA = Fraction::fromString($spec['a']);

            switch ($operation) {
                case 'add':
                case 'sub':
                case 'mul':
                case 'div':
                    if (!isset($spec['b'], $spec['result'])) {
                        throw new AssertionFailed(sprintf('%s: operation "%s" requires "b" and "result".', $label, $operation));
                    }

                    $operandB = Fraction::fromString($spec['b']);
                    $expected = Fraction::fromString($spec['result']);
                    switch ($operation) {
                        case 'add':
                            $actual = $operandA->add($operandB);
                            break;
                        case 'sub':
                            $actual = $operandA->sub($operandB);
                            break;
                        case 'mul':
                            $actual = $operandA->mul($operandB);
                            break;
                        case 'div':
                            $actual = $operandA->div($operandB);
                            break;
                        default:
                            $actual = Fraction::zero();
                            break;
                    }

                    FractionAssertions::assertFractionEq($label, $expected, $actual);
                    break;

                case 'reduce':
                    if (!isset($spec['result'])) {
                        throw new AssertionFailed(sprintf('%s: reduce operation requires "result".', $label));
                    }

                    $expected = Fraction::fromString($spec['result']);
                    $actual = $operandA->reduce();
                    FractionAssertions::assertFractionEq($label, $expected, $actual);
                    break;

                case 'asstring':
                    if (!isset($spec['result'])) {
                        throw new AssertionFailed(sprintf('%s: asString operation requires "result".', $label));
                    }

                    $actual = $operandA->asString();
                    if ($actual !== $spec['result']) {
                        throw new AssertionFailed(sprintf('%s: expected "%s", got "%s".', $label, $spec['result'], $actual));
                    }
                    break;

                default:
                    throw new AssertionFailed(sprintf('%s: unsupported operation "%s".', $label, $operation));
            }
        }
    }

    /**
     * @return array{array<string,Fraction>,array<string,Fraction[]>}
     */
    private function aggregateFinalShares(NormalizedShares $normalizedShares, AsabaResult $asabaResult, NamespacedEligibilityResult $eligibility): array
    {
        $normalizedGroups = $normalizedShares->getGroupShares();
        $normalizedIndividuals = $normalizedShares->getIndividualShares();
        $asabaGroups = $asabaResult->getGroupShares();
        $asabaIndividuals = $asabaResult->getIndividualShares();

        $finalGroups = [];
        $finalIndividuals = [];

        $countsByRole = $this->collectEligibleCounts($eligibility);

        $roles = array_unique(array_merge(
            array_keys($normalizedGroups),
            array_keys($normalizedIndividuals),
            array_keys($asabaGroups),
            array_keys($asabaIndividuals)
        ));

        foreach ($roles as $role) {
            $count = $countsByRole[$role] ?? 0;
            if ($count <= 0) {
                $count = count($normalizedIndividuals[$role] ?? []);
            }
            if ($count <= 0) {
                $count = count($asabaIndividuals[$role] ?? []);
            }

            $shareSource = $normalizedGroups[$role] ?? ($asabaGroups[$role] ?? null);
            if ($count <= 0 && $shareSource instanceof Fraction && !$shareSource->isZero()) {
                $count = 1;
            }

            $key = RoleNamer::groupKey($role, $count);

            if (isset($normalizedGroups[$role])) {
                $existing = $finalGroups[$key] ?? Fraction::zero();
                $finalGroups[$key] = $existing->add($normalizedGroups[$role]);
            }
            if (isset($asabaGroups[$role])) {
                $existing = $finalGroups[$key] ?? Fraction::zero();
                $finalGroups[$key] = $existing->add($asabaGroups[$role]);
            }

            if (isset($normalizedIndividuals[$role])) {
                $finalIndividuals[$key] = $this->mergeIndividualShares($finalIndividuals[$key] ?? [], $normalizedIndividuals[$role]);
            }
            if (isset($asabaIndividuals[$role])) {
                $finalIndividuals[$key] = $this->mergeIndividualShares($finalIndividuals[$key] ?? [], $asabaIndividuals[$role]);
            }
        }

        $canonicalCounts = [];
        foreach ($countsByRole as $role => $count) {
            $key = RoleNamer::groupKey($role, $count);
            $canonicalCounts[$key] = ($canonicalCounts[$key] ?? 0) + $count;
        }

        foreach ($finalIndividuals as $key => $fractions) {
            $filtered = array_values(array_filter(
                $fractions,
                static fn (Fraction $fraction): bool => !$fraction->isZero()
            ));

            $groupShare = $finalGroups[$key] ?? Fraction::zero();
            if ($filtered === [] && $groupShare->isZero()) {
                unset($finalIndividuals[$key]);
                continue;
            }

            $finalIndividuals[$key] = $filtered;
        }

        foreach ($finalGroups as $key => $share) {
            if (!isset($canonicalCounts[$key]) && $share instanceof Fraction) {
                $canonicalCounts[$key] = count($finalIndividuals[$key] ?? []);
            }
        }

        foreach ($canonicalCounts as $key => $count) {
            if ($count <= 0) {
                continue;
            }

            $groupShare = $finalGroups[$key] ?? Fraction::zero();
            $individuals = $finalIndividuals[$key] ?? [];

            $sum = Fraction::zero();
            foreach ($individuals as $fraction) {
                $sum = $sum->add($fraction);
            }

            if ($sum->equals($groupShare) && count($individuals) === $count) {
                continue;
            }

            if ($groupShare->isZero()) {
                $finalIndividuals[$key] = [];
                continue;
            }

            $perShare = $groupShare->div(Fraction::fromInt($count));
            $finalIndividuals[$key] = array_fill(0, $count, $perShare);
        }

        foreach ($finalIndividuals as $key => $fractions) {
            $filtered = array_values(array_filter(
                $fractions,
                static fn (Fraction $fraction): bool => !$fraction->isZero()
            ));

            $groupShare = $finalGroups[$key] ?? Fraction::zero();
            if ($filtered === [] && $groupShare->isZero()) {
                unset($finalIndividuals[$key]);
                continue;
            }

            $finalIndividuals[$key] = $filtered;
        }

        $emitBayt = getenv('EMIT_BAYT_AL_MAL') === '1';
        if ($emitBayt) {
            $invariants = EligibilityInvariants::compute($eligibility);
            $spouseExcluded = ($invariants['spouses_radd_exclusion'] ?? false) === true;
            if ($spouseExcluded) {
                $sumFinal = Fraction::zero();
                foreach ($finalGroups as $share) {
                    $sumFinal = $sumFinal->add($share);
                }
                if ($sumFinal->compareTo(Fraction::one()) < 0) {
                    $residual = Fraction::one()->sub($sumFinal);
                    if ($residual->compareTo(Fraction::zero()) > 0) {
                        $finalGroups['bayt_al_mal'] = $residual;
                        $finalIndividuals['bayt_al_mal'] = [$residual];
                    }
                }
            }
        }

        ksort($finalGroups);
        ksort($finalIndividuals);

        return [$finalGroups, $finalIndividuals];
    }

    /**
     * @return array<string,int>
     */
    private function collectEligibleCounts(NamespacedEligibilityResult $eligibility): array
    {
        $counts = [];
        foreach ($eligibility->getEligibleHeirs() as $heir) {
            $role = $heir->getRole();
            $counts[$role] = ($counts[$role] ?? 0) + $heir->getCount();
        }

        return $counts;
    }

    /**
     * @param Fraction[] $current
     * @param Fraction[] $additional
     * @return Fraction[]
     */
    private function mergeIndividualShares(array $current, array $additional): array
    {
        $result = [];
        $max = max(count($current), count($additional));
        for ($idx = 0; $idx < $max; $idx++) {
            $base = $current[$idx] ?? Fraction::zero();
            $extra = $additional[$idx] ?? Fraction::zero();
            $result[$idx] = $base->add($extra);
        }

        return $result;
    }

    /**
     * @param array<string,Fraction> $shares
     */
    private function resolveGroupShare(array $shares, string $role): Fraction
    {
        if (isset($shares[$role])) {
            return $shares[$role];
        }

        foreach ($this->aliasKeys($role) as $alias) {
            if (isset($shares[$alias])) {
                return $shares[$alias];
            }
        }

        return Fraction::zero();
    }

    /**
     * @param array<string,Fraction[]> $shares
     *
     * @return Fraction[]
     */
    private function resolveIndividualShares(array $shares, string $role): array
    {
        if (isset($shares[$role])) {
            return $shares[$role];
        }

        foreach ($this->aliasKeys($role) as $alias) {
            if (isset($shares[$alias])) {
                return $shares[$alias];
            }
        }

        return [];
    }

    /**
     * @return string[]
     */
    private function aliasKeys(string $role): array
    {
        return match ($role) {
            'daughter' => ['daughters'],
            'daughters' => ['daughter'],
            'wife' => ['wives'],
            'wives' => ['wife'],
            'uterine_siblings' => ['uterine_brother', 'uterine_sister'],
            'uterine_brother' => ['uterine_siblings'],
            'uterine_sister' => ['uterine_siblings'],
            default => [],
        };
    }


    /**
     * @return string[]
     */
    private function mapBlockedRoleKeys(string $role): array
    {
        switch ($role) {
            case HeirRole::WIFE:
                return ['wives'];
            case HeirRole::DAUGHTER:
                return ['daughters', 'daughter'];
            case HeirRole::UTERINE_BROTHER:
            case HeirRole::UTERINE_SISTER:
                return ['uterine_siblings'];
            default:
                return [$role];
        }
    }
}

