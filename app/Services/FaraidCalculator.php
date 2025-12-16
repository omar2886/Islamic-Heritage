<?php

declare(strict_types=1);

use App\Services\FixedShareEngine;
use App\Services\FixedShareResult;

require_once __DIR__ . '/FixedShareEngine.php';

/**
 * Adapter facade kept for legacy callers.
 * Delegates all computations to the new FixedShareEngine pipeline.
 */
final class FaraidCalculator
{
    private FixedShareEngine $fixedShareEngine;

    public function __construct(?FixedShareEngine $fixedShareEngine = null)
    {
        $this->fixedShareEngine = $fixedShareEngine ?? new FixedShareEngine();
    }

    /**
     * @param array<string,int> $heirCounts
     */
    public function compute(array $heirCounts, ?\App\Domain\Eligibility\EligibilityContext $context = null): FixedShareResult
    {
        return $this->fixedShareEngine->compute($heirCounts, $context);
    }
}
