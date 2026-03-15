<?php
declare(strict_types=1);

namespace App\Scripts;

use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Math\Fraction;
use App\Domain\Normalization\HeirRole;
use App\Domain\Normalization\LineageSide;
use App\Domain\Normalization\RoleOrder;
use App\Domain\Normalization\RoleAliases;
use App\Domain\Normalization\Sex;
use App\Domain\Presentation\RoleNamer;
use App\Domain\Policies\WasiyyaWajibaPolicy;
use App\Domain\Rules\RuleBookMaliki;
use App\Domain\Tracing\TraceEvent;
use App\Domain\Rules\YamlValidator;
use App\Services\DescendantsAggregator;
use App\Services\Asaba\AsabaEngine;
use App\Services\EligibilityEngine;
use App\Services\EligibilityInvariants;
use App\Services\EligibilityValidator;
use App\Services\FixedShareEngine;
use App\Services\FixedShareResult;
use App\Services\ShareNormalizer;
use App\Services\NormalizedShares;
use App\Services\MoneyAllocator;
use InvalidArgumentException;

final class CalcRunner
{
    private const ENGINE_VERSION = '0.4.0';
    private static int $lastExitCode = 0;

    public static function run(array $input): array
    {
        self::$lastExitCode = 0;

        $payload = $input;

        $cliFlags = [];
        if (isset($payload['cli_flags'])) {
            if (!is_array($payload['cli_flags'])) {
                throw new InvalidArgumentException("Payload 'cli_flags' must be an array of strings");
            }

            foreach ($payload['cli_flags'] as $flag) {
                if (!is_scalar($flag)) {
                    throw new InvalidArgumentException("Payload 'cli_flags' must contain only scalar values");
                }

                $cliFlags[] = (string) $flag;
            }

            unset($payload['cli_flags']);
        }

        $explain = in_array('--explain', $cliFlags, true);
        $audit = in_array('--audit', $cliFlags, true);
        $strict = in_array('--strict', $cliFlags, true);

        validatePayload($payload);

        if (!$explain && isset($payload['explain'])) {
            $explain = (bool) $payload['explain'];
            unset($payload['explain']);
        }

        $estateValue = null;
        if (array_key_exists('estate_value', $payload)) {
            $rawEstateValue = trim((string) $payload['estate_value']);
            if ($rawEstateValue !== '') {
                $estateValue = $rawEstateValue;
            }
        }

        $currency = 'USD';
        if (array_key_exists('currency', $payload)) {
            $rawCurrency = trim((string) $payload['currency']);
            if ($rawCurrency !== '') {
                $currency = $rawCurrency;
            }
        }

        $rolePersonMap = collectRolePersonIds($payload['heirs']);
        $rolePersonDetails = collectRolePersonDetails($payload['heirs']);

        [$normalizedHeirs, $initialWarnings, $initialErrors] = normalizeHeirs($payload['heirs']);
        $canonicalWarnings = [];
        $canonicalHeirs = canonicalizeWives($normalizedHeirs, $canonicalWarnings, $rolePersonMap);
        if ($rolePersonDetails !== []) {
            $rolePersonDetails = normalizeRolePersonDetailsAliases($rolePersonDetails);
        }
        $payload['heirs'] = $canonicalHeirs;

        [$normalizedHeirs, $extraWarnings, $extraErrors] = normalizeHeirs($payload['heirs'] ?? []);

        $warnings = array_merge($initialWarnings, $extraWarnings, $canonicalWarnings);
        $errors = array_merge($initialErrors, $extraErrors);

        if ($warnings !== []) {
            $warnings = array_values(array_unique(array_filter(
                $warnings,
                static fn (string $warning): bool => !str_contains($warning, "canonical 'wife' group")
            )));
        }

        if ($errors !== []) {
            $errors = array_values(array_map(
                static function (string $error): string {
                    if (str_starts_with($error, "count for role 'wife' must be a non-negative integer")) {
                        return str_replace("role 'wife'", "role 'wives'", $error);
                    }

                    return $error;
                },
                $errors
            ));
        }

        $payload['heirs'] = array_map(
            static fn (array $heir): array => ['role' => $heir['role'], 'count' => $heir['count']],
            $payload['heirs']
        );
        $outputPayload = $payload;
        $payload['heirs'] = EligibilityValidator::normalizeInput($payload['heirs']);

        $heirCounts = collectHeirCounts($payload['heirs']);
        $warnings = array_merge($warnings, collectHeirCountWarnings($heirCounts));
        $warnings = array_merge($warnings, collectLogicalWarnings($heirCounts));

        $fixedEngine = new FixedShareEngine();
        $normalizer = new ShareNormalizer();
        $eligibilityEngine = new EligibilityEngine();
        $asabaEngine = new AsabaEngine();

        $rulebookPath = null;
        if (array_key_exists('rulebook_path', $payload)) {
            $rawRulebookPath = $payload['rulebook_path'];
            if (!is_string($rawRulebookPath)) {
                throw new InvalidArgumentException("Payload 'rulebook_path' must be a string");
            }

            $trimmedRulebookPath = trim($rawRulebookPath);
            if ($trimmedRulebookPath !== '') {
                $rulebookPath = $trimmedRulebookPath;
            }

            unset($payload['rulebook_path']);
        } else {
            $envRulebookPath = getenv('HERITAGE_RULEBOOK_PATH');
            if ($envRulebookPath !== false) {
                $envRulebookPath = trim($envRulebookPath);
                if ($envRulebookPath !== '') {
                    $rulebookPath = $envRulebookPath;
                }
            }
        }

        $ruleBook = new RuleBookMaliki($rulebookPath);
        if (isset($payload['rulebook_flags'])) {
            if (!is_array($payload['rulebook_flags'])) {
                throw new InvalidArgumentException("Payload 'rulebook_flags' must be an object");
            }

            $overrides = [];
            foreach ($payload['rulebook_flags'] as $flag => $value) {
                if (!is_string($flag) || trim($flag) === '') {
                    throw new InvalidArgumentException("Rulebook flag keys must be non-empty strings");
                }

                if (!is_scalar($value) && $value !== null) {
                    throw new InvalidArgumentException(sprintf("Rulebook flag '%s' must be a scalar or null value", $flag));
                }

                $overrides[$flag] = $value;
            }

            if ($overrides !== []) {
                $ruleBook = $ruleBook->withFeatureFlagOverrides($overrides);
            }
        }

        $schemaErrors = YamlValidator::validate($ruleBook->raw());
        if ($strict && $schemaErrors !== []) {
            self::$lastExitCode = 2;
            return ['errors' => $schemaErrors];
        }

        $normalization = buildNormalizationFromCounts($heirCounts, $rolePersonMap);
        $eligibility = $eligibilityEngine->determineEligibility($normalization, $ruleBook);
        $warnings = array_merge($warnings, EligibilityValidator::validate($eligibility));
        $invariants = EligibilityInvariants::compute($eligibility);

        $fixedSharesDomain = $fixedEngine->computeFixedShares($eligibility, $ruleBook);
        $fixedShares = new FixedShareResult(
            $fixedSharesDomain->getGroupShares(),
            $fixedSharesDomain->getIndividualShares()
        );
        $normalizedShares = $normalizer->normalize($fixedShares, $eligibility, false);
        $residualBeforeAsaba = $normalizedShares->getResidualForAsaba();
        $domainNormalized = \NormalizedShares::create(
            $normalizedShares->getNormalizedGroupShares(),
            $normalizedShares->getNormalizedIndividualShares(),
            $normalizedShares->getSumFixedNormalized()
        );

        $asabaResult = \AsabaResult::empty();
        $residualForAsaba = $normalizedShares->getResidualForAsaba();
        if ($residualForAsaba->compareTo(Fraction::zero()) > 0) {
            $asabaResult = $asabaEngine->computeResidual($domainNormalized, $eligibility, $ruleBook);

            if (!$asabaResult->hasAsabah()) {
                $normalizedShares = $normalizer->normalize($fixedShares, $eligibility, true);
                $domainNormalized = \NormalizedShares::create(
                    $normalizedShares->getNormalizedGroupShares(),
                    $normalizedShares->getNormalizedIndividualShares(),
                    $normalizedShares->getSumFixedNormalized()
                );
                $asabaResult = \AsabaResult::empty();
            }
        }

        [$finalGroups, $finalIndividuals] = aggregateFinalShares($normalizedShares, $asabaResult, $eligibility);

        $sumFinalBeforeBayt = sumFractionMap($finalGroups);
        $spouseExcluded = ($invariants['spouses_radd_exclusion'] ?? false) === true;
        $hasAsabah = $asabaResult->hasAsabah();

        $residualPolicy = 'none';
        if ($sumFinalBeforeBayt->compareTo(Fraction::one()) < 0 && $spouseExcluded) {
            $residualPolicy = 'bayt_al_mal';
        } elseif ($hasAsabah) {
            $residualPolicy = 'asaba';
        } elseif ($normalizedShares->raddApplied()) {
            $residualPolicy = 'radd';
        }

        $baytDue = Fraction::zero();
        if ($residualPolicy === 'bayt_al_mal') {
            $baytDue = Fraction::one()->sub($sumFinalBeforeBayt)->reduce();
        }

        $sumFinal = $sumFinalBeforeBayt;

        $emitBayt = getenv('EMIT_BAYT_AL_MAL') === '1';
        if ($emitBayt && $spouseExcluded && $sumFinalBeforeBayt->compareTo(Fraction::one()) < 0) {
            $residual = Fraction::one()->sub($sumFinalBeforeBayt);
            if ($residual->compareTo(Fraction::zero()) > 0) {
                $finalGroups['bayt_al_mal'] = $residual;
                $finalIndividuals['bayt_al_mal'] = [$residual];
                ksort($finalGroups);
                ksort($finalIndividuals);
                $sumFinal = sumFractionMap($finalGroups);
            }
        }

        $eligibleCounts = collectEligibleCounts($eligibility);
        $assertions = buildAssertions(
            $sumFinal,
            $residualPolicy,
            $normalizedShares,
            $asabaResult,
            $finalGroups,
            $finalIndividuals,
            $eligibleCounts,
            $heirCounts,
            $invariants
        );
        $failedAssertions = collectAssertionFailures($assertions);

        $output = [
            'version' => self::ENGINE_VERSION,
            'input' => $outputPayload,
            'shares' => formatShares($fixedShares, $normalizedShares, $asabaResult, $finalGroups, $finalIndividuals),
            'invariants' => $invariants,
        ];

        $output['meta'] = [
            'rulebook_sha256' => $ruleBook->sha256(),
            'schema_version' => $ruleBook->schemaVersion(),
            'engine_version' => 'v' . self::ENGINE_VERSION,
            'phase_ledger' => buildPhaseLedger($fixedShares, $normalizedShares, $asabaResult),
            'residual_policy' => $residualPolicy,
            'bayt_due' => $baytDue->asString(),
            'assertions' => $assertions,
        ] + ($output['meta'] ?? []);

        if ($failedAssertions !== []) {
            $output['meta']['assertions_failed'] = $failedAssertions;
        }

        if ($schemaErrors !== []) {
            $output['meta']['schema_validation_errors'] = $schemaErrors;
        }

        $output['warnings'] = $warnings;
        if ($errors !== []) {
            $output['errors'] = $errors;
        }

        $groupStrings = fractionMapToStrings($finalGroups);
        $individualStrings = fractionListMapToStrings($finalIndividuals);

        $amountsByRoleOutput = null;
        $amountsByIndividualOutput = null;
        if ($estateValue !== null) {
            $scale = 2;
            $amountsByRoleBase = MoneyAllocator::allocate($finalGroups, $estateValue, $scale);

            $amountsByIndividualBase = [];
            foreach ($finalIndividuals as $role => $shares) {
                if ($shares === []) {
                    $amountsByIndividualBase[$role] = [];
                    continue;
                }

                $groupShare = $finalGroups[$role] ?? Fraction::zero();
                if ($groupShare->isZero()) {
                    $zero = number_format(0, $scale, '.', '');
                    $amountsByIndividualBase[$role] = array_fill(0, count($shares), $zero);
                    continue;
                }

                $relativeShares = [];
                foreach ($shares as $index => $share) {
                    $relativeShares[$index] = $share->div($groupShare);
                }

                $groupAmount = $amountsByRoleBase[$role] ?? number_format(0, $scale, '.', '');
                $allocated = MoneyAllocator::allocate($relativeShares, $groupAmount, $scale);
                $amountsByIndividualBase[$role] = array_values($allocated);
            }

            $amountsByRoleOutput = $amountsByRoleBase;
            $amountsByIndividualOutput = $amountsByIndividualBase;
        }

        $roleOrder = RoleOrder::ORDER;

        $sortByRole = static function (string $a, string $b) use ($roleOrder): int {
            $baseA = RoleNamer::baseRoleKey($a);
            $baseB = RoleNamer::baseRoleKey($b);

            $posA = array_search($baseA, $roleOrder, true);
            $posB = array_search($baseB, $roleOrder, true);

            $posA = $posA === false ? PHP_INT_MAX : $posA;
            $posB = $posB === false ? PHP_INT_MAX : $posB;

            if ($posA === $posB) {
                return $a <=> $b;
            }

            return $posA <=> $posB;
        };

        $normalizedRoles = [];
        foreach ($heirCounts as $role => $count) {
            $normalizedRoles[] = RoleNamer::groupKey($role, $count);
        }
        $normalizedRoles = array_values(array_unique($normalizedRoles));

        usort($normalizedRoles, $sortByRole);

        uksort($groupStrings, $sortByRole);
        uksort($individualStrings, $sortByRole);
        if ($amountsByRoleOutput !== null) {
            uksort($amountsByRoleOutput, $sortByRole);
        }
        if ($amountsByIndividualOutput !== null) {
            uksort($amountsByIndividualOutput, $sortByRole);
        }

        $output['group_shares'] = $groupStrings;
        $output['individual_shares'] = $individualStrings;
        if ($amountsByRoleOutput !== null) {
            $output['amounts_by_role'] = $amountsByRoleOutput;
            $output['currency'] = $currency;
        }
        if ($amountsByIndividualOutput !== null) {
            $output['amounts_by_individual'] = $amountsByIndividualOutput;
        }
        if (!empty($rolePersonDetails)) {
            $output['people_by_role'] = $rolePersonDetails;
        }

        $substitutionPolicy = strtolower(trim((string) ($ruleBook->flag('substitution_policy') ?? '')));
        if ($substitutionPolicy === 'wasiyya_wajiba') {
            $formattedWasiyya = formatWasiyyaReport(WasiyyaWajibaPolicy::getLastComputation());
            if ($formattedWasiyya !== null) {
                $output['wasiyya'] = $formattedWasiyya;
            }
        }
        $output['normalized_roles'] = array_values($normalizedRoles);
        $output['sum_fixed'] = $fixedShares->getSumFixed()->asString();
        $output['sum_fixed_normalized'] = $normalizedShares->getSumFixedNormalized()->asString();
        $output['sum_final'] = $sumFinal->asString();
        $output['residual_before_asaba'] = $residualBeforeAsaba->asString();
        $output['residual_consumed'] = $asabaResult->getResidualConsumed()->asString();
        $traceEvents = array_merge($normalizedShares->getTraceEvents(), $asabaResult->getNotes());
        $output['traces'] = array_map(static function (TraceEvent $note): array {
            $payload = [
                'rule_id' => $note->ruleId,
                'targets' => $note->targets,
                'reason' => $note->reason,
            ];

            if ($note->phase !== null) {
                $payload['phase'] = $note->phase;
            }

            if ($note->data !== []) {
                $payload['data'] = $note->data;
            }

            return $payload;
        }, $traceEvents);

        if ($audit) {
            $output['audit'] = [
                'blocks_applied' => $eligibility->traceByPhase('BLOCK'),
                'fixed_before' => $fixedShares->groupSharesAsStringMap(),
                'awl' => $normalizer->getAwlProof(),
                'radd' => $normalizer->getRaddProof(),
                'asaba' => $asabaEngine->getLastProof(),
            ];
        }

        $output['explain'] = $explain
            ? buildExplain($eligibility, $fixedShares, $normalizedShares, $asabaResult)
            : null;

        if ($strict && ($warnings !== [] || $errors !== [] || $failedAssertions !== [])) {
            self::$lastExitCode = 2;
        } else {
            self::$lastExitCode = 0;
        }

        return $output;
    }

