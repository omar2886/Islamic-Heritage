<?php

require_once __DIR__ . '/../app/Domain/Normalization/Heir.php';
require_once __DIR__ . '/../app/Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../app/Domain/Normalization/Sex.php';
require_once __DIR__ . '/../app/Domain/Normalization/LineageSide.php';
require_once __DIR__ . '/../app/Domain/Normalization/ContextFlags.php';
require_once __DIR__ . '/../app/Domain/Normalization/NormalizationResult.php';
require_once __DIR__ . '/../app/Domain/Math/Fraction.php';
require_once __DIR__ . '/../app/Services/DescendantsAggregator.php';

use App\Domain\Math\Fraction;
use App\Domain\Normalization\LineageSide;
use App\Domain\Normalization\Sex;
use App\Services\DescendantsAggregator;

final class AssertionFailed extends RuntimeException
{
}

final class FractionAssertions
{
    public static function assertFractionEq(string $label, Fraction $expected, Fraction $actual): void
    {
        if (!$expected->equals($actual)) {
            throw new AssertionFailed(sprintf(
                '%s: expected %s, got %s',
                $label,
                self::formatFraction($expected),
                self::formatFraction($actual)
            ));
        }
    }

    /**
     * @param Fraction[] $expected
     * @param Fraction[] $actual
     */
    public static function assertFractionListEq(string $label, array $expected, array $actual): void
    {
        if (count($expected) !== count($actual)) {
            throw new AssertionFailed(sprintf(
                '%s: expected %d items, got %d',
                $label,
                count($expected),
                count($actual)
            ));
        }

        foreach ($expected as $idx => $fraction) {
            $candidate = $actual[$idx];
            self::assertFractionEq(sprintf('%s[%d]', $label, $idx), $fraction, $candidate);
        }
    }

    /**
     * @param array<string,Fraction> $expected
     * @param array<string,Fraction> $actual
     */
    public static function assertFractionMapEq(array $expected, array $actual, string $scope): void
    {
        ksort($expected);
        ksort($actual);

        if (array_keys($expected) !== array_keys($actual)) {
            throw new AssertionFailed(sprintf(
                '%s: expected keys [%s], got [%s]',
                $scope,
                implode(', ', array_keys($expected)),
                implode(', ', array_keys($actual))
            ));
        }

        foreach ($expected as $key => $fraction) {
            self::assertFractionEq(sprintf('%s.%s', $scope, $key), $fraction, $actual[$key]);
        }
    }

    public static function assertTrue(bool $condition, string $message): void
    {
        if (!$condition) {
            throw new AssertionFailed($message);
        }
    }

    private static function formatFraction(Fraction $fraction): string
    {
        return $fraction->asString();
    }
}

final class FixtureCase
{
    private string $caseId;

    /** @var array<int,array<string,mixed>> */
    private array $heirSpecs;

    /** @var array<string,mixed> */
    private array $ctxHints;

    /** @var array<string,Fraction> */
    private array $expectedGroupShares;

    /** @var array<string,Fraction[]> */
    private array $expectedIndividualShares;

    /** @var array<string,bool> */
    private array $expectedInvariants;

    /** @var array<int,array<string,string>> */
    private array $fractionTests;


    private static ?DescendantsAggregator $descAggr = null;

    /** @var array<string,mixed> */
    private array $rulebookOverrides;


    /**
     * @param array<int,array<string,mixed>> $heirSpecs
     * @param array<string,Fraction> $expectedGroupShares
     * @param array<string,Fraction[]> $expectedIndividualShares
     * @param array<string,bool> $expectedInvariants
     */
    private function __construct(
        string $caseId,
        array $heirSpecs,
        array $ctxHints,
        array $expectedGroupShares,
        array $expectedIndividualShares,
        array $expectedInvariants,
        array $fractionTests,
        array $rulebookOverrides
    ) {
        $this->caseId = $caseId;
        $this->heirSpecs = $heirSpecs;
        $this->ctxHints = $ctxHints;
        $this->expectedGroupShares = $expectedGroupShares;
        $this->expectedIndividualShares = $expectedIndividualShares;
        $this->expectedInvariants = $expectedInvariants;
        $this->fractionTests = $fractionTests;
        $this->rulebookOverrides = $rulebookOverrides;
    }

