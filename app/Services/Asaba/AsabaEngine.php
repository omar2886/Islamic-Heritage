<?php

declare(strict_types=1);

namespace App\Services\Asaba;

use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Math\Fraction;
use App\Domain\Rules\RuleBookMaliki;
use App\Domain\Tracing\TraceEvent;
use App\Services\DescendantsAggregator;

require_once __DIR__ . '/../../Domain/Eligibility/EligibilityResult.php';
require_once __DIR__ . '/../../Domain/Math/Fraction.php';
require_once __DIR__ . '/../../Domain/Rules/RuleBookMaliki.php';
require_once __DIR__ . '/../../Domain/Shares/AsabaResult.php';
require_once __DIR__ . '/../../Domain/Shares/NormalizedShares.php';
require_once __DIR__ . '/../../Domain/Tracing/TraceEvent.php';
require_once __DIR__ . '/../DescendantsAggregator.php';
require_once __DIR__ . '/../ShareUtils.php';
require_once __DIR__ . '/AsabaOutcome.php';
require_once __DIR__ . '/AsabaStrategy.php';
require_once __DIR__ . '/AscendantsStrategy.php';
require_once __DIR__ . '/ConsanguineSiblingsStrategy.php';
require_once __DIR__ . '/DescendantsStrategy.php';
require_once __DIR__ . '/FullSiblingsStrategy.php';
require_once __DIR__ . '/PaternalUnclesStrategy.php';
require_once __DIR__ . '/SistersWithDaughtersStrategy.php';

final class AsabaEngine
{
    /**
     * @var AsabaStrategy[]
     */
    private array $chain;

    /**
     * @var array<string,mixed>|null
     */
    private ?array $asabaProof = null;

    public function __construct(?array $chain = null)
    {
        $this->chain = $chain ?? $this->buildDefaultChain();
    }

    public function computeResidual(\NormalizedShares $normalized, EligibilityResult $eligibility, RuleBookMaliki $ruleBook): \AsabaResult
    {
        $this->asabaProof = null;

        $residual = $normalized->getResidualForAsaba();
        if ($residual->equals(Fraction::zero())) {
            return \AsabaResult::empty();
        }

        $strategies = $this->prepareChain($ruleBook);
        foreach ($strategies as $strategy) {
            $outcome = $strategy->tryDistribute($residual, $eligibility);
            if ($outcome === null || $outcome->isNone()) {
                continue;
            }

            return $this->materialiseOutcome($residual, $outcome);
        }

        $this->asabaProof = null;

        return \AsabaResult::empty();
    }

    /**
     * @return array<string,mixed>|null
     */
    public function getLastProof(): ?array
    {
        return $this->asabaProof;
    }

    /**
     * @return AsabaStrategy[]
     */
    private function buildDefaultChain(): array
    {
        $aggregator = new DescendantsAggregator();

        return [
            new DescendantsStrategy($aggregator),
            new AscendantsStrategy(),
            new FullSiblingsStrategy(),
            new ConsanguineSiblingsStrategy(),
            new SistersWithDaughtersStrategy(),
            new PaternalUnclesStrategy(),
        ];
    }

    /**
     * @return AsabaStrategy[]
     */
    private function prepareChain(RuleBookMaliki $ruleBook): array
    {
        $prepared = [];
        $featureEnabled = $ruleBook->isFeatureEnabled('consanguine_asaba_with_daughter', true);

        foreach ($this->chain as $strategy) {
            if ($strategy instanceof ConsanguineSiblingsStrategy) {
                $strategy = $strategy->withConsanguineWithDaughterFeature($featureEnabled);
            }

            $prepared[] = $strategy;
        }

        return $prepared;
    }

    private function materialiseOutcome(Fraction $residual, AsabaOutcome $outcome): \AsabaResult
    {
        $groupShares = $outcome->groupShares();
        $individualShares = $outcome->individualShares();
        $consumed = $outcome->residualConsumed();

        $this->recordAsaba($outcome->method(), $residual, $groupShares);

        $note = $this->createAsabaTrace(
            $outcome->ruleId(),
            $outcome->targets(),
            $outcome->reason(),
            $groupShares,
            $consumed
        );

        $hasAsabah = $consumed->compareTo(Fraction::zero()) > 0 && $groupShares !== [];

        return new \AsabaResult($consumed, $groupShares, $individualShares, [$note], $hasAsabah);
    }

    /**
     * @param array<string,Fraction> $alloc
     */
    private function recordAsaba(string $method, Fraction $residual, array $alloc): void
    {
        $this->asabaProof = [
            'method' => $method,
            'residual' => $residual->asString(),
            'alloc' => $this->stringify($alloc),
        ];
    }

    /**
     * @param array<string,Fraction> $alloc
     *
     * @return array<string,string>
     */
    private function stringify(array $alloc): array
    {
        $formatted = [];
        foreach ($alloc as $role => $share) {
            if (!$share instanceof Fraction) {
                continue;
            }

            $formatted[$role] = $share->asString();
        }

        ksort($formatted);

        return $formatted;
    }

    /**
     * @param array<string,Fraction> $groupShares
     * @param string[]               $targets
     */
    private function createAsabaTrace(
        string $ruleId,
        array $targets,
        string $reason,
        array $groupShares,
        Fraction $residual
    ): TraceEvent {
        $delta = [];
        foreach ($groupShares as $role => $share) {
            if (!$share instanceof Fraction) {
                continue;
            }

            if ($share->compareTo(Fraction::zero()) === 0) {
                continue;
            }

            $value = $share->asString();
            if ($share->compareTo(Fraction::zero()) > 0) {
                $value = '+' . $value;
            }

            $delta[$role] = $value;
        }

        ksort($delta);

        return new TraceEvent(
            $ruleId,
            $targets,
            $reason,
            'ASABA',
            [
                'action' => 'after',
                'details' => $reason,
                'residual' => $residual->asString(),
                'delta' => $delta,
            ]
        );
    }
}