    public static function getLastExitCode(): int
    {
        return self::$lastExitCode;
    }
}

function canonicalizeWives(array $heirs, array &$warnings, ?array &$rolePersonMap = null): array
{
    $prepared = [];
    $sanitizedOriginal = [];
    foreach ($heirs as $heir) {
        $role = (string) ($heir['role'] ?? '');
        $count = (int) ($heir['count'] ?? 0);
        $sourceMap = [];
        if (isset($heir['sources']) && is_array($heir['sources'])) {
            foreach ($heir['sources'] as $sourceRole => $sourceCount) {
                $normalizedSource = normalizeRoleKey((string) $sourceRole);
                $sourceMap[$normalizedSource] = ($sourceMap[$normalizedSource] ?? 0) + (int) $sourceCount;
            }
        }
        $prepared[] = ['role' => $role, 'count' => $count, 'sources' => $sourceMap];
        $sanitizedOriginal[] = ['role' => $role, 'count' => $count];
    }

    $result = [];
    $insertPosition = null;
    $hasWifeLabel = false;
    $wivesLabelCount = 0;
    $fromWife = 0;
    $fromWives = 0;
    $spouseTotal = 0;

    foreach ($prepared as $entry) {
        $normalizedRole = normalizeRoleKey($entry['role']);

        if ($normalizedRole === 'wife' || $normalizedRole === 'wives') {
            if ($insertPosition === null) {
                $insertPosition = count($result);
            }

            $spouseTotal += $entry['count'];
            if ($normalizedRole === 'wife') {
                $hasWifeLabel = true;
            } else {
                $wivesLabelCount++;
            }

            $sourceMap = $entry['sources'];
            $wifePortion = $sourceMap['wife'] ?? null;
            $wivesPortion = $sourceMap['wives'] ?? null;

            if ($wifePortion === null && $normalizedRole === 'wife') {
                $wifePortion = $entry['count'];
            }
            if ($wivesPortion === null && $normalizedRole === 'wives') {
                $wivesPortion = $entry['count'];
            }

            $fromWife += $wifePortion ?? 0;
            $fromWives += $wivesPortion ?? 0;

            continue;
        }

        $result[] = ['role' => $entry['role'], 'count' => $entry['count']];
    }

    if ($spouseTotal === 0) {
        if (is_array($rolePersonMap)) {
            $rolePersonMap = normalizeRolePersonMapAliases($rolePersonMap);
        }
        return $sanitizedOriginal;
    }

    if (!$hasWifeLabel && $wivesLabelCount <= 1 && $fromWife === 0) {
        if (is_array($rolePersonMap)) {
            $rolePersonMap = normalizeRolePersonMapAliases($rolePersonMap);
        }
        return $sanitizedOriginal;
    }

    $wifeContribution = $fromWife;
    $wivesContribution = $fromWives;

    if ($wifeContribution === 0 && $hasWifeLabel) {
        $wifeContribution = max(0, $spouseTotal - $wivesContribution);
    }
    if ($wivesContribution === 0 && $wivesLabelCount > 0) {
        $wivesContribution = max(0, $spouseTotal - $wifeContribution);
    }

    if ($hasWifeLabel) {
        $warnings[] = sprintf(
            "merged 'wife' and 'wives' entries into canonical 'wives' group (wife=%d, wives=%d, total=%d)",
            $spouseTotal,
            $spouseTotal,
            $spouseTotal
        );
    } elseif ($wivesLabelCount > 1) {
        $warnings[] = sprintf(
            "merged %d duplicate 'wives' entries into canonical 'wives' group (count=%d)",
            $wivesLabelCount,
            $spouseTotal
        );
    }

    if ($hasWifeLabel) {
        $warnings[] = sprintf(
            "normalized wives group to 'wives' (from label 'wife', count=%d)",
            $spouseTotal
        );
    }

    if ($insertPosition === null) {
        $insertPosition = 0;
    }

    array_splice($result, $insertPosition, 0, [['role' => 'wives', 'count' => $spouseTotal]]);

    if (is_array($rolePersonMap)) {
        $rolePersonMap = normalizeRolePersonMapAliases($rolePersonMap);
    }

    return $result;
}

