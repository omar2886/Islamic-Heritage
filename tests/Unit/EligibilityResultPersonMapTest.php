<?php
declare(strict_types=1);

require_once __DIR__ . '/MiniTestCase.php';

use App\Domain\Eligibility\EligibilityContext;
use App\Domain\Eligibility\EligibilityResult as DomainEligibilityResult;
use App\Domain\Normalization\LineageSide;
use App\Domain\Normalization\Sex;
final class EligibilityResultPersonMapTest extends MiniTestCase
{
    public function testRoleToPersonIdsIncludesAliases(): void
    {
        $heirs = [
            new Heir('mother', Sex::FEMALE->value, 1, true, 0, LineageSide::MATERNAL->value),
            new Heir('wife', Sex::FEMALE->value, 2, true, 0, LineageSide::NONE->value),
            new Heir('uterine_brother', Sex::MALE->value, 1, true, 0, LineageSide::MATERNAL->value),
            new Heir('uterine_sister', Sex::FEMALE->value, 1, true, 0, LineageSide::MATERNAL->value),
        ];

        $contextFlags = new ContextFlags(false, false, false, false, false, 0, 0, 0);
        $normalization = new NormalizationResult(
            $heirs,
            $contextFlags,
            [
                'mother' => [10],
                'wife' => [20, 21],
                'uterine_brother' => [30],
                'uterine_sister' => [40],
            ]
        );

        $eligibilityContext = new EligibilityContext(
            false,
            false,
            false,
            [],
            $contextFlags,
            [],
            0,
            false,
            false,
            [],
            $normalization
        );

        $eligibility = new DomainEligibilityResult($heirs, [], $eligibilityContext);

        $this->assertSame(
            [
                'mother' => [10],
                'uterine_brother' => [30],
                'uterine_siblings' => [30, 40],
                'uterine_sister' => [40],
                'wife' => [20, 21],
                'wives' => [20, 21],
            ],
            $eligibility->roleToPersonIds()
        );
    }
}
