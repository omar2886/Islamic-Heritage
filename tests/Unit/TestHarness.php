<?php

declare(strict_types=1);

require_once __DIR__ . '/../../app/Domain/Math/Fraction.php';
require_once __DIR__ . '/../../app/Domain/Normalization/ContextFlags.php';
require_once __DIR__ . '/../../app/Domain/Normalization/Heir.php';
require_once __DIR__ . '/../../app/Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../../app/Domain/Normalization/LineageSide.php';
require_once __DIR__ . '/../../app/Domain/Normalization/NormalizationResult.php';
require_once __DIR__ . '/../../app/Domain/Normalization/Sex.php';
require_once __DIR__ . '/../../app/Domain/Rules/RuleBookMaliki.php';
require_once __DIR__ . '/../../app/Domain/Shares/AsabaResult.php';
require_once __DIR__ . '/../../app/Domain/Shares/NormalizedShares.php';
require_once __DIR__ . '/../../app/Services/Asaba/AsabaEngine.php';
require_once __DIR__ . '/../../app/Services/DescendantsAggregator.php';
require_once __DIR__ . '/../../app/Services/EligibilityEngine.php';
require_once __DIR__ . '/../../app/Services/FixedShareEngine.php';
require_once __DIR__ . '/../../app/Services/ShareNormalizer.php';

use App\Domain\Math\Fraction;
use App\Domain\Normalization\HeirRole;
use App\Domain\Normalization\LineageSide;
use App\Domain\Normalization\Sex;
use App\Domain\Presentation\RoleNamer;
use App\Domain\Rules\RuleBookMaliki;
use App\Services\Asaba\AsabaEngine;
use App\Services\DescendantsAggregator;
use App\Services\EligibilityEngine;
use App\Services\FixedShareEngine;
use App\Services\ShareNormalizer;

if (!class_exists('App\\Services\\Asaba\\AsabaResult')) {
    class_alias(\AsabaResult::class, 'App\\Services\\Asaba\\AsabaResult');
}
final class TestHarness
{
    private static ?EligibilityEngine $eligibility = null;
    private static ?FixedShareEngine $fixedShares = null;
    private static ?ShareNormalizer $normalizer = null;
    private static ?AsabaEngine $asaba = null;
    private static ?RuleBookMaliki $ruleBook = null;
    private static ?DescendantsAggregator $descAggr = null;


    /**
     * @param array<int,array<string,mixed>> $heirSpecs
     * @param array<string,mixed> $contextOverrides
     */
    public static function calc(array $heirSpecs, array $contextOverrides = []): TestCalculation
    {
        $heirs = [];
        foreach ($heirSpecs as $spec) {
            if (!is_array($spec)) {
                continue;
            }

            $role = self::canonicalizeRole((string) ($spec['role'] ?? ''));
            $count = (int) ($spec['count'] ?? 0);
            if ($count <= 0 || $role === '') {
                continue;
            }

            $defaults = self::defaultsForRole($role);
            $sex = (string) ($spec['sex'] ?? $defaults['sex']);
            $alive = array_key_exists('alive', $spec) ? (bool) $spec['alive'] : true;
            $degree = (int) ($spec['degree'] ?? $defaults['degree']);
            $side = (string) ($spec['side'] ?? $defaults['side']);

            $heirs[] = new Heir($role, $sex, $count, $alive, $degree, $side);
        }

        $context = self::buildContext($heirs, $contextOverrides);
        $normalization = new NormalizationResult($heirs, $context, []);

        return new TestCalculation(
            self::eligibilityEngine(),
            self::fixedShareEngine(),
            self::shareNormalizer(),
            self::asabaEngine(),
            self::ruleBook(),
            $normalization
        );
    }

    private static function eligibilityEngine(): EligibilityEngine
    {
        return self::$eligibility ??= new EligibilityEngine(self::descendants());
    }

    private static function fixedShareEngine(): FixedShareEngine
    {
        return self::$fixedShares ??= new FixedShareEngine(self::descendants());
    }