function collectRolePersonIds(array $heirs): array
{
    $map = [];
    $seenByRole = [];

    foreach ($heirs as $heir) {
        if (!is_array($heir)) {
            continue;
        }

        $role = (string) ($heir['role'] ?? '');
        if ($role === '') {
            continue;
        }

        $canonical = resolveCanonicalRole($role);
        if ($canonical === null || $canonical === HeirRole::UNKNOWN) {
            $canonical = normalizeRoleKey($role);
        }

        $normalizedRole = normalizeRoleKey($canonical);
        if ($normalizedRole === '' || $normalizedRole === normalizeRoleKey(HeirRole::UNKNOWN)) {
            continue;
        }

        $personIds = extractPersonIdsFromHeir($heir);
        if ($personIds === []) {
            continue;
        }

        foreach ($personIds as $personId) {
            if (!is_scalar($personId)) {
                continue;
            }

            $key = (string) $personId;
            if (!isset($seenByRole[$normalizedRole])) {
                $seenByRole[$normalizedRole] = [];
            }

            if (isset($seenByRole[$normalizedRole][$key])) {
                continue;
            }

            $seenByRole[$normalizedRole][$key] = true;
            $map[$normalizedRole][] = $personId;
        }
    }

    ksort($map);

    return $map;
}

function collectRolePersonDetails(array $heirs): array
{
    $map = [];
    $seenByRole = [];

    foreach ($heirs as $heir) {
        if (!is_array($heir)) {
            continue;
        }

        $role = (string) ($heir['role'] ?? '');
        if ($role === '') {
            continue;
        }

        $canonical = resolveCanonicalRole($role);
        if ($canonical === null || $canonical === HeirRole::UNKNOWN) {
            $canonical = normalizeRoleKey($role);
        }

        $normalizedRole = normalizeRoleKey($canonical);
        if ($normalizedRole === '' || $normalizedRole === normalizeRoleKey(HeirRole::UNKNOWN)) {
            continue;
        }

        $persons = extractPersonDetailsFromHeir($heir);
        if ($persons === []) {
            continue;
        }

        foreach ($persons as $person) {
            $personId = $person['id'] ?? null;
            if (!is_scalar($personId)) {
                continue;
            }

            $key = (string) $personId;
            if (!isset($seenByRole[$normalizedRole])) {
                $seenByRole[$normalizedRole] = [];
            }

            if (isset($seenByRole[$normalizedRole][$key])) {
                $index = $seenByRole[$normalizedRole][$key];
                if (!isset($map[$normalizedRole][$index]['name']) || $map[$normalizedRole][$index]['name'] === '') {
                    $candidate = isset($person['name']) && is_scalar($person['name']) ? trim((string) $person['name']) : '';
                    if ($candidate !== '') {
                        $map[$normalizedRole][$index]['name'] = $candidate;
                    }
                }
                continue;
            }

            $entry = ['id' => (string) $personId];
            $name = isset($person['name']) && is_scalar($person['name']) ? trim((string) $person['name']) : '';
            if ($name !== '') {
                $entry['name'] = $name;
            }

            $seenByRole[$normalizedRole][$key] = isset($map[$normalizedRole]) ? count($map[$normalizedRole]) : 0;
            $map[$normalizedRole][] = $entry;
        }
    }

    ksort($map);

    return $map;
}

function extractPersonIdsFromHeir(array $heir): array
{
    $collected = [];

    $listKeys = ['person_ids', 'personIds', 'persons', 'people'];
    foreach ($listKeys as $key) {
        if (!isset($heir[$key]) || !is_array($heir[$key])) {
            continue;
        }

        foreach ($heir[$key] as $entry) {
            if (is_array($entry)) {
                $id = $entry['id'] ?? null;
                if (is_scalar($id)) {
                    $collected[] = $id;
                }
                continue;
            }

            if (is_scalar($entry)) {
                $collected[] = $entry;
            }
        }
    }

    $singleKeys = ['person_id', 'personId'];
    foreach ($singleKeys as $key) {
        if (isset($heir[$key]) && is_scalar($heir[$key])) {
            $collected[] = $heir[$key];
        }
    }

    return $collected;
}

function extractPersonDetailsFromHeir(array $heir): array
{
    $collected = [];

    $listKeys = ['persons', 'people'];
    foreach ($listKeys as $key) {
        if (!isset($heir[$key]) || !is_array($heir[$key])) {
            continue;
        }

        foreach ($heir[$key] as $entry) {
            if (!is_array($entry)) {
                if (is_scalar($entry)) {
                    $collected[] = ['id' => (string) $entry];
                }
                continue;
            }

            $id = $entry['id'] ?? null;
            if (!is_scalar($id)) {
                continue;
            }
            $name = $entry['name'] ?? null;
            $collected[] = ['id' => (string) $id, 'name' => $name];
        }
    }

    $listIdKeys = ['person_ids', 'personIds'];
    foreach ($listIdKeys as $key) {
        if (!isset($heir[$key]) || !is_array($heir[$key])) {
            continue;
        }

        foreach ($heir[$key] as $entry) {
            if (is_array($entry)) {
                $id = $entry['id'] ?? null;
                if (is_scalar($id)) {
                    $name = $entry['name'] ?? null;
                    $collected[] = ['id' => (string) $id, 'name' => $name];
                }
                continue;
            }

            if (is_scalar($entry)) {
                $collected[] = ['id' => (string) $entry];
            }
        }
    }

    $singleKeys = ['person_id', 'personId'];
    foreach ($singleKeys as $key) {
        if (isset($heir[$key]) && is_scalar($heir[$key])) {
            $collected[] = ['id' => (string) $heir[$key]];
        }
    }

    return $collected;
}

function normalizeRolePersonMapAliases(array $map): array
{
    $normalized = [];

    foreach ($map as $role => $ids) {
        $normalizedRole = normalizeRoleKey($role);
        if ($normalizedRole === '') {
            continue;
        }

        $normalized[$normalizedRole] = mergePersonIdLists($ids);
    }

    $wifeKey = normalizeRoleKey(HeirRole::WIFE);
    $wivesKey = normalizeRoleKey('wives');
    if (isset($normalized[$wifeKey])) {
        $normalized[$wivesKey] = mergePersonIdLists(
            $normalized[$wivesKey] ?? [],
            $normalized[$wifeKey]
        );
    }

    ksort($normalized);

    return $normalized;
}

function normalizeRolePersonDetailsAliases(array $map): array
{
    $normalized = [];

    foreach ($map as $role => $persons) {
        $normalizedRole = normalizeRoleKey($role);
        if ($normalizedRole === '') {
            continue;
        }

        $normalized[$normalizedRole] = mergePersonDetailLists($persons);
    }

    $wifeKey = normalizeRoleKey(HeirRole::WIFE);
    $wivesKey = normalizeRoleKey('wives');
    if (isset($normalized[$wifeKey])) {
        $normalized[$wivesKey] = mergePersonDetailLists($normalized[$wivesKey] ?? [], $normalized[$wifeKey]);
        unset($normalized[$wifeKey]);
    }

    ksort($normalized);

    return $normalized;
}

function mergePersonDetailLists(...$lists): array
{
    $merged = [];
    $seen = [];

    foreach ($lists as $list) {
        if (!is_array($list)) {
            continue;
        }

        foreach ($list as $entry) {
            if (is_array($entry)) {
                $id = $entry['id'] ?? null;
                if (!is_scalar($id)) {
                    continue;
                }
                $name = isset($entry['name']) && is_scalar($entry['name']) ? trim((string) $entry['name']) : '';
                $key = (string) $id;
            } elseif (is_scalar($entry)) {
                $key = (string) $entry;
                $id = $key;
                $name = '';
            } else {
                continue;
            }

            if ($key === '') {
                continue;
            }

            if (isset($seen[$key])) {
                $index = $seen[$key];
                if ($name !== '' && (!isset($merged[$index]['name']) || $merged[$index]['name'] === '')) {
                    $merged[$index]['name'] = $name;
                }
                continue;
            }

            $record = ['id' => (string) $id];
            if ($name !== '') {
                $record['name'] = $name;
            }
            $seen[$key] = count($merged);
            $merged[] = $record;
        }
    }

    return $merged;
}

function mergePersonIdLists(...$lists): array
{
    $merged = [];
    $seen = [];

    foreach ($lists as $list) {
        if (!is_array($list)) {
            continue;
        }

        foreach ($list as $value) {
            if (!is_scalar($value)) {
                continue;
            }

            $key = (string) $value;
            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $merged[] = $value;
        }
    }

    return $merged;
}

function descendantsAggregator(): DescendantsAggregator
{
    static $aggregator;

    if (!$aggregator instanceof DescendantsAggregator) {
        $aggregator = new DescendantsAggregator();
    }

    return $aggregator;
}

function descendantSexPresence(array $summary): array
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

