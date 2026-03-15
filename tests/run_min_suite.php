<?php
declare(strict_types=1);

use App\Domain\Math\Fraction;

require_once __DIR__ . '/../scripts/calc_lib.php';

class_exists(\App\Scripts\CalcRunner::class);

$groupShareFallbacks = [
    'sons' => ['son'],
    'son' => ['sons'],
    'daughters' => ['daughter'],
    'daughter' => ['daughters'],
    'wives' => ['wife'],
    'wife' => ['wives'],
    'husband' => ['husbands'],
    'husbands' => ['husband'],
    'full_brothers' => ['full_brother'],
    'full_brother' => ['full_brothers'],
    'full_sisters' => ['full_sister'],
    'full_sister' => ['full_sisters'],
    'consanguine_brothers' => ['consanguine_brother'],
    'consanguine_brother' => ['consanguine_brothers'],
    'consanguine_sisters' => ['consanguine_sister'],
    'consanguine_sister' => ['consanguine_sisters'],
    'uterine_brothers' => ['uterine_brother'],
    'uterine_brother' => ['uterine_brothers', 'uterine_siblings'],
    'uterine_sisters' => ['uterine_sister'],
    'uterine_sister' => ['uterine_sisters', 'uterine_siblings'],
    'uterine_siblings' => ['uterine_brothers', 'uterine_sisters', 'uterine_brother', 'uterine_sister'],
    'sons_daughters' => ['sons_daughter'],
    'sons_daughter' => ['sons_daughters'],
    'sons_sons' => ['sons_son'],
    'sons_son' => ['sons_sons'],
];

/**
 * @param array<string,string> $groupShares
 */
function findGroupShare(array $groupShares, string $role, array $fallbacks): ?string
{
    if (array_key_exists($role, $groupShares)) {
        $value = $groupShares[$role];
        return is_string($value) ? $value : null;
    }

    foreach ($fallbacks[$role] ?? [] as $candidate) {
        if (array_key_exists($candidate, $groupShares)) {
            $value = $groupShares[$candidate];
            return is_string($value) ? $value : null;
        }
    }

    return null;
}

function shareStringForRole(array $groupShares, string $role, array $fallbacks): ?string
{
    $share = findGroupShare($groupShares, $role, $fallbacks);
    if ($share !== null) {
        return $share;
    }

    return null;
}

function parseFractionOrNull($value): ?Fraction
{
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    if ($trimmed === '') {
        return null;
    }

    try {
        return Fraction::fromString($trimmed);
    } catch (Throwable $throwable) {
        return null;
    }
}

/**
 * @return array<string, bool>
 */
function flattenAssertions(array $assertions, string $prefix = ''): array
{
    $results = [];
    foreach ($assertions as $key => $value) {
        $path = $prefix === '' ? (string) $key : $prefix . '.' . $key;
        if (is_array($value)) {
            $results += flattenAssertions($value, $path);
            continue;
        }

        $results[$path] = (bool) $value;
    }

    return $results;
}

/**
 * @return array<string, string|null>
 */
function applyRequiredEnv(?array $requirements): array
{
    if ($requirements === null) {
        return [];
    }

    $previous = [];
    foreach ($requirements as $key => $value) {
        $previous[$key] = getenv($key) === false ? null : getenv($key);
        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
    }

    return $previous;
}

function restoreEnv(array $snapshot): void
{
    foreach ($snapshot as $key => $value) {
        if ($value === null) {
            putenv($key);
            unset($_ENV[$key], $_SERVER[$key]);
            continue;
        }

        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
    }
}

function ensureStrictFlag(array $input): array
{
    $flags = [];
    if (isset($input['cli_flags'])) {
        if (is_array($input['cli_flags'])) {
            foreach ($input['cli_flags'] as $flag) {
                if (is_scalar($flag)) {
                    $flags[] = (string) $flag;
                }
            }
        }
    }

    $flags[] = '--strict';
    $input['cli_flags'] = array_values(array_unique($flags));

    return $input;
}

