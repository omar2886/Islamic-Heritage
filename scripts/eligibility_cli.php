#!/usr/bin/env php
<?php
$root = dirname(__DIR__);
$autoload = $root . '/vendor/autoload.php';
if (is_file($autoload)) {
    require $autoload;
}

require_once $root . '/app/Domain/Normalization/Heir.php';
require_once $root . '/app/Domain/Normalization/HeirRole.php';
require_once $root . '/app/Domain/Normalization/NormalizationResult.php';
require_once $root . '/app/Domain/Normalization/ContextFlags.php';
require_once $root . '/app/Domain/Normalization/Sex.php';
require_once $root . '/app/Domain/Normalization/LineageSide.php';
require_once $root . '/app/Services/EligibilityEngine.php';
require_once $root . '/app/Services/DescendantsAggregator.php';
require_once $root . '/app/Domain/Rules/RuleBookMaliki.php';
require_once $root . '/app/Domain/Tracing/TraceEvent.php';

use App\Domain\Normalization\LineageSide;
use App\Domain\Normalization\Sex;
use App\Domain\Rules\RuleBookMaliki;
use App\Services\DescendantsAggregator;
use App\Services\EligibilityEngine;

function descendants_aggregator(): DescendantsAggregator
{
    static $aggregator;

    if (!$aggregator instanceof DescendantsAggregator) {
        $aggregator = new DescendantsAggregator();
    }

    return $aggregator;
}

/**
 * @param array<int,array{males:int,females:int,roleMale:?string,roleFemale:?string}> $summary
 * @return array{0:bool,1:bool}
 */
function descendant_sex_flags(array $summary): array
{
    $hasMale = false;
    $hasFemale = false;

    foreach ($summary as $group) {
        if (($group['males'] ?? 0) > 0) {
            $hasMale = true;
        }
        if (($group['females'] ?? 0) > 0) {
            $hasFemale = true;
        }

        if ($hasMale && $hasFemale) {
            break;
        }
    }

    return [$hasMale, $hasFemale];
}

$payload = stream_get_contents(STDIN);
$decoded = json_decode($payload ?? '', true);
if (!is_array($decoded)) {
    fwrite(STDERR, "Payload must be a JSON object with an 'heirs' array." . PHP_EOL);
    exit(1);
}

$heirSpecs = $decoded['heirs'] ?? null;
if (!is_array($heirSpecs)) {
    fwrite(STDERR, "Input requires an 'heirs' array." . PHP_EOL);
    exit(1);
}

$ctxOverrides = [];
if (isset($decoded['ctx']) && is_array($decoded['ctx'])) {
    $ctxOverrides = $decoded['ctx'];
}

$heirs = [];
foreach ($heirSpecs as $index => $spec) {
    if (!is_array($spec)) {
        fwrite(STDERR, sprintf("Heir at index %d must be an object." . PHP_EOL, $index));
        exit(1);
    }

    if (!array_key_exists('role', $spec)) {
        fwrite(STDERR, sprintf("Heir at index %d missing 'role'." . PHP_EOL, $index));
        exit(1);
    }

    $role = (string) $spec['role'];
    $count = isset($spec['count']) ? (int) $spec['count'] : 1;
    $alive = array_key_exists('alive', $spec) ? (bool) $spec['alive'] : true;

    $defaults = defaults_for_role($role);

    $sex = isset($spec['sex']) ? (string) $spec['sex'] : $defaults['sex'];
    $degree = isset($spec['degree']) ? (int) $spec['degree'] : (int) $defaults['degree'];
    $side = isset($spec['side']) ? (string) $spec['side'] : $defaults['side'];

    $heirs[] = new Heir($role, $sex, $count, $alive, $degree, $side);
}

$context = build_context($heirs, $ctxOverrides);
$normalization = new NormalizationResult($heirs, $context, []);

$engine = new EligibilityEngine();
$ruleBook = new RuleBookMaliki();

$eligibility = $engine->determineEligibility($normalization, $ruleBook);
$context = $eligibility->getContext();

$output = [
    'eligibleHeirs' => array_map(static function (Heir $heir): array {
        return [
            'role' => $heir->getRole(),
            'count' => $heir->getCount(),
            'sex' => $heir->getSex(),
            'alive' => $heir->isAlive(),
            'degree' => $heir->getDegree(),
            'side' => $heir->getSide(),
        ];
    }, $eligibility->getEligibleHeirs()),
    'notes' => array_map(static function (App\Domain\Tracing\TraceEvent $note): array {
        return [
            'ruleId' => $note->ruleId,
            'targets' => $note->targets,
            'reason' => $note->reason,
        ];
    }, $eligibility->getNotes()),
    'context' => [
        'motherReduced' => $context->motherReduced,
        'uterinesBlocked' => $context->uterinesBlocked,
        'motherThirdOfRemainderCandidate' => $context->motherThirdOfRemainderCandidate,
        'blockedRoles' => $context->blockedRoles,
        'appliedSpecialFlags' => $context->getAppliedSpecialFlags(),
    ],
];

echo json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;