    private static function shareNormalizer(): ShareNormalizer
    {
        return self::$normalizer ??= new ShareNormalizer(self::descendants());
    }

    private static function asabaEngine(): AsabaEngine
    {
        return self::$asaba ??= new AsabaEngine();
    }

    private static function ruleBook(): RuleBookMaliki
    {
        return self::$ruleBook ??= new RuleBookMaliki();
    }

    private static function descendants(): DescendantsAggregator
    {
        return self::$descAggr ??= new DescendantsAggregator();
    }

    /**
     * @param Heir[] $heirs
     * @param array<string,mixed> $overrides
     */
    private static function buildContext(array $heirs, array $overrides): ContextFlags
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

        return match ($role) {
            HeirRole::HUSBAND => ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::NONE->value],
            HeirRole::WIFE => ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::NONE->value],
            HeirRole::SON => ['sex' => Sex::MALE->value, 'degree' => 1, 'side' => LineageSide::NONE->value],
            HeirRole::DAUGHTER => ['sex' => Sex::FEMALE->value, 'degree' => 1, 'side' => LineageSide::NONE->value],
            HeirRole::SONS_SON => ['sex' => Sex::MALE->value, 'degree' => 2, 'side' => LineageSide::NONE->value],
            HeirRole::SONS_DAUGHTER => ['sex' => Sex::FEMALE->value, 'degree' => 2, 'side' => LineageSide::NONE->value],
            HeirRole::FATHER => ['sex' => Sex::MALE->value, 'degree' => -1, 'side' => LineageSide::PATERNAL->value],
            HeirRole::MOTHER => ['sex' => Sex::FEMALE->value, 'degree' => -1, 'side' => LineageSide::MATERNAL->value],
            HeirRole::PATERNAL_GRANDFATHER => ['sex' => Sex::MALE->value, 'degree' => -2, 'side' => LineageSide::PATERNAL->value],
            HeirRole::PATERNAL_GRANDMOTHER => ['sex' => Sex::FEMALE->value, 'degree' => -2, 'side' => LineageSide::PATERNAL->value],
            HeirRole::MATERNAL_GRANDMOTHER => ['sex' => Sex::FEMALE->value, 'degree' => -2, 'side' => LineageSide::MATERNAL->value],
            HeirRole::FULL_BROTHER => ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value],
            HeirRole::FULL_SISTER => ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value],
            HeirRole::CONSANGUINE_BROTHER => ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value],
            HeirRole::CONSANGUINE_SISTER => ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value],
            HeirRole::PATERNAL_UNCLE => ['sex' => Sex::MALE->value, 'degree' => -1, 'side' => LineageSide::PATERNAL->value],
            HeirRole::PATERNAL_UNCLES_DAUGHTER => ['sex' => Sex::FEMALE->value, 'degree' => -1, 'side' => LineageSide::PATERNAL->value],
            HeirRole::CONSANGUINE_PATERNAL_UNCLE => ['sex' => Sex::MALE->value, 'degree' => -1, 'side' => LineageSide::PATERNAL->value],
            HeirRole::CONSANGUINE_PATERNAL_UNCLES_DAUGHTER => ['sex' => Sex::FEMALE->value, 'degree' => -1, 'side' => LineageSide::PATERNAL->value],
            HeirRole::PATERNAL_UNCLE_SON => ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value],
            HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER => ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value],
            HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON => ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value],
            HeirRole::CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER => ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::PATERNAL->value],
            HeirRole::UTERINE_BROTHER => ['sex' => Sex::MALE->value, 'degree' => 0, 'side' => LineageSide::MATERNAL->value],
            HeirRole::UTERINE_SISTER => ['sex' => Sex::FEMALE->value, 'degree' => 0, 'side' => LineageSide::MATERNAL->value],
            default => ['sex' => Sex::UNKNOWN->value, 'degree' => 0, 'side' => LineageSide::NONE->value],
        };
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