$fixturePaths = glob(__DIR__ . '/fixtures/*.json');
if ($fixturePaths === false) {
    fwrite(STDERR, "Unable to glob fixtures" . PHP_EOL);
    exit(1);
}
sort($fixturePaths);

$failed = [];

foreach ($fixturePaths as $path) {
    $json = file_get_contents($path);
    if (!is_string($json)) {
        $failed[] = sprintf('%s: unable to read file', $path);
        continue;
    }

    $data = json_decode($json, true);
    if (!is_array($data)) {
        continue;
    }

    $hasExpectedCli = isset($data['expected_cli']) && is_array($data['expected_cli']);
    $hasExpect = isset($data['expect']) && is_array($data['expect']);
    if (!$hasExpectedCli && !$hasExpect) {
        continue;
    }

    $caseId = (string) ($data['case_id'] ?? basename($path));
    $input = $data['input'] ?? [];
    if (!is_array($input)) {
        $input = [];
    }

    $expectedCli = $hasExpectedCli ? $data['expected_cli'] : null;
    $expectsStrictErrors = $expectedCli !== null
        && isset($expectedCli['strict_errors'])
        && is_array($expectedCli['strict_errors'])
        && $expectedCli['strict_errors'] !== [];

    $envSnapshot = applyRequiredEnv(isset($data['requires_env']) && is_array($data['requires_env']) ? $data['requires_env'] : null);

    $input = ensureStrictFlag($input);

    try {
        $output = calc_from_array($input);
    } catch (Throwable $throwable) {
        restoreEnv($envSnapshot);
        $failed[] = sprintf('%s: engine threw %s: %s', $caseId, get_class($throwable), $throwable->getMessage());
        continue;
    }

    restoreEnv($envSnapshot);

    $lastExitCode = \App\Scripts\CalcRunner::getLastExitCode();

    $warnings = isset($output['warnings']) && is_array($output['warnings']) ? $output['warnings'] : [];
    $errors = isset($output['errors']) && is_array($output['errors']) ? $output['errors'] : [];
    $groupShares = isset($output['group_shares']) && is_array($output['group_shares']) ? $output['group_shares'] : [];

    $caseFailures = [];

    $sumFinal = (string) ($output['sum_final'] ?? '0/1');
    $meta = isset($output['meta']) && is_array($output['meta']) ? $output['meta'] : [];
    $residualPolicy = (string) ($meta['residual_policy'] ?? '');
    $baytDue = (string) ($meta['bayt_due'] ?? '');

    if (!$expectsStrictErrors) {
        if ($residualPolicy === '') {
            $caseFailures[] = sprintf('%s: missing meta.residual_policy', $caseId);
        }
        if ($baytDue === '') {
            $caseFailures[] = sprintf('%s: missing meta.bayt_due', $caseId);
        }

        $sumFraction = null;
        try {
            $sumFraction = Fraction::fromString($sumFinal);
        } catch (Throwable $throwable) {
            $caseFailures[] = sprintf('%s: invalid sum_final %s (%s)', $caseId, $sumFinal, $throwable->getMessage());
        }

        if ($sumFraction instanceof Fraction) {
            $sumOk = $sumFraction->equals(Fraction::one());
            if (!$sumOk && $residualPolicy === 'bayt_al_mal') {
                $sumOk = $sumFraction->compareTo(Fraction::one()) < 0;
            }
            if (!$sumOk) {
                $caseFailures[] = sprintf('%s: sum_final/residual_policy mismatch (%s, %s)', $caseId, $sumFinal, $residualPolicy);
            }
        }
    }

    if (!$expectsStrictErrors) {
        if (!isset($meta['assertions']) || !is_array($meta['assertions'])) {
            $caseFailures[] = sprintf('%s: missing meta.assertions', $caseId);
        } else {
            $assertions = flattenAssertions($meta['assertions']);
            foreach ($assertions as $path => $status) {
                if ($status !== true) {
                    $caseFailures[] = sprintf('%s: assertion failed (%s)', $caseId, $path);
                }
            }

            if (isset($meta['assertions_failed']) && is_array($meta['assertions_failed'])) {
                foreach ($meta['assertions_failed'] as $path) {
                    $caseFailures[] = sprintf('%s: meta.assertions_failed contains %s', $caseId, (string) $path);
                }
            }
        }
    }

    $warningsContains = [];
    $strictErrorsExpected = [];
    if ($expectedCli !== null) {
        if (isset($expectedCli['warnings_contains']) && is_array($expectedCli['warnings_contains'])) {
            foreach ($expectedCli['warnings_contains'] as $needle) {
                $warningsContains[] = (string) $needle;
            }
        }

        if (isset($expectedCli['strict_errors']) && is_array($expectedCli['strict_errors'])) {
            foreach ($expectedCli['strict_errors'] as $errorMessage) {
                $strictErrorsExpected[] = (string) $errorMessage;
            }
        }

        $skipCliDetailChecks = false;
        if ($strictErrorsExpected !== []) {
            $strictErrorsSatisfied = true;
            foreach ($strictErrorsExpected as $expectedError) {
                $found = false;
                foreach ($errors as $error) {
                    if (is_string($error) && str_contains($error, $expectedError)) {
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    $caseFailures[] = sprintf('%s: expected strict error "%s"', $caseId, $expectedError);
                    $strictErrorsSatisfied = false;
                }
            }

            if ($strictErrorsSatisfied) {
                $skipCliDetailChecks = true;
            }
        }

        if ($skipCliDetailChecks) {
            if (isset($expectedCli['strict_exit_code'])) {
                $expectedExit = (int) $expectedCli['strict_exit_code'];
                if ($lastExitCode !== $expectedExit) {
                    $caseFailures[] = sprintf('%s: expected strict exit code %d, got %d', $caseId, $expectedExit, $lastExitCode);
                }
            }

            // When strict errors are expected we skip further CLI validations.
            goto AFTER_EXPECTED_CLI_CHECKS;
        }

        if (isset($expectedCli['sum_final']) && $expectedCli['sum_final'] !== $sumFinal) {
            $caseFailures[] = sprintf('%s: expected sum_final %s, got %s', $caseId, $expectedCli['sum_final'], $sumFinal);
        }

        if (isset($expectedCli['residual_before_asaba'])) {
            $actual = (string) ($output['residual_before_asaba'] ?? '');
            if ($actual !== $expectedCli['residual_before_asaba']) {
                $caseFailures[] = sprintf('%s: expected residual_before_asaba %s, got %s', $caseId, $expectedCli['residual_before_asaba'], $actual);
            }
        }

        if (isset($expectedCli['residual_consumed'])) {
            $actual = (string) ($output['residual_consumed'] ?? '');
            if ($actual !== $expectedCli['residual_consumed']) {
                $caseFailures[] = sprintf('%s: expected residual_consumed %s, got %s', $caseId, $expectedCli['residual_consumed'], $actual);
            }
        }

        if (isset($expectedCli['group_shares']) && is_array($expectedCli['group_shares'])) {
            foreach ($expectedCli['group_shares'] as $role => $fraction) {
                $actual = findGroupShare($groupShares, (string) $role, $groupShareFallbacks);
                if ($actual === null) {
                    if ($fraction === '0/1') {
                        continue;
                    }
                    $caseFailures[] = sprintf('%s: missing group share for %s (expected %s)', $caseId, $role, $fraction);
                    continue;
                }
                if ($actual !== $fraction) {
                    $caseFailures[] = sprintf('%s: group share mismatch for %s (expected %s, got %s)', $caseId, $role, $fraction, $actual);
                }
            }
        }

        if (isset($expectedCli['meta']) && is_array($expectedCli['meta'])) {
            $expectedMeta = $expectedCli['meta'];
            foreach ($expectedMeta as $key => $value) {
                $actual = $meta[$key] ?? null;
                if ($actual !== $value) {
                    $caseFailures[] = sprintf('%s: expected meta.%s = %s, got %s', $caseId, $key, json_encode($value), json_encode($actual));
                }
            }
        }

        if (isset($expectedCli['strict_exit_code'])) {
            $expectedExit = (int) $expectedCli['strict_exit_code'];
            if ($lastExitCode !== $expectedExit) {
                $caseFailures[] = sprintf('%s: expected strict exit code %d, got %d', $caseId, $expectedExit, $lastExitCode);
            }
        }

        if ($warningsContains !== []) {
            foreach ($warningsContains as $needle) {
                $found = false;
                foreach ($warnings as $warning) {
                    if (is_string($warning) && str_contains($warning, $needle)) {
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    $caseFailures[] = sprintf('%s: expected warning containing "%s"', $caseId, $needle);
                }
            }
        }
    }

AFTER_EXPECTED_CLI_CHECKS:

    $allowUnknownRoles = (bool) ($data['allow_unknown_roles'] ?? false);
    foreach ($warningsContains as $needle) {
        if (str_contains($needle, 'Unknown heir role')) {
            $allowUnknownRoles = true;
            break;
        }
    }
    if (!$allowUnknownRoles) {
        foreach ($warnings as $warning) {
            if (is_string($warning) && str_contains($warning, 'Unknown heir role')) {
                $caseFailures[] = sprintf('%s: unexpected warning "%s"', $caseId, $warning);
            }
        }
    }

    if ($strictErrorsExpected === []) {
        $groupFractions = [];
        foreach ($groupShares as $role => $fractionString) {
            $parsedFraction = parseFractionOrNull($fractionString);
            if ($parsedFraction === null) {
                $caseFailures[] = sprintf('%s: invalid group share for %s (%s)', $caseId, $role, json_encode($fractionString));
                continue;
            }
            $groupFractions[$role] = $parsedFraction;
        }

        $individualSharesStrings = isset($output['individual_shares']) && is_array($output['individual_shares'])
            ? $output['individual_shares']
            : [];

        $individualFractions = [];
        foreach ($individualSharesStrings as $role => $fractions) {
            $individualFractions[$role] = [];
            if (!is_array($fractions)) {
                $caseFailures[] = sprintf('%s: invalid individual shares for %s', $caseId, $role);
                continue;
            }

            foreach ($fractions as $index => $fractionString) {
                $parsedFraction = parseFractionOrNull($fractionString);
                if ($parsedFraction === null) {
                    $caseFailures[] = sprintf('%s: invalid individual share for %s at %d (%s)', $caseId, $role, $index, json_encode($fractionString));
                    continue;
                }

                $individualFractions[$role][$index] = $parsedFraction;
            }
        }

        if ($sumFraction instanceof Fraction) {
            $policyAllowed = in_array($residualPolicy, ['none', 'asaba', 'radd', 'bayt_al_mal'], true);
            if (!$policyAllowed) {
                $caseFailures[] = sprintf('%s: unexpected residual_policy %s', $caseId, json_encode($residualPolicy));
            }

            if ($sumFraction->equals(Fraction::one())) {
                $hasBayt = isset($groupFractions['bayt_al_mal']) && $groupFractions['bayt_al_mal'] instanceof Fraction
                    && $groupFractions['bayt_al_mal']->compareTo(Fraction::zero()) > 0;
                if ($hasBayt) {
                    if ($residualPolicy !== 'bayt_al_mal') {
                        $caseFailures[] = sprintf('%s: residual_policy expected bayt_al_mal when Bayt al-Mal receives share (policy=%s)', $caseId, $residualPolicy);
                    }
                } elseif (!in_array($residualPolicy, ['none', 'asaba', 'radd'], true)) {
                    $caseFailures[] = sprintf('%s: residual_policy mismatch for sum=1 (policy=%s)', $caseId, $residualPolicy);
                }
            } else {
                $spouseExcluded = false;
                if (isset($output['invariants']) && is_array($output['invariants'])) {
                    $spouseExcluded = ($output['invariants']['spouses_radd_exclusion'] ?? false) === true;
                }

                if ($spouseExcluded && $residualPolicy !== 'bayt_al_mal') {
                    $caseFailures[] = sprintf('%s: residual_policy should be bayt_al_mal when sum<1 and spouses excluded (policy=%s)', $caseId, $residualPolicy);
                }
            }
        }

        foreach ($groupFractions as $role => $fraction) {
            if ($fraction->compareTo(Fraction::zero()) < 0) {
                $caseFailures[] = sprintf('%s: group share negative for %s (%s)', $caseId, $role, $fraction->asString());
            }
            if ($fraction->compareTo(Fraction::one()) > 0) {
                $caseFailures[] = sprintf('%s: group share exceeds 1 for %s (%s)', $caseId, $role, $fraction->asString());
            }
        }

        foreach ($individualFractions as $role => $fractions) {
            foreach ($fractions as $index => $fraction) {
                if ($fraction->compareTo(Fraction::zero()) < 0) {
                    $caseFailures[] = sprintf('%s: individual share negative for %s[%d] (%s)', $caseId, $role, $index, $fraction->asString());
                }
                if ($fraction->compareTo(Fraction::one()) > 0) {
                    $caseFailures[] = sprintf('%s: individual share exceeds 1 for %s[%d] (%s)', $caseId, $role, $index, $fraction->asString());
                }
            }

            $groupShareString = shareStringForRole($groupShares, $role, $groupShareFallbacks);
            if ($groupShareString === null) {
                if ($fractions !== []) {
                    $caseFailures[] = sprintf('%s: missing group share for %s with individual shares', $caseId, $role);
                }
                continue;
            }

            $groupFraction = parseFractionOrNull($groupShareString) ?? Fraction::zero();
            $sumIndividuals = Fraction::zero();
            foreach ($fractions as $fraction) {
                $sumIndividuals = $sumIndividuals->add($fraction);
            }

            if ($fractions !== [] && $groupFraction->compareTo($sumIndividuals) !== 0) {
                $caseFailures[] = sprintf('%s: collective share mismatch for %s (group=%s, individuals=%s)', $caseId, $role, $groupFraction->asString(), $sumIndividuals->asString());
            }
        }

        $inputCounts = [];
        if (isset($output['input']['heirs']) && is_array($output['input']['heirs'])) {
            foreach ($output['input']['heirs'] as $heir) {
                if (!is_array($heir)) {
                    continue;
                }

                $role = strtolower((string) ($heir['role'] ?? ''));
                if ($role === '') {
                    continue;
                }

                $inputCounts[$role] = ($inputCounts[$role] ?? 0) + (int) ($heir['count'] ?? 0);
            }
        }

        $fatherCount = ($inputCounts['father'] ?? 0);
        if ($fatherCount > 0) {
            $share = shareStringForRole($groupShares, 'paternal_grandfather', $groupShareFallbacks);
            if ($share !== null) {
                $pgfFraction = parseFractionOrNull($share) ?? Fraction::zero();
                if ($pgfFraction->compareTo(Fraction::zero()) > 0) {
                    $caseFailures[] = sprintf('%s: paternal grandfather received share despite father present (%s)', $caseId, $pgfFraction->asString());
                }
            }
        }

        $sonCount = ($inputCounts['son'] ?? 0);
        if ($sonCount > 0) {
            foreach (['full_brother', 'full_sister', 'consanguine_brother', 'consanguine_sister'] as $siblingRole) {
                $share = shareStringForRole($groupShares, $siblingRole, $groupShareFallbacks);
                if ($share === null) {
                    continue;
                }
                $fraction = parseFractionOrNull($share) ?? Fraction::zero();
                if ($fraction->compareTo(Fraction::zero()) > 0) {
                    $caseFailures[] = sprintf('%s: %s received share despite son present (%s)', $caseId, $siblingRole, $fraction->asString());
                }
            }
        }

        $maleDescendantCount = $sonCount + ($inputCounts['sons_son'] ?? 0);
        if ($maleDescendantCount > 0) {
            foreach (['paternal_uncle', 'consanguine_paternal_uncle'] as $uncleRole) {
                $share = shareStringForRole($groupShares, $uncleRole, $groupShareFallbacks);
                if ($share === null) {
                    continue;
                }
                $fraction = parseFractionOrNull($share) ?? Fraction::zero();
                if ($fraction->compareTo(Fraction::zero()) > 0) {
                    $caseFailures[] = sprintf('%s: %s received share despite male descendant present (%s)', $caseId, $uncleRole, $fraction->asString());
                }
            }
        }

        $motherCount = ($inputCounts['mother'] ?? 0);
        if ($motherCount > 0) {
            foreach (['maternal_grandmother', 'paternal_grandmother'] as $grandmotherRole) {
                $share = shareStringForRole($groupShares, $grandmotherRole, $groupShareFallbacks);
                if ($share === null) {
                    continue;
                }
                $fraction = parseFractionOrNull($share) ?? Fraction::zero();
                if ($fraction->compareTo(Fraction::zero()) > 0) {
                    $caseFailures[] = sprintf('%s: %s received share despite mother present (%s)', $caseId, $grandmotherRole, $fraction->asString());
                }
            }
        }

        $pgfCount = ($inputCounts['paternal_grandfather'] ?? 0);
        if ($pgfCount > 0) {
            foreach (['full_brother', 'full_sister', 'consanguine_brother', 'consanguine_sister'] as $siblingRole) {
                $share = shareStringForRole($groupShares, $siblingRole, $groupShareFallbacks);
                if ($share === null) {
                    continue;
                }
                $fraction = parseFractionOrNull($share) ?? Fraction::zero();
                if ($fraction->compareTo(Fraction::zero()) > 0) {
                    $caseFailures[] = sprintf('%s: %s received share despite paternal grandfather present (%s)', $caseId, $siblingRole, $fraction->asString());
                }
            }
        }

        $wivesTotal = ($inputCounts['wives'] ?? 0) + ($inputCounts['wife'] ?? 0);
        if ($wivesTotal > 4 && $lastExitCode !== 2) {
            $caseFailures[] = sprintf('%s: expected strict exit code 2 for wives cap breach (got %d)', $caseId, $lastExitCode);
        }
    }

    $expect = $hasExpect ? $data['expect'] : null;
    if ($expect !== null) {
        if (isset($expect['sum_final']) && $expect['sum_final'] !== $sumFinal) {
            $caseFailures[] = sprintf('%s: expected sum_final %s, got %s', $caseId, $expect['sum_final'], $sumFinal);
        }

        if (isset($expect['group_shares']) && is_array($expect['group_shares'])) {
            foreach ($expect['group_shares'] as $role => $fraction) {
                $actual = findGroupShare($groupShares, (string) $role, $groupShareFallbacks);
                if ($actual === null) {
                    if ($fraction === '0/1') {
                        continue;
                    }
                    $caseFailures[] = sprintf('%s: missing group share for %s (expected %s)', $caseId, $role, $fraction);
                    continue;
                }
                if ($actual !== $fraction) {
                    $caseFailures[] = sprintf('%s: group share mismatch for %s (expected %s, got %s)', $caseId, $role, $fraction, $actual);
                }
            }
        }

        $warningKeys = ['no_warnings_containing', 'warnings_not_contains'];
        foreach ($warningKeys as $key) {
            if (!isset($expect[$key]) || !is_array($expect[$key])) {
                continue;
            }
            foreach ($expect[$key] as $needle) {
                foreach ($warnings as $warning) {
                    if (is_string($warning) && str_contains($warning, (string) $needle)) {
                        $caseFailures[] = sprintf('%s: warning contains "%s" (%s)', $caseId, $needle, $warning);
                    }
                }
            }
        }
    }

    if ($caseFailures === []) {
        echo '[OK] ' . $caseId . PHP_EOL;
        continue;
    }

    foreach ($caseFailures as $message) {
        $failed[] = $message;
    }
}

if ($failed !== []) {
    foreach ($failed as $message) {
        fwrite(STDERR, $message . PHP_EOL);
    }
    exit(1);
}

echo 'ALL OK' . PHP_EOL;