    /**
     * @param array<string,mixed> $data
     */
    public static function fromArray(array $data): self
    {
        if (!isset($data['case_id'])) {
            throw new InvalidArgumentException('Fixture must contain "case_id".');
        }
        if (!isset($data['input']['heirs']) || !is_array($data['input']['heirs'])) {
            throw new InvalidArgumentException('Fixture must define input.heirs.');
        }

        $caseId = (string) $data['case_id'];
        $heirSpecs = array_map(static function ($spec) use ($caseId) {
            if (!is_array($spec)) {
                throw new InvalidArgumentException(sprintf('Heir specification in %s must be an object.', $caseId));
            }
            if (!isset($spec['role'])) {
                throw new InvalidArgumentException(sprintf('Heir specification in %s missing "role".', $caseId));
            }
            if (!isset($spec['count'])) {
                throw new InvalidArgumentException(sprintf('Heir specification in %s missing "count".', $caseId));
            }

            $spec['role'] = self::canonicalizeRole((string) $spec['role']);
            $spec['count'] = (int) $spec['count'];

            return $spec;
        }, $data['input']['heirs']);

        $ctxHints = [];
        if (isset($data['input']['ctxHints']) && is_array($data['input']['ctxHints'])) {
            $ctxHints = $data['input']['ctxHints'];
        }

        $expectedShares = $data['expected']['shares'] ?? [];
        if (!is_array($expectedShares)) {
            throw new InvalidArgumentException(sprintf('Expected shares for %s must be an object.', $caseId));
        }

        $expectedGroupShares = [];
        $expectedIndividualShares = [];
        foreach ($expectedShares as $role => $payload) {
            if (is_string($payload)) {
                $expectedGroupShares[$role] = self::fraction($payload);
                continue;
            }

            if (is_array($payload) && self::isList($payload)) {
                $expectedIndividualShares[$role] = self::fractionList($payload);
                continue;
            }

            if (is_array($payload)) {
                if (isset($payload['group'])) {
                    $expectedGroupShares[$role] = self::fraction((string) $payload['group']);
                }
                if (isset($payload['individuals']) && is_array($payload['individuals'])) {
                    $expectedIndividualShares[$role] = self::fractionList($payload['individuals']);
                }
                continue;
            }

            throw new InvalidArgumentException(sprintf('Unsupported expected share format for role "%s" in %s.', $role, $caseId));
        }

        $expectedInvariants = [];
        if (isset($data['expected']['invariants']) && is_array($data['expected']['invariants'])) {
            foreach ($data['expected']['invariants'] as $key => $value) {
                $expectedInvariants[(string) $key] = (bool) $value;
            }
        }

        $fractionTests = [];
        if (isset($data['expected']['fraction_tests']) && is_array($data['expected']['fraction_tests'])) {
            foreach ($data['expected']['fraction_tests'] as $idx => $testSpec) {
                if (!is_array($testSpec)) {
                    throw new InvalidArgumentException(sprintf('fraction_tests[%d] must be an object in %s.', $idx, $caseId));
                }

                if (!isset($testSpec['op'])) {
                    throw new InvalidArgumentException(sprintf('fraction_tests[%d] must define "op" in %s.', $idx, $caseId));
                }

                if (!isset($testSpec['a'])) {
                    throw new InvalidArgumentException(sprintf('fraction_tests[%d] must define "a" in %s.', $idx, $caseId));
                }

                $entry = [
                    'op' => (string) $testSpec['op'],
                    'a' => (string) $testSpec['a'],
                ];

                if (isset($testSpec['b'])) {
                    $entry['b'] = (string) $testSpec['b'];
                }

                if (isset($testSpec['result'])) {
                    $entry['result'] = (string) $testSpec['result'];
                }

                $fractionTests[] = $entry;
            }
        }

        $rulebookOverrides = [];
        if (isset($data['input']['rulebook_flags']) && is_array($data['input']['rulebook_flags'])) {
            foreach ($data['input']['rulebook_flags'] as $flag => $value) {
                if (!is_string($flag) || trim($flag) === '') {
                    throw new InvalidArgumentException(sprintf('Rulebook flag keys must be non-empty strings in %s.', $caseId));
                }

                if (!is_scalar($value) && $value !== null) {
                    throw new InvalidArgumentException(sprintf(
                        'Rulebook flag "%s" in %s must be a scalar or null value.',
                        $flag,
                        $caseId
                    ));
                }

                $rulebookOverrides[$flag] = $value;
            }
        }

        return new self(
            $caseId,
            $heirSpecs,
            $ctxHints,
            $expectedGroupShares,
            $expectedIndividualShares,
            $expectedInvariants,
            $fractionTests,
            $rulebookOverrides
        );
    }

    public function getCaseId(): string
    {
        return $this->caseId;
    }

    public function getExpectedGroupShares(): array
    {
        return $this->expectedGroupShares;
    }

    public function getExpectedIndividualShares(): array
    {
        return $this->expectedIndividualShares;
    }

    public function shouldCheckInvariant(string $key): bool
    {
        if (!array_key_exists($key, $this->expectedInvariants)) {
            return false;
        }

        return $this->expectedInvariants[$key];
    }

    /**
     * @return array<int,array<string,string>>
     */
    public function getFractionTests(): array
    {
        return $this->fractionTests;
    }

    /**
     * @return array<string,mixed>
     */
    public function getRulebookOverrides(): array
    {
        return $this->rulebookOverrides;
    }

