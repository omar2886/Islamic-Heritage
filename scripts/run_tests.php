#!/usr/bin/env php
<?php

require_once __DIR__ . '/../tests/Runner.php';

use App\Domain\Rules\RuleBookMaliki;
use App\Services\Asaba\AsabaEngine;
use App\Services\EligibilityEngine;
use App\Services\FixedShareEngine;
use App\Services\ShareNormalizer;

$fixtures = FixtureLoader::loadAllFixtures(__DIR__ . '/../tests/fixtures');

$runner = new PipelineRunner(
    new EligibilityEngine(),
    new FixedShareEngine(),
    new ShareNormalizer(),
    new AsabaEngine(),
    new RuleBookMaliki()
);

try {
    $runner->runAll($fixtures);
    exit(0);
} catch (Throwable $throwable) {
    fwrite(STDERR, $throwable->getMessage() . PHP_EOL);
    exit(1);
}
