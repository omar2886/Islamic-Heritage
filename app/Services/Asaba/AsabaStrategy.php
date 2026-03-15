<?php

declare(strict_types=1);

namespace App\Services\Asaba;

use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Math\Fraction;

require_once __DIR__ . '/../../Domain/Eligibility/EligibilityResult.php';
require_once __DIR__ . '/../../Domain/Math/Fraction.php';
require_once __DIR__ . '/AsabaOutcome.php';

interface AsabaStrategy
{
    public function tryDistribute(Fraction $residual, EligibilityResult $eligibility): ?AsabaOutcome;
}