    public function toNormalizationResult(): NormalizationResult
    {
        $heirs = [];
        foreach ($this->heirSpecs as $spec) {
            $count = (int) $spec['count'];
            if ($count <= 0) {
                continue;
            }

            $role = (string) $spec['role'];
            $defaults = self::defaultsForRole($role);

            $sex = (string) ($spec['sex'] ?? $defaults['sex']);
            $alive = array_key_exists('alive', $spec) ? (bool) $spec['alive'] : true;
            $degree = (int) ($spec['degree'] ?? $defaults['degree']);
            $side = (string) ($spec['side'] ?? $defaults['side']);

            $heirs[] = new Heir($role, $sex, $count, $alive, $degree, $side);
        }

        $context = $this->buildContext($heirs, $this->ctxHints);

    return new NormalizationResult($heirs, $context, []);
}

    /**
     * @param Heir[] $heirs
     * @param array<string,mixed> $overrides
     */
    private function buildContext(array $heirs, array $overrides): ContextFlags
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

            $descendant = self::descendants()->describe($role);
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

    /**
     * @return array<string,mixed>
     */
    private static function defaultsForRole(string $role): array
    {
        $descendant = self::descendants()->describe($role);
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

    private static function fraction(string $value): Fraction
    {
        return Fraction::fromString($value);
    }

    /**
     * @param array<int,string> $values
     * @return Fraction[]
     */
    private static function fractionList(array $values): array
    {
        return array_map(static fn (string $value): Fraction => self::fraction($value), $values);
    }

    private static function descendants(): DescendantsAggregator
    {
        if (self::$descAggr === null) {
            self::$descAggr = new DescendantsAggregator();
        }

        return self::$descAggr;
    }

    /**
     * @param array<mixed> $value
     */
    private static function isList(array $value): bool
    {
        if ($value === []) {
            return true;
        }

        return array_keys($value) === range(0, count($value) - 1);
    }

    private static function canonicalizeRole(string $role): string
    {
        $normalized = strtolower(trim($role));
        $normalized = str_replace(['-', ' '], '_', $normalized);

        return match ($normalized) {
            'esposas', 'esposa', 'wife', 'wives' => HeirRole::WIFE,
            'esposo' => HeirRole::HUSBAND,
            'hijas', 'hija' => HeirRole::DAUGHTER,
            'hijos', 'hijo' => HeirRole::SON,
            'madre' => HeirRole::MOTHER,
            'padre' => HeirRole::FATHER,
            'abuela_materna' => HeirRole::MATERNAL_GRANDMOTHER,
            'abuela_paterna' => HeirRole::PATERNAL_GRANDMOTHER,
            'abuelo_paterno' => HeirRole::PATERNAL_GRANDFATHER,
            default => $role,
        };
    }
}

final class FixtureLoader
{
    public static function loadFixture(string $path): FixtureCase
    {
        if (!is_file($path)) {
            throw new InvalidArgumentException(sprintf('Fixture file "%s" does not exist.', $path));
        }

        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new RuntimeException(sprintf('Unable to read fixture file "%s".', $path));
        }

        $data = json_decode($contents, true);
        if (!is_array($data)) {
            throw new RuntimeException(sprintf('Fixture "%s" contains invalid JSON.', $path));
        }

        if (isset($data['requires_env']) && is_array($data['requires_env'])) {
            foreach ($data['requires_env'] as $envKey => $expectedValue) {
                $key = (string) $envKey;
                $expected = (string) $expectedValue;
                $actual = getenv($key);
                if ($actual === false && array_key_exists($key, $_ENV)) {
                    $actual = (string) $_ENV[$key];
                }
                if ($actual === false && array_key_exists($key, $_SERVER)) {
                    $actual = (string) $_SERVER[$key];
                }
                if ($actual === false) {
                    $actual = null;
                }

                if ($actual !== $expected) {
                    throw new InvalidArgumentException(sprintf('skip fixture due to env mismatch: %s', basename($path)));
                }
            }

            unset($data['requires_env']);
        }

        return FixtureCase::fromArray($data);
    }

    /**
     * @return FixtureCase[]
     */
    public static function loadAllFixtures(string $dir): array
    {
        $pattern = rtrim($dir, '/\\') . '/*.json';
        $paths = glob($pattern);
        if ($paths === false) {
            throw new RuntimeException(sprintf('Failed to glob fixtures in "%s".', $dir));
        }

        sort($paths);

        $paths = array_values(array_filter(
            $paths,
            static function (string $path): bool {
                return basename($path) !== 'eligibility_cases.json';
            }
        ));

        $fixtures = [];
        foreach ($paths as $path) {
            try {
                $fixtures[] = self::loadFixture($path);
            } catch (InvalidArgumentException $exception) {
                $message = $exception->getMessage();
                if (
                    str_contains($message, 'case_id')
                    || str_contains($message, 'skip fixture due to env mismatch')
                ) {
                    continue;
                }

                throw $exception;
            }
        }

        return $fixtures;
    }
}

