<?php

require_once __DIR__ . '/../app/Domain/Rules/Predicates.php';
require_once __DIR__ . '/../app/Domain/Normalization/NormalizationResult.php';
require_once __DIR__ . '/../app/Domain/Normalization/ContextFlags.php';
require_once __DIR__ . '/../app/Domain/Normalization/Heir.php';
require_once __DIR__ . '/../app/Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../app/Domain/Normalization/Sex.php';
require_once __DIR__ . '/../app/Domain/Normalization/LineageSide.php';

use App\Domain\Normalization\LineageSide;
use App\Domain\Normalization\Sex;
use App\Domain\Rules\Predicates;

$fixturePath = __DIR__ . '/fixtures/predicate_cases.json';
$data = json_decode(file_get_contents($fixturePath), true);
if (!is_array($data)) {
    fwrite(STDERR, "Failed to decode predicate fixtures.\n");
    exit(1);
}

$total = count($data);
$failures = 0;

foreach ($data as $case) {
    $id = $case['id'] ?? '<unknown>';
    $expression = $case['expression'] ?? '';
    $heirSpecs = $case['heirs'] ?? [];
    $contextSpec = $case['context'] ?? [];
    $expectedException = $case['expect_exception'] ?? null;

    try {
        $normalization = buildNormalizationResult($heirSpecs, $contextSpec);
        $memo = [];
        $flagsSpec = $case['flags'] ?? null;
        $normalizedFlags = [];
        if (is_array($flagsSpec)) {
            foreach ($flagsSpec as $name => $value) {
                if (!is_string($name)) {
                    continue;
                }

                $normalizedFlags[trim($name)] = $value;
            }
        }

        $predicateKey = isset($case['predicate_key']) && is_string($case['predicate_key'])
            ? $case['predicate_key']
            : null;

        $result = Predicates::eval($expression, $normalization, $memo, $normalizedFlags, $predicateKey);

        if ($expectedException !== null) {
            $failures++;
            printf("[FAIL] %s expected exception %s but none thrown\n", $id, $expectedException);
            continue;
        }

        $expectedValue = (bool) ($case['expected'] ?? false);
        if ($result !== $expectedValue) {
            $failures++;
            printf("[FAIL] %s expected %s got %s\n", $id, formatBool($expectedValue), formatBool($result));
            continue;
        }

        $memoKey = $predicateKey ?? $expression;
        $memoEntries = $memo[$memoKey] ?? null;
        $memoHit = false;
        if (is_array($memoEntries)) {
            foreach ($memoEntries as $cached) {
                if ($cached === $result) {
                    $memoHit = true;
                    break;
                }
            }
        }

        if (!$memoHit) {
            $failures++;
            printf("[FAIL] %s memoization missing for expression\n", $id);
            continue;
        }

        printf("[OK] %s\n", $id);
    } catch (Throwable $throwable) {
        if ($expectedException === null) {
            $failures++;
            printf("[ERROR] %s unexpected exception: %s\n", $id, $throwable->getMessage());
            continue;
        }

        if (!$throwable instanceof $expectedException) {
            $failures++;
            printf("[FAIL] %s expected %s got %s\n", $id, $expectedException, get_class($throwable));
            continue;
        }

        printf("[OK] %s (caught %s)\n", $id, $expectedException);
    }
}

printf("\nCases: %d, Failures: %d\n", $total, $failures);

exit($failures > 0 ? 1 : 0);

/**
 * @param array<int,array<string,mixed>> $heirSpecs
 * @param array<string,mixed> $contextSpec
 */
function buildNormalizationResult(array $heirSpecs, array $contextSpec): NormalizationResult
{
    $heirs = [];
    foreach ($heirSpecs as $spec) {
        $role = (string) ($spec['role'] ?? '');
        $count = (int) ($spec['count'] ?? 0);
        $sex = (string) ($spec['sex'] ?? Sex::UNKNOWN->value);
        $alive = isset($spec['alive']) ? (bool) $spec['alive'] : true;
        $degree = (int) ($spec['degree'] ?? 0);
        $side = (string) ($spec['side'] ?? LineageSide::NONE->value);

        $heirs[] = new Heir($role, $sex, $count, $alive, $degree, $side);
    }

    $context = buildContextFlags($contextSpec);

    return new NormalizationResult($heirs, $context, []);
}

/**
 * @param array<string,mixed> $contextSpec
 */
function buildContextFlags(array $contextSpec): ContextFlags
{
    $defaults = [
        'has_descendants' => false,
        'has_male_descendant' => false,
        'has_female_descendant' => false,
        'has_father' => false,
        'has_paternal_grandfather' => false,
        'siblings_count' => 0,
        'uterines_count' => 0,
        'wives_count' => 0,
    ];

    $values = array_merge($defaults, $contextSpec);

    return new ContextFlags(
        (bool) $values['has_descendants'],
        (bool) $values['has_male_descendant'],
        (bool) $values['has_female_descendant'],
        (bool) $values['has_father'],
        (bool) $values['has_paternal_grandfather'],
        (int) $values['siblings_count'],
        (int) $values['uterines_count'],
        (int) $values['wives_count']
    );
}

function formatBool(bool $value): string
{
    return $value ? 'true' : 'false';
}