function validatePayload(array $payload): void
{
    if (!array_key_exists('heirs', $payload) || !is_array($payload['heirs'])) {
        throw new InvalidArgumentException("Payload must include a 'heirs' array");
    }

    foreach ($payload['heirs'] as $index => $heir) {
        if (!is_array($heir)) {
            throw new InvalidArgumentException("Heir entry at index {$index} must be an object");
        }

        if (!isset($heir['role']) || !is_string($heir['role'])) {
            throw new InvalidArgumentException("Heir entry at index {$index} must include a string 'role'");
        }

        if (!array_key_exists('count', $heir)) {
            throw new InvalidArgumentException("Heir entry at index {$index} must include a 'count'");
        }

        $count = $heir['count'];
        $isValidType = is_int($count) || is_string($count) || is_float($count);
        if (!$isValidType) {
            throw new InvalidArgumentException("Heir entry at index {$index} must include a scalar 'count'");
        }
    }

    if (array_key_exists('estate_value', $payload)) {
        $estate = $payload['estate_value'];
        if (!is_scalar($estate)) {
            throw new InvalidArgumentException("Payload 'estate_value' must be a string or number");
        }

        $estateString = trim((string) $estate);
        if ($estateString === '') {
            throw new InvalidArgumentException("Payload 'estate_value' cannot be empty");
        }

        if (!preg_match('/^[+-]?\d+(?:\.\d+)?$/', $estateString)) {
            throw new InvalidArgumentException("Payload 'estate_value' must be a decimal number");
        }
    }

    if (array_key_exists('currency', $payload)) {
        $currency = $payload['currency'];
        if (!is_string($currency)) {
            throw new InvalidArgumentException("Payload 'currency' must be a string");
        }

        if (trim($currency) === '') {
            throw new InvalidArgumentException("Payload 'currency' cannot be empty");
        }
    }
}

function collectHeirCounts(array $heirs): array
{
    $counts = [];
    foreach ($heirs as $heir) {
        $role = $heir['role'];
        $count = (int) $heir['count'];
        $canonical = resolveCanonicalRole($role) ?? $role;
        if ($canonical === HeirRole::UNKNOWN && !array_key_exists($role, roleSynonymMap())) {
            $canonical = $role;
        }
        $counts[$canonical] = ($counts[$canonical] ?? 0) + $count;
    }

    ksort($counts);

    return $counts;
}

function normalizeHeirs(array $heirs): array
{
    $warnings = [];
    $errors = [];
    $aggregated = [];
    $order = [];
    $sources = [];

    foreach ($heirs as $heir) {
        $role = $heir['role'];
        $rawCount = $heir['count'];
        $normalizedKey = null;

        $count = normalizeHeirCountValue($rawCount, $role, $errors);
        if ($count === null) {
            continue;
        }

        $canonical = resolveCanonicalRole($role);
        if ($canonical !== null && $canonical !== HeirRole::UNKNOWN) {
            $normalizedKey = normalizeRoleKey($role);
            $canonicalKey = normalizeRoleKey($canonical);
            $shouldWarn = true;
            if ($canonical === HeirRole::WIFE && $normalizedKey === 'wives') {
                $shouldWarn = false;
            }
            if ($shouldWarn && $normalizedKey !== $canonicalKey) {
                $warnings[] = sprintf("normalized role '%s' -> '%s'", $role, $canonical);
            }
        }
        $sourceKey = isset($normalizedKey) ? $normalizedKey : normalizeRoleKey($role);
        if ($canonical === null) {
            $message = "Unknown heir role '{$role}'";
            $suggestion = suggestCanonicalRole($role);
            if ($suggestion !== null) {
                $message .= ". Did you mean '{$suggestion}'?";
            }
            $warnings[] = $message;
            $canonical = HeirRole::UNKNOWN;
        }

        if (!array_key_exists($canonical, $aggregated)) {
            $aggregated[$canonical] = 0;
            $order[] = $canonical;
        }

        $aggregated[$canonical] += $count;
        if (!isset($sources[$canonical])) {
            $sources[$canonical] = [];
        }
        $sources[$canonical][$sourceKey] = ($sources[$canonical][$sourceKey] ?? 0) + $count;
    }

    $normalized = [];
    foreach ($order as $roleKey) {
        $sourceMap = $sources[$roleKey] ?? [];
        $count = $aggregated[$roleKey];
        $normalized[] = [
            'role' => $roleKey,
            'count' => $count,
            'sources' => $sourceMap,
        ];

        if ($roleKey === HeirRole::WIFE && isset($sourceMap['wife'], $sourceMap['wives'])) {
            $warnings[] = sprintf(
                "merged 'wife' (%d) and 'wives' (%d) entries into canonical 'wife' group (total=%d)",
                $sourceMap['wife'],
                $sourceMap['wives'],
                $count
            );
        }
    }

    return [$normalized, $warnings, $errors];
}

function normalizeHeirCountValue($rawCount, string $role, array &$errors): ?int
{
    if (is_int($rawCount)) {
        $count = $rawCount;
    } elseif (is_string($rawCount)) {
        $trimmed = trim($rawCount);
        if ($trimmed === '') {
            $errors[] = sprintf(
                "count for role '%s' must be a non-negative integer (received: %s)",
                $role,
                describeRawValue($rawCount)
            );
            return null;
        }
        $filtered = filter_var($trimmed, FILTER_VALIDATE_INT);
        if ($filtered === false) {
            $errors[] = sprintf(
                "count for role '%s' must be a non-negative integer (received: %s)",
                $role,
                describeRawValue($rawCount)
            );
            return null;
        }
        $count = (int) $filtered;
    } elseif (is_float($rawCount)) {
        $errors[] = sprintf(
            "count for role '%s' must be a non-negative integer (received: %s)",
            $role,
            describeRawValue($rawCount)
        );
        return null;
    } else {
        $errors[] = sprintf(
            "count for role '%s' must be a non-negative integer (received: %s)",
            $role,
            describeRawValue($rawCount)
        );
        return null;
    }

    if ($count < 0) {
        $errors[] = sprintf(
            "count for role '%s' must be a non-negative integer (received: %s)",
            $role,
            describeRawValue($rawCount)
        );
        return null;
    }

    return $count;
}

function describeRawValue($value): string
{
    if (is_string($value)) {
        return "'" . $value . "'";
    }

    if (is_bool($value)) {
        return $value ? 'true' : 'false';
    }

    if (is_scalar($value)) {
        return (string) $value;
    }

    return gettype($value);
}

function collectHeirCountWarnings(array $heirCounts): array
{
    return [];
}

function collectLogicalWarnings(array $counts): array
{
    $warnings = [];

    if (($counts[HeirRole::FATHER] ?? 0) > 0 && ($counts[HeirRole::PATERNAL_GRANDFATHER] ?? 0) > 0) {
        $warnings[] = 'father present ⇒ paternal_grandfather will be blocked';
    }

    if (($counts[HeirRole::SON] ?? 0) > 0) {
        $summary = descendantsAggregator()->summarizeCounts($counts);
        foreach ($summary as $degree => $group) {
            if ($degree <= 1) {
                continue;
            }
            if (($group['males'] ?? 0) > 0 && $group['roleMale'] !== null) {
                $warnings[] = sprintf('son present ⇒ %s will be blocked', $group['roleMale']);
                break;
            }
        }
    }

    if (($counts[HeirRole::MOTHER] ?? 0) > 0 && (
        ($counts[HeirRole::MATERNAL_GRANDMOTHER] ?? 0) > 0
        || ($counts[HeirRole::PATERNAL_GRANDMOTHER] ?? 0) > 0
    )) {
        $warnings[] = 'mother present ⇒ grandmothers will be blocked';
    }

    if (($counts[HeirRole::WIFE] ?? 0) > 4) {
        $warnings[] = 'wives count > 4';
    }

    return $warnings;
}

function resolveCanonicalRole(string $role): ?string
{
    $map = roleSynonymMap();
    $key = normalizeRoleKey($role);

    if (descendantsAggregator()->describe($key) !== null) {
        return $key;
    }

    return $map[$key] ?? null;
}

function suggestCanonicalRole(string $role): ?string
{
    $map = roleSynonymMap();
    $key = normalizeRoleKey($role);

    $bestDistance = PHP_INT_MAX;
    $bestRole = null;
    foreach ($map as $synonym => $canonical) {
        if ($canonical === HeirRole::UNKNOWN) {
            continue;
        }
        $distance = levenshtein($key, $synonym);
        if ($distance < $bestDistance) {
            $bestDistance = $distance;
            $bestRole = $canonical;
        }
    }

    if ($bestDistance > 3) {
        return null;
    }

    return $bestRole;
}

