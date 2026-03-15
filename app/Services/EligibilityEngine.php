<?php

namespace App\Services;

require_once __DIR__ . '/../Domain/Normalization/NormalizationResult.php';
require_once __DIR__ . '/../Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../Domain/Eligibility/EligibilityResult.php';
require_once __DIR__ . '/../Domain/Eligibility/EligibilityContext.php';
require_once __DIR__ . '/../Domain/Tracing/TraceEvent.php';
require_once __DIR__ . '/../Domain/Rules/RuleBookMaliki.php';
require_once __DIR__ . '/../Domain/Rules/Predicates.php';
require_once __DIR__ . '/../Domain/Rules/SpecialCaseActions.php';
require_once __DIR__ . '/../Domain/Math/Fraction.php';
require_once __DIR__ . '/../Domain/Policies/SubstitutionPolicy.php';
require_once __DIR__ . '/../Domain/Policies/NoSubstitutionPolicy.php';
require_once __DIR__ . '/../Domain/Policies/WasiyyaWajibaPolicy.php';
require_once __DIR__ . '/DescendantsAggregator.php';

use App\Domain\Eligibility\EligibilityContext;
use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Math\Fraction;
use App\Domain\Policies\NoSubstitutionPolicy;
use App\Domain\Policies\WasiyyaWajibaPolicy;
use App\Domain\Rules\Predicates;
use App\Domain\Rules\RuleBookMaliki;
use App\Domain\Rules\SpecialCaseActions;
use App\Domain\Tracing\TraceEvent;

final class EligibilityEngine
{
    private DescendantsAggregator $descAggr;

    public function __construct(?DescendantsAggregator $descAggr = null)
    {
        $this->descAggr = $descAggr ?? new DescendantsAggregator();
    }

    public function determineEligibility(\NormalizationResult $norm, RuleBookMaliki $ruleBook): EligibilityResult
    {
        $heirs = $norm->getHeirs();
        $policyName = $ruleBook->flag('substitution_policy') ?? 'none';
        $policy = $policyName === 'wasiyya_wajiba'
            ? new WasiyyaWajibaPolicy()
            : new NoSubstitutionPolicy();
        $heirs = $policy->apply($heirs, Fraction::fromString('1/3'));

        $blockedRoles = [];
        $notes = [];
        $uterinesBlocked = false;
        $appliedFlags = [];
        $contextFlags = [];
        $memo = [];
        $flagValues = $ruleBook->featureFlags();
        $presentRoles = $this->collectAliveRoles($heirs);

        $preBlockFlags = $this->computePreBlockFlags($heirs);
        $motherReduced = $preBlockFlags['motherReduced'];
        $motherThirdCandidate = $preBlockFlags['motherThirdOfRemainderCandidate'];
        $siblingsCountPreBlock = $preBlockFlags['siblingsCountPreBlock'];

        $kalalaFlags = $this->computeKalalaFlags($norm);
        $isKalala = $kalalaFlags['isKalala'];
        $hasAscMale = $kalalaFlags['hasAscMale'];

        foreach ($ruleBook->blocks() as $block) {
            $expression = $block['expression'] ?? null;
            $predicateKey = isset($block['id']) && is_string($block['id'])
                ? 'block:' . $block['id']
                : null;
            if ($expression !== null && !Predicates::eval($expression, $norm, $memo, $flagValues, $predicateKey)) {
                continue;
            }

            $appliedTargets = [];
            foreach ($block['targets'] as $target) {
                if (($presentRoles[$target] ?? 0) <= 0) {
                    continue;
                }

                $blockedRoles[$target] = true;
                $appliedTargets[] = $target;
            }

            if ($appliedTargets === []) {
                continue;
            }

            $notes[] = new TraceEvent(
                $block['id'],
                $appliedTargets,
                $block['reason'] ?? '',
                'BLOCK'
            );

            if (!$uterinesBlocked && $this->isUterineTargeted($appliedTargets)) {
                $uterinesBlocked = true;
            }
        }

        if ($motherReduced) {
            $notes[] = new TraceEvent(
                'rb.mother.reduce_to_sixth',
                [\HeirRole::MOTHER],
                'Mother reduced to 1/6 by descendants or multiple siblings'
            );
        }

        foreach ($ruleBook->specialFlags() as $flag) {
            $expression = $flag['expression'] ?? null;
            $predicateKey = isset($flag['id']) && is_string($flag['id'])
                ? 'special_flag:' . $flag['id']
                : null;
            if ($expression !== null && !Predicates::eval($expression, $norm, $memo, $flagValues, $predicateKey)) {
                continue;
            }

            $flagTargets = [];
            foreach ($flag['targets'] as $target) {
                if (($presentRoles[$target] ?? 0) <= 0) {
                    continue;
                }

                $flagTargets[] = $target;
            }

            if ($flagTargets === []) {
                continue;
            }

            $appliedFlags[] = $flag['id'];

            if (($flag['id'] ?? null) === 'maliki.flag.mother_third_remainder') {
                $contextFlags['isUmariyya'] = true;
            }

            $notes[] = new TraceEvent(
                $flag['id'],
                $flagTargets,
                $flag['reason'] ?? ''
            );
        }

        $this->validateAscendantConsistency($presentRoles, $blockedRoles);

        $eligibleHeirs = [];
        foreach ($heirs as $heir) {
            if (!$heir->isAlive()) {
                continue;
            }

            if (isset($blockedRoles[$heir->getRole()])) {
                continue;
            }

            $eligibleHeirs[] = $heir;
        }

        $blockedRoleList = array_keys($blockedRoles);
        sort($blockedRoleList);
        sort($appliedFlags);

        $eligibilityContext = new EligibilityContext(
            $motherReduced,
            $uterinesBlocked,
            $motherThirdCandidate,
            $blockedRoleList,
            $norm->getContext(),
            $appliedFlags,
            $siblingsCountPreBlock,
            $isKalala,
            $hasAscMale,

            [],
            $norm

        );

        $actionNotes = $this->applySpecialActions(
            $ruleBook,
            $norm,
            $eligibilityContext,
            $memo,
            $flagValues
        );
        foreach ($actionNotes as $actionNote) {
            $notes[] = $actionNote;
        }

        return new EligibilityResult($eligibleHeirs, $notes, $eligibilityContext);
    }

