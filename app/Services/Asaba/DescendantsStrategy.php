<?php

declare(strict_types=1);

namespace App\Services\Asaba;

use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Normalization\HeirRole;
use App\Domain\Math\Fraction;
use App\Services\DescendantsAggregator;
use App\Services\ShareUtils;

require_once __DIR__ . '/../../Domain/Eligibility/EligibilityResult.php';
require_once __DIR__ . '/../../Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../../Domain/Math/Fraction.php';
require_once __DIR__ . '/../DescendantsAggregator.php';
require_once __DIR__ . '/../ShareUtils.php';
require_once __DIR__ . '/AsabaOutcome.php';
require_once __DIR__ . '/AsabaStrategy.php';

final class DescendantsStrategy implements AsabaStrategy
{
    private DescendantsAggregator $aggregator;

    public function __construct(?DescendantsAggregator $aggregator = null)
    {
        $this->aggregator = $aggregator ?? new DescendantsAggregator();
    }

    public function tryDistribute(Fraction $residual, EligibilityResult $eligibility): ?AsabaOutcome
    {
        $summary = $this->aggregator->summarize($eligibility);
        foreach ($summary as $degree => $group) {
            $males = (int) ($group['males'] ?? 0);
            if ($males <= 0) {
                continue;
            }

            $females = (int) ($group['females'] ?? 0);
            $maleRole = $group['roleMale'] ?? HeirRole::SON;
            $femaleRole = $group['roleFemale'] ?? ($degree === 1 ? HeirRole::DAUGHTER : $maleRole);

            [$maleShares, $femaleShares] = ShareUtils::splitGroupTwoToOne($residual, $males, $females);
            if ($maleShares === [] && $femaleShares === []) {
                continue;
            }

            [$ruleId, $reason] = $this->metadataForDegree((int) $degree);

            return AsabaOutcome::fromTwoGroups(
                $maleRole,
                $maleShares,
                $femaleRole,
                $femaleShares,
                $ruleId,
                $reason
            );
        }

        return null;
    }

    /**
     * @return array{0:string,1:string}
     */
    private function metadataForDegree(int $degree): array
    {
        return match ($degree) {
            1 => [
                'asaba.precedence.children',
                "Son present; children absorb residual as 'asabah with 2:1 weighting.",
            ],
            2 => [
                'asaba.precedence.grandchildren',
                'Grandsons and granddaughters through sons absorb residual with 2:1 weighting once sons are absent.',
            ],
            default => [
                'asaba_descendants_k',
                sprintf('Descendants at degree %d absorb residual with 2:1 weighting.', $degree),
            ],
        };
    }
}