function defaults_for_role(string $role): array
{
    $descendant = descendants_aggregator()->describe($role);
    if ($descendant !== null) {
        $sex = $descendant['sex'] ?? Sex::UNKNOWN->value;

        return ['sex' => $sex, 'degree' => $descendant['degree'], 'side' => LineageSide::NONE->value];
    }

    switch ($role) {
        case HeirRole::HUSBAND:
            return ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::NONE->value];
        case HeirRole::WIFE:
            return ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::NONE->value];
        case HeirRole::SON:
            return ['sex' => Sex::MALE->value, 'degree' => 1, 'side' => LineageSide::NONE->value];
        case HeirRole::DAUGHTER:
            return ['sex' => Sex::FEMALE->value, 'degree' => 1, 'side' => LineageSide::NONE->value];
        case HeirRole::SONS_SON:
            return ['sex' => Sex::MALE->value, 'degree' => 2, 'side' => LineageSide::NONE->value];
        case HeirRole::SONS_DAUGHTER:
            return ['sex' => Sex::FEMALE->value, 'degree' => 2, 'side' => LineageSide::NONE->value];
        case HeirRole::FATHER:
            return ['sex' => Sex::MALE->value, 'degree' => -1, 'side' => LineageSide::PATERNAL->value];
        case HeirRole::MOTHER:
            return ['sex' => Sex::FEMALE->value, 'degree' => -1, 'side' => LineageSide::MATERNAL->value];
        case HeirRole::PATERNAL_GRANDFATHER:
            return ['sex' => Sex::MALE->value, 'degree' => -2, 'side' => LineageSide::PATERNAL->value];
        case HeirRole::MATERNAL_GRANDMOTHER:
            return ['sex' => Sex::FEMALE->value, 'degree' => -2, 'side' => LineageSide::MATERNAL->value];
        case HeirRole::FULL_BROTHER:
            return ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value];
        case HeirRole::FULL_SISTER:
            return ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value];
        case HeirRole::CONSANGUINE_BROTHER:
            return ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value];
        case HeirRole::CONSANGUINE_SISTER:
            return ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value];
        case HeirRole::UTERINE_BROTHER:
            return ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::MATERNAL->value];
        case HeirRole::UTERINE_SISTER:
            return ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::MATERNAL->value];
        default:
            return ['sex' => Sex::UNKNOWN->value, 'degree' => 0, 'side' => LineageSide::NONE->value];
    }
}

/**
 * @param Heir[] $heirs
 * @param array<string,mixed> $overrides
 */
function build_context(array $heirs, array $overrides): ContextFlags
{
    $hasDescendants = false;
    $hasMaleDescendant = false;
    $hasFemaleDescendant = false;
    $hasFather = false;
    $hasPaternalGrandfather = false;
    $siblingsCount = 0;
    $uterinesCount = 0;
    $wivesCount = 0;

    foreach ($heirs as $heir) {
        if (!$heir->isAlive() || $heir->getCount() <= 0) {
            continue;
        }

        $role = $heir->getRole();
        $count = $heir->getCount();
        $sex = $heir->getSex();

        $descendant = descendants_aggregator()->describe($role);
        if ($descendant !== null) {
            $hasDescendants = true;
            if ($descendant['is_male']) {
                $hasMaleDescendant = true;
            }
            if ($descendant['is_female']) {
                $hasFemaleDescendant = true;
            }
        }

        if ($role === HeirRole::FATHER) {
            $hasFather = true;
        }

        if ($role === HeirRole::PATERNAL_GRANDFATHER) {
            $hasPaternalGrandfather = true;
        }

        if (in_array($role, [
            HeirRole::FULL_BROTHER,
            HeirRole::FULL_SISTER,
            HeirRole::CONSANGUINE_BROTHER,
            HeirRole::CONSANGUINE_SISTER,
            HeirRole::UTERINE_BROTHER,
            HeirRole::UTERINE_SISTER,
        ], true)) {
            $siblingsCount += $count;
        }

        if (in_array($role, [HeirRole::UTERINE_BROTHER, HeirRole::UTERINE_SISTER], true)) {
            $uterinesCount += $count;
        }

        if ($role === HeirRole::WIFE) {
            $wivesCount += $count;
        }
    }

    if (array_key_exists('hasDescendants', $overrides)) {
        $hasDescendants = (bool) $overrides['hasDescendants'];
    }
    if (array_key_exists('hasMaleDescendant', $overrides)) {
        $hasMaleDescendant = (bool) $overrides['hasMaleDescendant'];
    }
    if (array_key_exists('hasFemaleDescendant', $overrides)) {
        $hasFemaleDescendant = (bool) $overrides['hasFemaleDescendant'];
    }
    if (array_key_exists('hasFather', $overrides)) {
        $hasFather = (bool) $overrides['hasFather'];
    }
    if (array_key_exists('hasPaternalGrandfather', $overrides)) {
        $hasPaternalGrandfather = (bool) $overrides['hasPaternalGrandfather'];
    }
    if (array_key_exists('siblingsCount', $overrides)) {
        $siblingsCount = (int) $overrides['siblingsCount'];
    }
    if (array_key_exists('uterinesCount', $overrides)) {
        $uterinesCount = (int) $overrides['uterinesCount'];
    }
    if (array_key_exists('wivesCount', $overrides)) {
        $wivesCount = (int) $overrides['wivesCount'];
    }

    return new ContextFlags(
        $hasDescendants,
        $hasMaleDescendant,
        $hasFemaleDescendant,
        $hasFather,
        $hasPaternalGrandfather,
        $siblingsCount,
        $uterinesCount,
        $wivesCount
    );
}
