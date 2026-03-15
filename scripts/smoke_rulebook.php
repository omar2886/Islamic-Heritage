#!/usr/bin/env php
<?php
declare(strict_types=1);

$autoload = __DIR__ . '/../vendor/autoload.php';
if (is_file($autoload)) {
    require $autoload;
}

require_once __DIR__ . '/../app/Domain/Rules/RuleBookMaliki.php';

use App\Domain\Rules\RuleBookMaliki;

function fail(string $message, int $code = 1): void
{
    fwrite(STDERR, sprintf("[ERROR] %s\n", $message));
    exit($code);
}

try {
    $rulebook = new RuleBookMaliki();
} catch (Throwable $throwable) {
    fail('Unable to load rulebook: ' . $throwable->getMessage());
}

try {
    $blocks = $rulebook->blocks();
    $fixedShares = $rulebook->fixedShares();
    $specials = $rulebook->specials();
} catch (Throwable $throwable) {
    fail('Failed invoking rulebook accessors: ' . $throwable->getMessage());
}

$blockIds = [];
foreach ($blocks as $index => $block) {
    if (!isset($block['id']) || !is_string($block['id']) || $block['id'] === '') {
        fail(sprintf('Block at index %d is missing a valid id.', $index));
    }
    if (isset($blockIds[$block['id']])) {
        fail(sprintf('Duplicate block id detected: %s', $block['id']));
    }
    $blockIds[$block['id']] = true;

    if (!isset($block['targets']) || !is_array($block['targets']) || $block['targets'] === []) {
        fail(sprintf('Block "%s" must declare at least one target.', $block['id']));
    }
}

$fixedShareGroups = [];
foreach ($fixedShares as $index => $share) {
    if (!isset($share['group']) || !is_string($share['group']) || $share['group'] === '') {
        fail(sprintf('Fixed share at index %d missing group name.', $index));
    }
    $fixedShareGroups[$share['group']] = true;

    if (!isset($share['roles']) || !is_array($share['roles']) || $share['roles'] === []) {
        fail(sprintf('Fixed share "%s" must declare at least one role.', $share['group']));
    }
}

$requiredSpecialSections = ['distribute', 'residual', 'radd', 'awl'];
$specialKeys = array_keys(is_array($specials) ? $specials : []);
$missing = array_diff($requiredSpecialSections, $specialKeys);
if ($missing !== []) {
    fail('Special cases missing sections: ' . implode(', ', $missing));
}

$distributeCount = is_array($specials['distribute'] ?? null) ? count($specials['distribute']) : 0;
$residualCount = is_array($specials['residual'] ?? null) ? count($specials['residual']) : 0;
$raddInfo = $specials['radd'] ?? [];
$awlInfo = $specials['awl'] ?? [];

printf("Rulebook smoke test\n");
printf("  Blocks: %d\n", count($blocks));
printf("  Fixed share rules: %d across %d groups\n", count($fixedShares), count($fixedShareGroups));
printf("  Distribute directives: %d\n", $distributeCount);
printf("  Residual directives: %d\n", $residualCount);
printf("  Radd exclusions: %d\n", isset($raddInfo['exclusions']) && is_array($raddInfo['exclusions']) ? count($raddInfo['exclusions']) : 0);
printf("  Awl method: %s\n", is_array($awlInfo) && isset($awlInfo['method']) ? (string) $awlInfo['method'] : '<undefined>');

echo "Rulebook smoke test completed successfully.\n";