    /**
     * @param array<string,mixed> $memo
     * @param array<string,bool> $flagValues
     * @return TraceEvent[]
     */
    private function applySpecialActions(
        RuleBookMaliki $ruleBook,
        \NormalizationResult $norm,
        EligibilityContext $context,
        array &$memo,
        array $flagValues
    ): array {
        $events = [];

        foreach ($ruleBook->specialActions() as $action) {
            $expression = $action['expression'] ?? null;
            $predicateKey = isset($action['id']) && is_string($action['id'])
                ? 'special_action:' . $action['id']
                : null;
            if ($expression !== null && !Predicates::eval($expression, $norm, $memo, $flagValues, $predicateKey)) {
                continue;
            }

            SpecialCaseActions::execute($action['action'], $context);

            $events[] = new TraceEvent(
                $action['id'],
                [],
                $action['reason'] ?? '',
                'ACTION'
            );
        }

        return $events;
    }

    /**
     * @param array<string,int> $presentRoles
     * @param array<string,bool> $blockedRoles
     */
    private function validateAscendantConsistency(array $presentRoles, array $blockedRoles): void
    {
        if (
            ($presentRoles[\HeirRole::FATHER] ?? 0) > 0
            && ($presentRoles[\HeirRole::PATERNAL_GRANDFATHER] ?? 0) > 0
            && !isset($blockedRoles[\HeirRole::PATERNAL_GRANDFATHER])
        ) {
            throw new \RuntimeException('Incoherent eligibility: paternal grandfather should be blocked when the father is present.');
        }
    }

    /**
     * @param \Heir[] $heirs
     * @return array{motherReduced:bool,motherThirdOfRemainderCandidate:bool,siblingsCountPreBlock:int}
     */
    private function computePreBlockFlags(array $heirs): array
    {
        $siblings = 0;
        $hasDescendants = false;
        $hasSpouse = false;
        $hasFather = false;
        $hasMother = false;

        foreach ($heirs as $heir) {
            if (!$heir->isAlive()) {
                continue;
            }

            $count = $heir->getCount();
            if ($count <= 0) {
                continue;
            }

            $role = $heir->getRole();

            if (in_array($role, [
                \HeirRole::FULL_BROTHER,
                \HeirRole::FULL_SISTER,
                \HeirRole::CONSANGUINE_BROTHER,
                \HeirRole::CONSANGUINE_SISTER,
                \HeirRole::UTERINE_BROTHER,
                \HeirRole::UTERINE_SISTER,
            ], true)) {
                $siblings += $count;
            }

            if (!$hasDescendants) {
                $descendant = $this->descAggr->describe($role);
                if ($descendant !== null) {
                    $hasDescendants = true;
                }
            }

            if (!$hasSpouse && in_array($role, [\HeirRole::HUSBAND, \HeirRole::WIFE], true)) {
                $hasSpouse = true;
            }

            if (!$hasFather && $role === \HeirRole::FATHER) {
                $hasFather = true;
            }

            if (!$hasMother && $role === \HeirRole::MOTHER) {
                $hasMother = true;
            }
        }

        $motherReduced = $hasDescendants || $siblings >= 2;
        $motherThird = $hasSpouse && $hasFather && $hasMother && !$hasDescendants;

        return [
            'motherReduced' => $motherReduced,
            'motherThirdOfRemainderCandidate' => $motherThird,
            'siblingsCountPreBlock' => $siblings,
        ];
    }

    /**
     * @return array{isKalala:bool,hasAscMale:bool}
     */
    private function computeKalalaFlags(\NormalizationResult $norm): array
    {
        $ctx = $norm->getContext();

        $hasAscMale = $ctx->hasFather() || $ctx->hasPaternalGrandfather();
        $hasMaleDescendant = $ctx->hasMaleDescendant();

        return [
            'isKalala' => (!$hasMaleDescendant && !$hasAscMale),
            'hasAscMale' => $hasAscMale,
        ];
    }

    /**
     * @param string[] $targets
     */
    private function isUterineTargeted(array $targets): bool
    {
        return in_array(\HeirRole::UTERINE_BROTHER, $targets, true)
            || in_array(\HeirRole::UTERINE_SISTER, $targets, true);
    }

    /**
     * @param \Heir[] $heirs
     * @return array<string,int>
     */
    private function collectAliveRoles(array $heirs): array
    {
        $roles = [];
        foreach ($heirs as $heir) {
            if (!$heir->isAlive()) {
                continue;
            }

            $count = $heir->getCount();
            if ($count <= 0) {
                continue;
            }

            $role = $heir->getRole();
            $roles[$role] = ($roles[$role] ?? 0) + $count;
        }

        ksort($roles);

        return $roles;
    }
}