function roleSynonymMap(): array
{
    static $map;
    if (is_array($map)) {
        return $map;
    }

    $definitions = [
        HeirRole::HUSBAND => ['husband', 'husbands', 'esposo', 'esposos', 'marido', 'maridos'],
        HeirRole::WIFE => ['wife', 'wives', 'esposa', 'esposas'],
        HeirRole::FATHER => ['father', 'padre', 'padres'],
        HeirRole::MOTHER => ['mother', 'madre', 'madres'],
        HeirRole::SON => ['son', 'sons', 'hijo', 'hijos'],
        HeirRole::DAUGHTER => ['daughter', 'daughters', 'hija', 'hijas'],
        HeirRole::SONS_SON => ['sons_son', 'sons son', 'nieto', 'nietos'],
        HeirRole::SONS_DAUGHTER => ['sons_daughter', 'sons daughter', 'nieta', 'nietas'],
        HeirRole::UTERINE_BROTHER => ['uterine_brother', 'uterine brother'],
        HeirRole::UTERINE_SISTER => ['uterine_sister', 'uterine sister'],
        HeirRole::FULL_BROTHER => ['full_brother', 'full brother'],
        HeirRole::FULL_SISTER => ['full_sister', 'full sister'],
        HeirRole::CONSANGUINE_BROTHER => ['consanguine_brother', 'consanguine brother'],
        HeirRole::CONSANGUINE_SISTER => ['consanguine_sister', 'consanguine sister'],
        HeirRole::PATERNAL_UNCLE => ['paternal_uncle', 'paternal uncle', 'paternal_uncles', 'paternal uncles', 'amm', 'amm_paternal'],
        HeirRole::PATERNAL_GRANDFATHER => ['paternal_grandfather', 'abuelo paterno', 'abuelos paternos'],
        HeirRole::PATERNAL_GRANDMOTHER => ['paternal_grandmother', 'abuela paterna', 'abuelas paternas', 'abuela_paterna'],
        HeirRole::MATERNAL_GRANDMOTHER => ['maternal_grandmother', 'abuela materna', 'abuelas maternas', 'abuela_materna'],
        HeirRole::PATERNAL_UNCLE => ['paternal_uncle', 'paternal_uncles', 'uncle_paternal', 'uncle_paternals'],
        HeirRole::PATERNAL_UNCLES_DAUGHTER => ['paternal_uncles_daughter', 'paternal_uncles_daughters'],
        HeirRole::PATERNAL_UNCLE_SON => ['paternal_uncle_son', 'paternal_uncles_son', 'paternal_uncles_sons'],
        HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER => ['paternal_uncle_sons_daughter', 'paternal_uncle_sons_daughters'],
        HeirRole::CONSANGUINE_PATERNAL_UNCLE => ['consanguine_paternal_uncle', 'consanguine_paternal_uncles'],
        HeirRole::CONSANGUINE_PATERNAL_UNCLES_DAUGHTER => ['consanguine_paternal_uncles_daughter', 'consanguine_paternal_uncles_daughters'],
        HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON => ['consanguine_paternal_uncle_son', 'consanguine_paternal_uncles_son', 'consanguine_paternal_uncles_sons'],
        HeirRole::CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER => ['consanguine_paternal_uncle_sons_daughter', 'consanguine_paternal_uncle_sons_daughters'],
        HeirRole::UNKNOWN => ['unknown'],
    ];

    $map = [];
    foreach ($definitions as $canonical => $synonyms) {
        $map[normalizeRoleKey($canonical)] = $canonical;
        foreach ($synonyms as $synonym) {
            $map[normalizeRoleKey($synonym)] = $canonical;
        }
    }

    return $map;
}

function normalizeRoleKey(string $role): string
{
    $key = strtolower(trim($role));
    $key = str_replace(['-', ' '], '_', $key);
    $key = preg_replace('/__+/', '_', $key) ?? $key;

    return $key;
}

function formatShares(
    FixedShareResult $fixedShares,
    NormalizedShares $normalizedShares,
    \AsabaResult $asabaResult,
    array $finalGroupShares,
    array $finalIndividualShares
): array
{
    $fixedGroups = fractionMapToStrings($fixedShares->getGroupShares());
    $fixedIndividuals = fractionListMapToStrings($fixedShares->getIndividualShares());

    $normalizedGroups = fractionMapToStrings($normalizedShares->getNormalizedGroupShares());
    $normalizedIndividuals = fractionListMapToStrings($normalizedShares->getNormalizedIndividualShares());

    $asabaGroups = fractionMapToStrings($asabaResult->getGroupShares());
    $asabaIndividuals = fractionListMapToStrings($asabaResult->getIndividualShares());
    $asabaNotes = array_map(static function (TraceEvent $note): array {
        return [
            'ruleId' => $note->ruleId,
            'targets' => $note->targets,
            'reason' => $note->reason,
        ];
    }, $asabaResult->getNotes());

    $finalGroupsFormatted = fractionMapToStrings($finalGroupShares);
    $finalIndividualsFormatted = fractionListMapToStrings($finalIndividualShares);
    $sumFinal = sumFractionMap($finalGroupShares);

    return [
        'fixed' => [
            'groups' => $fixedGroups,
            'individuals' => $fixedIndividuals,
            'sumFixed' => $fixedShares->getSumFixed()->asString(),
        ],
        'normalized' => [
            'groups' => $normalizedGroups,
            'individuals' => $normalizedIndividuals,
            'sumFixedNormalized' => $normalizedShares->getSumFixedNormalized()->asString(),
            'residualForAsaba' => $normalizedShares->getResidualForAsaba()->asString(),
        ],
        'asaba' => [
            'residualConsumed' => $asabaResult->getResidualConsumed()->asString(),
            'groups' => $asabaGroups,
            'individuals' => $asabaIndividuals,
            'notes' => array_values($asabaNotes),
        ],
        'final' => [
            'groups' => $finalGroupsFormatted,
            'individuals' => $finalIndividualsFormatted,
            'sumFinal' => $sumFinal->asString(),
        ],
    ];
}

function buildPhaseLedger(FixedShareResult $fixedShares, NormalizedShares $normalizedShares, \AsabaResult $asabaResult): array
{
    $ledger = [];
    /** @var array<string,Fraction> $state */
    $state = [];

    $fixedState = $fixedShares->getGroupShares();
    $ledger[] = formatPhaseLedgerEntry('FIXED', 'before', $state, $state);
    $ledger[] = formatPhaseLedgerEntry('FIXED', 'after', $state, $fixedState);
    $state = $fixedState;

    $ledger[] = formatPhaseLedgerEntry('SPECIAL', 'before', $state, $state);
    $ledger[] = formatPhaseLedgerEntry('SPECIAL', 'after', $state, $state);

    $normalizedState = $normalizedShares->getNormalizedGroupShares();
    $normalizerEvents = $normalizedShares->getTraceEvents();
    $awlApplied = traceEventsIncludePhase($normalizerEvents, 'AWL');
    $raddApplied = traceEventsIncludePhase($normalizerEvents, 'RADD');

    $ledger[] = formatPhaseLedgerEntry('AWL', 'before', $state, $state);
    if ($awlApplied) {
        $ledger[] = formatPhaseLedgerEntry('AWL', 'after', $state, $normalizedState);
        $state = $normalizedState;
    } else {
        $ledger[] = formatPhaseLedgerEntry('AWL', 'after', $state, $state);
    }

    $ledger[] = formatPhaseLedgerEntry('RADD', 'before', $state, $state);
    if ($raddApplied) {
        $ledger[] = formatPhaseLedgerEntry('RADD', 'after', $state, $normalizedState);
        $state = $normalizedState;
    } else {
        $ledger[] = formatPhaseLedgerEntry('RADD', 'after', $state, $state);
    }

    $ledger[] = formatPhaseLedgerEntry('ASABA', 'before', $state, $state);
    $asabaShares = $asabaResult->getGroupShares();
    if ($asabaShares !== []) {
        $afterAsaba = addFractionMaps($state, $asabaShares);
        $ledger[] = formatPhaseLedgerEntry('ASABA', 'after', $state, $afterAsaba);
        $state = $afterAsaba;
    } else {
        $ledger[] = formatPhaseLedgerEntry('ASABA', 'after', $state, $state);
    }

    return $ledger;
}

function formatPhaseLedgerEntry(string $phase, string $action, array $before, array $after): array
{
    $delta = diffFractionMaps($before, $after);
    $prefix = $action === 'before' ? 'Before' : 'After';

    return [
        'phase' => $phase,
        'action' => $action,
        'details' => sprintf('%s %s phase', $prefix, $phase),
        'delta' => $delta,
    ];
}

function diffFractionMaps(array $before, array $after): array
{
    $roles = array_unique(array_merge(array_keys($before), array_keys($after)));
    sort($roles);

    $delta = [];
    foreach ($roles as $role) {
        $previous = $before[$role] ?? Fraction::zero();
        $current = $after[$role] ?? Fraction::zero();
        $difference = $current->sub($previous);

        if ($difference->compareTo(Fraction::zero()) === 0) {
            continue;
        }

        $formatted = $difference->asString();
        if ($difference->compareTo(Fraction::zero()) > 0) {
            $formatted = '+' . $formatted;
        }

        $delta[$role] = $formatted;
    }

    return $delta;
}

function addFractionMaps(array $base, array $increments): array
{
    $result = $base;
    foreach ($increments as $role => $share) {
        if (!$share instanceof Fraction) {
            continue;
        }

        $existing = $result[$role] ?? Fraction::zero();
        $result[$role] = $existing->add($share);
    }

    ksort($result);

    return $result;
}

function traceEventsIncludePhase(array $events, string $phase): bool
{
    foreach ($events as $event) {
        if ($event instanceof TraceEvent && $event->phase === $phase) {
            return true;
        }
    }

    return false;
}

function buildExplain(
    EligibilityResult $eligibility,
    FixedShareResult $fixedShares,
    NormalizedShares $normalizedShares,
    \AsabaResult $asabaResult
): array {
    $rolePersonMap = $eligibility->roleToPersonIds();

    $steps = array_merge(
        buildExplainPhaseScaffold($fixedShares, $normalizedShares, $asabaResult, $rolePersonMap),
        buildExplainEligibility($eligibility, $rolePersonMap),
        buildExplainFixed($fixedShares, $rolePersonMap),
        buildExplainNormalizer($normalizedShares, $rolePersonMap),
        buildExplainAsaba($asabaResult, $rolePersonMap)
    );

    return ['steps' => array_values($steps)];
}