final class TestCalculation
{
    /**
     * @var array<string,string>
     */
    private static array $compatRoleAliases = [
        'husbands' => HeirRole::HUSBAND,
        'wives' => HeirRole::WIFE,
        'fathers' => HeirRole::FATHER,
        'mothers' => HeirRole::MOTHER,
        'sons' => HeirRole::SON,
        'daughters' => HeirRole::DAUGHTER,
        'sons_sons' => HeirRole::SONS_SON,
        'sons_sons_sons' => 'sons_sons_son',
        'sons_sons_sons_sons' => 'sons_sons_sons_son',
        'sons_sons_sons_sons_sons' => 'sons_sons_sons_sons_son',
        'sons_daughters' => HeirRole::SONS_DAUGHTER,
        'sons_sons_daughters' => 'sons_sons_daughter',
        'sons_sons_sons_daughters' => 'sons_sons_sons_daughter',
        'sons_sons_sons_sons_daughters' => 'sons_sons_sons_sons_daughter',
        'sons_sons_sons_sons_sons_daughters' => 'sons_sons_sons_sons_sons_daughter',
        'uterine_brothers' => HeirRole::UTERINE_BROTHER,
        'uterine_sisters' => HeirRole::UTERINE_SISTER,
        'full_brothers' => HeirRole::FULL_BROTHER,
        'full_sisters' => HeirRole::FULL_SISTER,
        'consanguine_brothers' => HeirRole::CONSANGUINE_BROTHER,
        'consanguine_sisters' => HeirRole::CONSANGUINE_SISTER,
        'paternal_uncles' => HeirRole::PATERNAL_UNCLE,
        'paternal_uncles_daughters' => HeirRole::PATERNAL_UNCLES_DAUGHTER,
        'paternal_uncles_sons' => HeirRole::PATERNAL_UNCLE_SON,
        'paternal_uncles_sons_daughters' => HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER,
        'consanguine_paternal_uncles' => HeirRole::CONSANGUINE_PATERNAL_UNCLE,
        'consanguine_paternal_uncles_daughters' => HeirRole::CONSANGUINE_PATERNAL_UNCLES_DAUGHTER,
        'consanguine_paternal_uncles_sons' => HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON,
        'consanguine_paternal_uncles_sons_daughters' => HeirRole::CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER,
        'paternal_grandfathers' => HeirRole::PATERNAL_GRANDFATHER,
        'paternal_grandmothers' => HeirRole::PATERNAL_GRANDMOTHER,
        'maternal_grandmothers' => HeirRole::MATERNAL_GRANDMOTHER,
        'paternal_great_grandmothers' => HeirRole::PATERNAL_GREAT_GRANDMOTHER,
        'maternal_great_grandmothers' => HeirRole::MATERNAL_GREAT_GRANDMOTHER,
        'unknowns' => HeirRole::UNKNOWN,
        'uterine_siblings' => 'uterine_siblings',
    ];

    public function __construct(
        private readonly EligibilityEngine $eligibility,
        private readonly FixedShareEngine $fixedShares,
        private readonly ShareNormalizer $normalizer,
        private readonly AsabaEngine $asaba,
        private readonly RuleBookMaliki $ruleBook,
        private readonly NormalizationResult $normalization
    ) {
    }