function buildExplainPhaseScaffold(
    FixedShareResult $fixedShares,
    NormalizedShares $normalizedShares,
    \AsabaResult $asabaResult,
    array $rolePersonMap
): array {
    $ledger = buildPhaseLedger($fixedShares, $normalizedShares, $asabaResult);
    $state = [];
    $steps = [];

    foreach ($ledger as $entry) {
        $phase = strtoupper((string) ($entry['phase'] ?? ''));
        if ($phase === '') {
            continue;
        }

        $action = strtolower((string) ($entry['action'] ?? ''));
        if ($action === '') {
            continue;
        }

        $delta = is_array($entry['delta'] ?? null) ? $entry['delta'] : [];
        $changes = [];

        foreach ($delta as $role => $deltaValue) {
            if (!is_string($deltaValue)) {
                continue;
            }

            $before = $state[$role] ?? Fraction::zero();
            $deltaFraction = parseSignedFraction($deltaValue);
            $after = $before->add($deltaFraction)->reduce();

            $changes[$role] = [
                'before' => $before->asString(),
                'after' => $after->asString(),
            ];
        }

        $steps[] = [
            'stage' => $phase,
            'rule' => sprintf('phase.%s.%s', strtolower($phase), $action),
            'changes' => $changes,
            'note' => (string) ($entry['details'] ?? sprintf('%s %s phase', ucfirst($action), $phase)),
            'byPerson' => byPersonForRoles(array_keys($changes), $rolePersonMap),
        ];

        if ($action === 'after') {
            foreach ($delta as $role => $deltaValue) {
                if (!is_string($deltaValue)) {
                    continue;
                }

                $previous = $state[$role] ?? Fraction::zero();
                $state[$role] = $previous->add(parseSignedFraction($deltaValue))->reduce();
            }
        }
    }

    return $steps;
}

function fractionMapToStrings(array $fractions): array
{
    $formatted = [];
    foreach ($fractions as $role => $fraction) {
        $formatted[$role] = $fraction->asString();
    }

    ksort($formatted);

    return $formatted;
}

function fractionListMapToStrings(array $fractionLists): array
{
    $formatted = [];
    foreach ($fractionLists as $role => $fractions) {
        $formatted[$role] = [];
        foreach ($fractions as $fraction) {
            $formatted[$role][] = $fraction->asString();
        }
    }

    ksort($formatted);

    return $formatted;
}

function explainStageFromPhase(?string $phase, string $fallback): string
{
    $normalized = strtoupper(trim((string) ($phase ?? '')));
    if ($normalized === '') {
        return strtoupper($fallback);
    }

    if ($normalized === 'UMARIYYA') {
        return 'SPECIAL';
    }

    return $normalized;
}

function buildExplainEligibility(EligibilityResult $eligibility, array $rolePersonMap): array
{
    $steps = [];

    foreach ($eligibility->getNotes() as $event) {
        if (strcasecmp((string) $event->phase, 'BLOCK') !== 0) {
            continue;
        }

        if ($event->targets === []) {
            continue;
        }

        $changes = [];
        foreach ($event->targets as $role) {
            $changes[$role] = ['before' => 'eligible', 'after' => 'blocked'];
        }

        uksort($changes, [RoleOrder::class, 'cmp']);
        $rolesForStep = array_values($event->targets);
        $steps[] = [
            'stage' => explainStageFromPhase($event->phase, 'BLOCK'),
            'rule' => $event->ruleId,
            'changes' => $changes,
            'note' => $event->reason,
            'byPerson' => byPersonForRoles($rolesForStep, $rolePersonMap),
        ];
    }

    return $steps;
}

function buildExplainFixed(FixedShareResult $fixedShares, array $rolePersonMap): array
{
    $steps = [];
    $final = $fixedShares->getGroupShares();
    $current = [];

    foreach ($fixedShares->getTraceEvents() as $event) {
        if (str_starts_with($event->ruleId, 'fixed.phase.')) {
            continue;
        }

        $action = $event->data['action'] ?? null;
        if ($action === 'before' || $action === 'skipped') {
            continue;
        }

        $changes = [];
        foreach ($event->targets as $role) {
            $after = $final[$role] ?? Fraction::zero();
            $before = $current[$role] ?? Fraction::zero();

            if ($before->eq($after)) {
                continue;
            }

            $changes[$role] = [
                'before' => $before->asString(),
                'after' => $after->asString(),
            ];
            $current[$role] = $after;
        }

        if ($changes === []) {
            continue;
        }

        uksort($changes, [RoleOrder::class, 'cmp']);
        $steps[] = [
            'stage' => explainStageFromPhase($event->phase, 'FIXED'),
            'rule' => $event->ruleId,
            'changes' => $changes,
            'note' => $event->reason,
            'byPerson' => byPersonForRoles(
                array_values(array_unique(array_merge($event->targets, array_keys($changes)))),
                $rolePersonMap
            ),
        ];
    }

    return $steps;
}

function buildExplainNormalizer(NormalizedShares $normalizedShares, array $rolePersonMap): array
{
    $steps = [];
    $final = $normalizedShares->getNormalizedGroupShares();

    foreach ($normalizedShares->getTraceEvents() as $event) {
        $phase = strtoupper((string) $event->phase);

        if ($event->ruleId === 'normalizer.umariyya') {
            $beforeMother = $event->data['mother_before'] ?? null;
            $afterMother = $event->data['mother_after'] ?? null;
            if ($beforeMother === null || $afterMother === null) {
                continue;
            }

            $changes = [
                'mother' => [
                    'before' => Fraction::fromString((string) $beforeMother)->asString(),
                    'after' => Fraction::fromString((string) $afterMother)->asString(),
                ],
            ];

            uksort($changes, [RoleOrder::class, 'cmp']);
            $steps[] = [
                'stage' => 'fixed',
                'rule' => $event->ruleId,
                'changes' => $changes,
                'note' => $event->reason,
                'byPerson' => byPersonForRoles(
                    array_values(array_unique(array_merge($event->targets, array_keys($changes)))),
                    $rolePersonMap
                ),
            ];

            continue;
        }

        if ($phase === 'AWL' || $phase === 'RADD') {
            $stage = $phase;
            $delta = $event->data['delta'] ?? [];
            if (!is_array($delta) || $delta === []) {
                $steps[] = [
                    'stage' => $stage,
                    'rule' => $event->ruleId,
                    'changes' => [],
                    'note' => $event->reason,
                    'byPerson' => byPersonForRoles($event->targets, $rolePersonMap),
                ];
                continue;
            }

            $changes = [];
            foreach ($delta as $role => $deltaValue) {
                $after = $final[$role] ?? Fraction::zero();
                $deltaFraction = parseSignedFraction((string) $deltaValue);
                $before = $after->sub($deltaFraction)->reduce();
                if ($before->eq($after)) {
                    continue;
                }

                $changes[$role] = [
                    'before' => $before->asString(),
                    'after' => $after->asString(),
                ];
            }

            if ($changes === []) {
                $steps[] = [
                    'stage' => $stage,
                    'rule' => $event->ruleId,
                    'changes' => [],
                    'note' => $event->reason,
                    'byPerson' => byPersonForRoles($event->targets, $rolePersonMap),
                ];
                continue;
            }

            uksort($changes, [RoleOrder::class, 'cmp']);
            $steps[] = [
                'stage' => $stage,
                'rule' => $event->ruleId,
                'changes' => $changes,
                'note' => $event->reason,
                'byPerson' => byPersonForRoles(
                    array_values(array_unique(array_merge($event->targets, array_keys($changes)))),
                    $rolePersonMap
                ),
            ];
        }
    }

    return $steps;
}

function buildExplainAsaba(\AsabaResult $asabaResult, array $rolePersonMap): array
{
    $steps = [];
    $final = $asabaResult->getGroupShares();

    foreach ($asabaResult->getNotes() as $event) {
        $delta = $event->data['delta'] ?? [];
        if (!is_array($delta) || $delta === []) {
            continue;
        }

        $changes = [];
        foreach ($delta as $role => $deltaValue) {
            $after = $final[$role] ?? Fraction::zero();
            $deltaFraction = parseSignedFraction((string) $deltaValue);
            $before = $after->sub($deltaFraction)->reduce();
            if ($before->eq($after)) {
                continue;
            }

            $changes[$role] = [
                'before' => $before->asString(),
                'after' => $after->asString(),
            ];
        }

        if ($changes === []) {
            continue;
        }

        uksort($changes, [RoleOrder::class, 'cmp']);
        $steps[] = [
            'stage' => explainStageFromPhase($event->phase, 'ASABA'),
            'rule' => $event->ruleId,
            'changes' => $changes,
            'note' => $event->reason,
            'byPerson' => byPersonForRoles(
                array_values(array_unique(array_merge($event->targets, array_keys($changes)))),
                $rolePersonMap
            ),
        ];
    }

    return $steps;
}

function byPersonForRoles(array $roles, array $rolePersonMap): array
{
    $result = [];

    foreach ($roles as $role) {
        if (!is_string($role) || trim($role) === '') {
            continue;
        }

        if (isset($rolePersonMap[$role])) {
            $result[$role] = $rolePersonMap[$role];
            continue;
        }

        $normalized = normalizeRoleKey($role);
        if (isset($rolePersonMap[$normalized])) {
            $result[$role] = $rolePersonMap[$normalized];
            continue;
        }

        $canonical = resolveCanonicalRole($role);
        if ($canonical !== null && $canonical !== HeirRole::UNKNOWN) {
            if (isset($rolePersonMap[$canonical])) {
                $result[$role] = $rolePersonMap[$canonical];
                continue;
            }

            $canonicalKey = normalizeRoleKey($canonical);
            if (isset($rolePersonMap[$canonicalKey])) {
                $result[$role] = $rolePersonMap[$canonicalKey];
            }
        }
    }

    return $result;
}

function parseSignedFraction(string $value): Fraction
{
    $trimmed = trim($value);
    if ($trimmed === '') {
        return Fraction::zero();
    }

    $sign = 1;
    $first = $trimmed[0] ?? '';
    if ($first === '+') {
        $trimmed = substr($trimmed, 1);
    } elseif ($first === '-') {
        $sign = -1;
        $trimmed = substr($trimmed, 1);
    }

    if ($trimmed === '' || $trimmed === null) {
        return Fraction::zero();
    }

    $fraction = Fraction::fromString($trimmed);
    if ($sign === -1) {
        return Fraction::zero()->sub($fraction);
    }

    return $fraction;
}

function sumFractionMap(array $fractions): Fraction
{
    $sum = Fraction::zero();
    foreach ($fractions as $fraction) {
        if ($fraction instanceof Fraction) {
            $sum = $sum->add($fraction);
        }
    }

    return $sum;
}

function buildNormalizationFromCounts(array $heirCounts, array $rolePersonMap = []): \NormalizationResult
{
    $heirs = [];
    foreach ($heirCounts as $role => $count) {
        if ($count <= 0) {
            continue;
        }

        $defaults = resolveRoleDefaults($role);
        $heirs[] = new \Heir(
            $role,
            $defaults['sex'],
            $count,
            true,
            $defaults['degree'],
            $defaults['side']
        );
    }

    $context = buildContextFlags($heirCounts);

    return new \NormalizationResult($heirs, $context, $rolePersonMap);
}

function buildContextFlags(array $heirCounts): \ContextFlags
{
    $summary = descendantsAggregator()->summarizeCounts($heirCounts);
    $hasDescendants = $summary !== [];
    [$hasMaleDescendant, $hasFemaleDescendant] = descendantSexPresence($summary);
    $hasFather = ($heirCounts[HeirRole::FATHER] ?? 0) > 0;
    $hasPaternalGrandfather = ($heirCounts[HeirRole::PATERNAL_GRANDFATHER] ?? 0) > 0;

    $siblingsRoles = [
        HeirRole::FULL_BROTHER,
        HeirRole::FULL_SISTER,
        HeirRole::CONSANGUINE_BROTHER,
        HeirRole::CONSANGUINE_SISTER,
        HeirRole::UTERINE_BROTHER,
        HeirRole::UTERINE_SISTER,
    ];

    $siblingsCount = 0;
    foreach ($siblingsRoles as $role) {
        $siblingsCount += $heirCounts[$role] ?? 0;
    }

    $uterinesCount = ($heirCounts[HeirRole::UTERINE_BROTHER] ?? 0)
        + ($heirCounts[HeirRole::UTERINE_SISTER] ?? 0);
    $wivesCount = $heirCounts[HeirRole::WIFE] ?? 0;

    return new \ContextFlags(
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

function hasDescendants(array $heirCounts): bool
{
    $summary = descendantsAggregator()->summarizeCounts($heirCounts);

    return $summary !== [];
}

function resolveRoleDefaults(string $role): array
{
    $descendant = descendantsAggregator()->describe($role);
    if ($descendant !== null) {
        $sex = $descendant['sex'] ?? Sex::UNKNOWN->value;

        return [
            'sex' => $sex,
            'degree' => $descendant['degree'],
            'side' => LineageSide::NONE->value,
        ];
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
        case HeirRole::PATERNAL_GRANDMOTHER:
            return ['sex' => Sex::FEMALE->value, 'degree' => -2, 'side' => LineageSide::PATERNAL->value];
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

function aggregateFinalShares(NormalizedShares $normalizedShares, \AsabaResult $asabaResult, EligibilityResult $eligibility): array
{
    $normalizedGroups = $normalizedShares->getNormalizedGroupShares();
    $normalizedIndividuals = $normalizedShares->getNormalizedIndividualShares();
    $asabaGroups = $asabaResult->getGroupShares();
    $asabaIndividuals = $asabaResult->getIndividualShares();

    $finalGroups = [];
    $finalIndividuals = [];

    $countsByRole = collectEligibleCounts($eligibility);

    $roles = array_unique(array_merge(
        array_keys($normalizedGroups),
        array_keys($normalizedIndividuals),
        array_keys($asabaGroups),
        array_keys($asabaIndividuals)
    ));

    foreach ($roles as $role) {
        $count = $countsByRole[$role] ?? 0;
        if ($count <= 0) {
            $count = count($normalizedIndividuals[$role] ?? []);
        }
        if ($count <= 0) {
            $count = count($asabaIndividuals[$role] ?? []);
        }

        $shareSource = $normalizedGroups[$role] ?? ($asabaGroups[$role] ?? null);
        if ($count <= 0 && $shareSource instanceof Fraction && !$shareSource->isZero()) {
            $count = 1;
        }

        $key = RoleNamer::groupKey($role, $count);

        if (isset($normalizedGroups[$role])) {
            $existing = $finalGroups[$key] ?? Fraction::zero();
            $finalGroups[$key] = $existing->add($normalizedGroups[$role]);
        }
        if (isset($asabaGroups[$role])) {
            $existing = $finalGroups[$key] ?? Fraction::zero();
            $finalGroups[$key] = $existing->add($asabaGroups[$role]);
        }

        if (isset($normalizedIndividuals[$role])) {
            $finalIndividuals[$key] = mergeIndividualShares($finalIndividuals[$key] ?? [], $normalizedIndividuals[$role]);
        }
        if (isset($asabaIndividuals[$role])) {
            $finalIndividuals[$key] = mergeIndividualShares($finalIndividuals[$key] ?? [], $asabaIndividuals[$role]);
        }
    }

    $canonicalCounts = [];
    foreach ($countsByRole as $role => $count) {
        $key = RoleNamer::groupKey($role, $count);
        $canonicalCounts[$key] = ($canonicalCounts[$key] ?? 0) + $count;
    }

    foreach ($finalIndividuals as $key => $fractions) {
        $filtered = array_values(array_filter(
            $fractions,
            static fn (Fraction $fraction): bool => !$fraction->isZero()
        ));

        $groupShare = $finalGroups[$key] ?? Fraction::zero();
        if ($filtered === [] && $groupShare->isZero()) {
            unset($finalIndividuals[$key]);
            continue;
        }

        $finalIndividuals[$key] = $filtered;
    }

    foreach ($finalGroups as $key => $share) {
        if (!isset($canonicalCounts[$key]) && $share instanceof Fraction) {
            $canonicalCounts[$key] = count($finalIndividuals[$key] ?? []);
        }
    }

    foreach ($canonicalCounts as $key => $count) {
        if ($count <= 0) {
            continue;
        }

        $groupShare = $finalGroups[$key] ?? Fraction::zero();
        $individuals = $finalIndividuals[$key] ?? [];

        $sum = Fraction::zero();
        foreach ($individuals as $fraction) {
            $sum = $sum->add($fraction);
        }

        if ($sum->equals($groupShare) && count($individuals) === $count) {
            continue;
        }

        if ($groupShare->isZero()) {
            $finalIndividuals[$key] = [];
            continue;
        }

        $perShare = $groupShare->div(Fraction::fromInt($count));
        $finalIndividuals[$key] = array_fill(0, $count, $perShare);
    }

    foreach ($finalIndividuals as $key => $fractions) {
        $filtered = array_values(array_filter(
            $fractions,
            static fn (Fraction $fraction): bool => !$fraction->isZero()
        ));

        $groupShare = $finalGroups[$key] ?? Fraction::zero();
        if ($filtered === [] && $groupShare->isZero()) {
            unset($finalIndividuals[$key]);
            continue;
        }

        $finalIndividuals[$key] = $filtered;
    }

    ksort($finalGroups);
    ksort($finalIndividuals);

    return [$finalGroups, $finalIndividuals];
}

function mergeIndividualShares(array $current, array $additional): array
{
    $result = [];
    $max = max(count($current), count($additional));
    for ($idx = 0; $idx < $max; $idx++) {
        $base = $current[$idx] ?? Fraction::zero();
        $extra = $additional[$idx] ?? Fraction::zero();
        $result[$idx] = $base->add($extra);
    }

    return $result;
}

function formatWasiyyaReport(?array $report): ?array
{
    if ($report === null) {
        return null;
    }

    if (($report['policy'] ?? null) !== 'wasiyya_wajiba') {
        return null;
    }

    $toFraction = static function ($value): Fraction {
        if ($value instanceof Fraction) {
            return $value;
        }
        if (is_string($value)) {
            return Fraction::fromString($value);
        }
        if (is_int($value)) {
            return Fraction::fromInt($value);
        }
        if (is_float($value)) {
            return Fraction::fromString((string) $value);
        }

        return Fraction::zero();
    };

    $formatFraction = static fn (Fraction $fraction): string => $fraction->asString();

    $cap = $toFraction($report['cap'] ?? Fraction::zero());
    $hypothetical = $toFraction($report['hypothetical'] ?? Fraction::zero());
    $sum = $toFraction($report['sum'] ?? Fraction::zero());

    $output = [
        'policy' => 'wasiyya_wajiba',
        'cap' => $formatFraction($cap),
        'hypothetical' => $formatFraction($hypothetical),
        'sum' => $formatFraction($sum),
        'branches' => [],
    ];

    $branches = is_array($report['branches'] ?? null) ? $report['branches'] : [];
    foreach ($branches as $branch) {
        if (!is_array($branch)) {
            continue;
        }

        $alloc = is_array($branch['alloc'] ?? null) ? $branch['alloc'] : [];
        $grandsonsAlloc = is_array($alloc['grandsons'] ?? null) ? $alloc['grandsons'] : [];
        $granddaughtersAlloc = is_array($alloc['granddaughters'] ?? null) ? $alloc['granddaughters'] : [];

        $grandsonsCount = (int) ($grandsonsAlloc['count'] ?? 0);
        $granddaughtersCount = (int) ($granddaughtersAlloc['count'] ?? 0);

        $branchOutput = [
            'for' => (string) ($branch['label'] ?? 'predeceased_son_branch'),
            'hypothetical' => $formatFraction($toFraction($branch['hypothetical'] ?? Fraction::zero())),
            'share' => $formatFraction($toFraction($branch['share'] ?? Fraction::zero())),
            'limited_by_cap' => (bool) ($branch['limited_by_cap'] ?? false),
            'alloc' => [
                'grandsons' => [
                    'count' => $grandsonsCount,
                    'total' => $formatFraction($toFraction($grandsonsAlloc['total'] ?? Fraction::zero())),
                ],
                'granddaughters' => [
                    'count' => $granddaughtersCount,
                    'total' => $formatFraction($toFraction($granddaughtersAlloc['total'] ?? Fraction::zero())),
                ],
            ],
        ];

        if ($grandsonsCount > 0) {
            $branchOutput['alloc']['grandsons']['per_capita'] = $formatFraction($toFraction($grandsonsAlloc['per_capita'] ?? Fraction::zero()));
        }

        if ($granddaughtersCount > 0) {
            $branchOutput['alloc']['granddaughters']['per_capita'] = $formatFraction($toFraction($granddaughtersAlloc['per_capita'] ?? Fraction::zero()));
        }

        $output['branches'][] = $branchOutput;
    }

    return $output;
}

function collectEligibleCounts(EligibilityResult $eligibility): array
{
    $counts = [];
    foreach ($eligibility->getEligibleHeirs() as $heir) {
        if (!$heir instanceof \Heir) {
            continue;
        }

        $role = $heir->getRole();
        $counts[$role] = ($counts[$role] ?? 0) + $heir->getCount();
    }

    return $counts;
}

/**
 * @param array<string, Fraction> $finalGroups
 * @param array<string, int>      $eligibleCounts
 * @param array<string, int>      $inputCounts
 */
function buildAssertions(
    Fraction $sumFinal,
    string $residualPolicy,
    NormalizedShares $normalizedShares,
    \AsabaResult $asabaResult,
    array $finalGroups,
    array $finalIndividuals,
    array $eligibleCounts,
    array $inputCounts,
    array $invariants
): array {
    $sumIsOne = $sumFinal->equals(Fraction::one());
    $sumOk = $sumIsOne || ($residualPolicy === 'bayt_al_mal' && $sumFinal->compareTo(Fraction::one()) < 0);

    $raddGated = !$asabaResult->hasAsabah() || !$normalizedShares->raddApplied();

    $baytShare = $finalGroups['bayt_al_mal'] ?? null;
    $hasBaytDistribution = $baytShare instanceof Fraction && $baytShare->compareTo(Fraction::zero()) > 0;

    $allowedPolicies = ['none', 'asaba', 'radd'];
    if ($sumIsOne) {
        if ($hasBaytDistribution) {
            $sumVsPolicy = $residualPolicy === 'bayt_al_mal';
        } else {
            $sumVsPolicy = in_array($residualPolicy, $allowedPolicies, true);
        }
    } else {
        $sumVsPolicy = $residualPolicy === 'bayt_al_mal';
    }

    $spouseExcluded = ($invariants['spouses_radd_exclusion'] ?? false) === true;
    if ($sumIsOne) {
        $spouseGapRequiresBayt = !$spouseExcluded || !$hasBaytDistribution || $residualPolicy === 'bayt_al_mal';
    } else {
        $spouseGapRequiresBayt = !$spouseExcluded || $residualPolicy === 'bayt_al_mal';
    }

    $groupsNonNegative = true;
    $groupsAtMostOne = true;
    foreach ($finalGroups as $share) {
        if (!$share instanceof Fraction) {
            continue;
        }

        if ($share->compareTo(Fraction::zero()) < 0) {
            $groupsNonNegative = false;
        }

        if ($share->compareTo(Fraction::one()) > 0) {
            $groupsAtMostOne = false;
        }
    }

    $individualNonNegative = true;
    $individualAtMostOne = true;
    $collectiveMatchesIndividuals = true;

    foreach ($finalIndividuals as $role => $shares) {
        $groupShare = $finalGroups[$role] ?? Fraction::zero();
        if (!$groupShare instanceof Fraction) {
            $groupShare = Fraction::zero();
        }

        $sumIndividuals = Fraction::zero();
        foreach ($shares as $share) {
            if (!$share instanceof Fraction) {
                $individualNonNegative = false;
                $individualAtMostOne = false;
                continue;
            }

            if ($share->compareTo(Fraction::zero()) < 0) {
                $individualNonNegative = false;
            }

            if ($share->compareTo(Fraction::one()) > 0) {
                $individualAtMostOne = false;
            }

            $sumIndividuals = $sumIndividuals->add($share);
        }

        if ($shares !== [] && $groupShare->compareTo($sumIndividuals) !== 0) {
            $collectiveMatchesIndividuals = false;
        }
    }

    $hasFather = assertionCount($eligibleCounts, [HeirRole::FATHER]) > 0;
    $fatherBlocksPgf = !$hasFather || assertionSharesZero($finalGroups, [HeirRole::PATERNAL_GRANDFATHER]);

    $hasPgf = assertionCount($eligibleCounts, [HeirRole::PATERNAL_GRANDFATHER]) > 0;
    $pgfBlocksSiblings = !$hasPgf || (
        assertionSharesZero($finalGroups, [HeirRole::FULL_BROTHER, HeirRole::CONSANGUINE_BROTHER])
        && assertionSharesZero($finalGroups, [HeirRole::FULL_SISTER, HeirRole::CONSANGUINE_SISTER])
    );

    $hasMother = assertionCount($eligibleCounts, [HeirRole::MOTHER]) > 0;
    $motherBlocksGrandmothers = !$hasMother || (
        assertionSharesZero($finalGroups, [HeirRole::MATERNAL_GRANDMOTHER])
        && assertionSharesZero($finalGroups, [HeirRole::PATERNAL_GRANDMOTHER])
    );

    $hasSon = assertionCount($eligibleCounts, [HeirRole::SON]) > 0;
    $sonBlocksSiblings = !$hasSon || (
        assertionSharesZero($finalGroups, [HeirRole::FULL_BROTHER, HeirRole::CONSANGUINE_BROTHER])
        && assertionSharesZero($finalGroups, [HeirRole::FULL_SISTER, HeirRole::CONSANGUINE_SISTER])
    );

    $maleDescPresent = assertionCount($eligibleCounts, [HeirRole::SON, HeirRole::SONS_SON]) > 0;
    $maleDescBlocksUncle = !$maleDescPresent || (
        assertionSharesZero($finalGroups, [HeirRole::PATERNAL_UNCLE])
        && assertionSharesZero($finalGroups, [HeirRole::CONSANGUINE_PATERNAL_UNCLE])
    );

    $hasDescendants = assertionCount($eligibleCounts, [
        HeirRole::SON,
        HeirRole::DAUGHTER,
        HeirRole::SONS_SON,
        HeirRole::SONS_DAUGHTER,
    ]) > 0;
    $hasAscendants = assertionCount($eligibleCounts, [
        HeirRole::FATHER,
        HeirRole::PATERNAL_GRANDFATHER,
    ]) > 0;

    $uterineCount = assertionCount($eligibleCounts, [HeirRole::UTERINE_BROTHER, HeirRole::UTERINE_SISTER]);
    if ($uterineCount === 0) {
        $uterineCount = ($inputCounts[HeirRole::UTERINE_BROTHER] ?? 0)
            + ($inputCounts[HeirRole::UTERINE_SISTER] ?? 0);
    }

    $uterinesOk = true;
    if (!$hasDescendants && !$hasAscendants && $uterineCount > 0) {
        $share = assertionShareSum($finalGroups, [
            HeirRole::UTERINE_BROTHER,
            HeirRole::UTERINE_SISTER,
            'uterine_siblings',
        ]);

        if ($uterineCount === 1) {
            $uterinesOk = $share->compareTo(Fraction::fromString('1/6')) >= 0;
        } else {
            $uterinesOk = $share->compareTo(Fraction::fromString('1/3')) >= 0;
        }
    }

    return [
        'sum_ok' => $sumOk,
        'residual_policy' => [
            'sum_vs_policy' => $sumVsPolicy,
            'spouse_gap_requires_bayt' => $spouseGapRequiresBayt,
        ],
        'radd_gated' => $raddGated,
        'shares_bounds' => [
            'groups_non_negative' => $groupsNonNegative,
            'groups_at_most_one' => $groupsAtMostOne,
            'individuals_non_negative' => $individualNonNegative,
            'individuals_at_most_one' => $individualAtMostOne,
            'collective_matches_individuals' => $collectiveMatchesIndividuals,
        ],
        'blocks' => [
            'father_blocks_pgf' => $fatherBlocksPgf,
            'pgf_blocks_siblings' => $pgfBlocksSiblings,
            'son_blocks_siblings' => $sonBlocksSiblings,
            'male_desc_blocks_uncle' => $maleDescBlocksUncle,
            'mother_blocks_grandmothers' => $motherBlocksGrandmothers,
        ],
        'uterines_ok' => $uterinesOk,
    ];
}

/**
 * @param array<string, Fraction> $finalGroups
 * @param string[]                $roles
 */
function assertionShareSum(array $finalGroups, array $roles): Fraction
{
    $targets = [];
    foreach ($roles as $role) {
        $targets[] = RoleNamer::baseRoleKey($role);
    }
    $targets = array_values(array_unique($targets));

    $sum = Fraction::zero();
    foreach ($finalGroups as $role => $share) {
        if (!$share instanceof Fraction) {
            continue;
        }

        $base = RoleNamer::baseRoleKey($role);
        if (in_array($base, $targets, true)) {
            $sum = $sum->add($share);
        }
    }

    return $sum;
}

/**
 * @param array<string, Fraction> $finalGroups
 * @param string[]                $roles
 */
function assertionSharesZero(array $finalGroups, array $roles): bool
{
    return assertionShareSum($finalGroups, $roles)->isZero();
}

/**
 * @param array<string, int> $counts
 * @param string[]           $roles
 */
function assertionCount(array $counts, array $roles): int
{
    $total = 0;
    foreach ($roles as $role) {
        $total += (int) ($counts[$role] ?? 0);
    }

    return $total;
}

/**
 * @return string[]
 */
function collectAssertionFailures(array $assertions, string $prefix = ''): array
{
    $failures = [];
    foreach ($assertions as $key => $value) {
        $path = $prefix === '' ? (string) $key : $prefix . '.' . $key;
        if (is_array($value)) {
            $failures = array_merge($failures, collectAssertionFailures($value, $path));
            continue;
        }

        if ($value === false) {
            $failures[] = $path;
        }
    }

    return $failures;
}