    /**
     * @return array{group_shares:array<string,string>,individual_shares:array<string,string[]>}
     */
    public function run(): array
    {
        $eligibility = $this->eligibility->determineEligibility($this->normalization, $this->ruleBook);
        $fixed = $this->fixedShares->computeFixedShares($eligibility, $this->ruleBook);
        $serviceFixed = new \App\Services\FixedShareResult(
            $fixed->getGroupShares(),
            $fixed->getIndividualShares()
        );

        $normalizedLegacy = $this->normalizer->normalize($serviceFixed, $eligibility, false);
        $normalizedShares = \NormalizedShares::create(
            $normalizedLegacy->getNormalizedGroupShares(),
            $normalizedLegacy->getNormalizedIndividualShares(),
            $normalizedLegacy->getSumFixedNormalized()
        );

        $asabaResult = \AsabaResult::empty();
        $residualForAsaba = $normalizedLegacy->getResidualForAsaba();
        if ($residualForAsaba->compareTo(Fraction::zero()) > 0) {
            $asabaResult = $this->asaba->computeResidual($normalizedShares, $eligibility, $this->ruleBook);

            if (!$asabaResult->hasAsabah()) {
                $normalizedLegacy = $this->normalizer->normalize($serviceFixed, $eligibility, true);
                $normalizedShares = \NormalizedShares::create(
                    $normalizedLegacy->getNormalizedGroupShares(),
                    $normalizedLegacy->getNormalizedIndividualShares(),
                    $normalizedLegacy->getSumFixedNormalized()
                );
                $asabaResult = \AsabaResult::empty();
            }
        }
        [$finalGroups, $finalIndividuals] = $this->aggregateFinalShares($normalizedShares, $asabaResult, $eligibility);

        return [
            'group_shares' => $this->formatGroupShares($finalGroups),
            'individual_shares' => $this->formatIndividualShares($finalIndividuals),
        ];
    }

    /**
     * @param array<string,Fraction> $shares
     * @return array<string,string>
     */
    private function formatGroupShares(array $shares): array
    {
        $formatted = [];
        foreach ($shares as $role => $fraction) {
            $formatted[$role] = $fraction->reduce()->asString();
        }

        foreach (self::$compatRoleAliases as $source => $alias) {
            if (isset($formatted[$source]) && !isset($formatted[$alias])) {
                $formatted[$alias] = $formatted[$source];
            }
        }

        ksort($formatted);

        return $formatted;
    }

    /**
     * @param array<string,Fraction[]> $shares
     * @return array<string,string[]>
     */
    private function formatIndividualShares(array $shares): array
    {
        $formatted = [];
        foreach ($shares as $role => $fractions) {
            $formatted[$role] = array_map(
                static fn (Fraction $fraction): string => $fraction->reduce()->asString(),
                $fractions
            );
        }

        foreach (self::$compatRoleAliases as $source => $alias) {
            if (isset($formatted[$source]) && !isset($formatted[$alias])) {
                $formatted[$alias] = $formatted[$source];
            }
        }

        ksort($formatted);

        return $formatted;
    }

    /**
     * @param array<string,Fraction> $normalizedGroups
     * @param array<string,Fraction[]> $normalizedIndividuals
     * @return array{0:array<string,Fraction>,1:array<string,Fraction[]>}
     */
    private function aggregateFinalShares(\NormalizedShares $normalizedShares, \AsabaResult $asabaResult, \App\Domain\Eligibility\EligibilityResult $eligibility): array
    {
        $normalizedGroups = $normalizedShares->getGroupShares();
        $normalizedIndividuals = $normalizedShares->getIndividualShares();
        $asabaGroups = $asabaResult->getGroupShares();
        $asabaIndividuals = $asabaResult->getIndividualShares();

        $finalGroups = [];
        $finalIndividuals = [];

        $countsByRole = $this->collectEligibleCounts($eligibility);

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
                $finalIndividuals[$key] = $this->mergeIndividualShares($finalIndividuals[$key] ?? [], $normalizedIndividuals[$role]);
            }
            if (isset($asabaIndividuals[$role])) {
                $finalIndividuals[$key] = $this->mergeIndividualShares($finalIndividuals[$key] ?? [], $asabaIndividuals[$role]);
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

    /**
     * @return array<string,int>
     */
    private function collectEligibleCounts(\App\Domain\Eligibility\EligibilityResult $eligibility): array
    {
        $counts = [];
        foreach ($eligibility->getEligibleHeirs() as $heir) {
            $role = $heir->getRole();
            $counts[$role] = ($counts[$role] ?? 0) + $heir->getCount();
        }

        return $counts;
    }

    /**
     * @param Fraction[] $current
     * @param Fraction[] $additional
     * @return Fraction[]
     */
    private function mergeIndividualShares(array $current, array $additional): array
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

}
