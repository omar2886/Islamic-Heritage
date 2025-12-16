<?php

declare(strict_types=1);

use App\Domain\Eligibility\EligibilityResult as DomainEligibilityResult;
use App\Domain\Math\Fraction;
use App\Domain\Normalization\HeirRole;
use App\Domain\Presentation\RoleNamer;
use App\Domain\Rules\RuleBookMaliki;
use App\Services\Asaba\AsabaEngine;
use App\Services\EligibilityEngine;
use App\Services\FixedShareEngine;
use App\Services\NormalizedShares as ServiceNormalizedShares;
use App\Services\ShareNormalizer;

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/../Services/GenealogyBuilder.php';
require_once __DIR__ . '/../Services/HeirsNormalizer.php';
require_once __DIR__ . '/../Services/EligibilityEngine.php';
require_once __DIR__ . '/../Services/FixedShareEngine.php';
require_once __DIR__ . '/../Services/ShareNormalizer.php';
require_once __DIR__ . '/../Services/Asaba/AsabaEngine.php';
require_once __DIR__ . '/../Models/SubstitutionManager.php';
require_once __DIR__ . '/../Models/PersonNode.php';
require_once __DIR__ . '/../Domain/Normalization/ContextFlags.php';
require_once __DIR__ . '/../Domain/Normalization/NormalizationResult.php';
require_once __DIR__ . '/../Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../Domain/Normalization/Heir.php';
require_once __DIR__ . '/../Domain/Eligibility/EligibilityResult.php';
require_once __DIR__ . '/../Domain/Eligibility/EligibilityContext.php';
require_once __DIR__ . '/../Domain/Math/Fraction.php';
require_once __DIR__ . '/../Domain/Rules/RuleBookMaliki.php';
require_once __DIR__ . '/../Domain/Shares/AsabaResult.php';
require_once __DIR__ . '/../Domain/Shares/NormalizedShares.php';
require_once __DIR__ . '/../Domain/Tracing/TraceEvent.php';

final class InheritanceCalculator
{
    private $db;
    private GenealogyBuilder $genealogyBuilder;
    private HeirsNormalizer $heirsNormalizer;
    private EligibilityEngine $eligibilityEngine;
    private FixedShareEngine $fixedShareEngine;
    private ShareNormalizer $shareNormalizer;
    private AsabaEngine $asabaEngine;
    private RuleBookMaliki $ruleBook;
    private ?SubstitutionManager $subManager = null;

    private const TYPE_ID_TO_ROLE = [
        1  => \HeirRole::HUSBAND,
        2  => \HeirRole::WIFE,
        3  => \HeirRole::SON,
        4  => \HeirRole::DAUGHTER,
        5  => \HeirRole::FATHER,
        6  => \HeirRole::MOTHER,
        7  => \HeirRole::PATERNAL_GRANDFATHER,
        8  => \HeirRole::MATERNAL_GRANDMOTHER,
        15 => \HeirRole::PATERNAL_GRANDMOTHER,
        9  => \HeirRole::FULL_BROTHER,
        10 => \HeirRole::FULL_SISTER,
        11 => \HeirRole::CONSANGUINE_BROTHER,
        12 => \HeirRole::CONSANGUINE_SISTER,
        13 => \HeirRole::UTERINE_BROTHER,
        14 => \HeirRole::UTERINE_SISTER,
    ];

    private const NAME_TO_ROLE = [
        'esposo' => \HeirRole::HUSBAND,
        'esposa' => \HeirRole::WIFE,
        'padre' => \HeirRole::FATHER,
        'madre' => \HeirRole::MOTHER,
        'hijo' => \HeirRole::SON,
        'hija' => \HeirRole::DAUGHTER,
        'abuelo paterno' => \HeirRole::PATERNAL_GRANDFATHER,
        'abuela materna' => \HeirRole::MATERNAL_GRANDMOTHER,
        'abuela paterna' => \HeirRole::PATERNAL_GRANDMOTHER,
        'hermano pleno' => \HeirRole::FULL_BROTHER,
        'hermana plena' => \HeirRole::FULL_SISTER,
        'hermano consanguineo' => \HeirRole::CONSANGUINE_BROTHER,
        'hermana consanguinea' => \HeirRole::CONSANGUINE_SISTER,
        'hermano uterino' => \HeirRole::UTERINE_BROTHER,
        'hermana uterina' => \HeirRole::UTERINE_SISTER,
    ];

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->genealogyBuilder = new GenealogyBuilder();
        $this->heirsNormalizer = new HeirsNormalizer();
        $this->eligibilityEngine = new EligibilityEngine();
        $this->fixedShareEngine = new FixedShareEngine();
        $this->shareNormalizer = new ShareNormalizer();
        $this->asabaEngine = new AsabaEngine();
        $this->ruleBook = new RuleBookMaliki();
    }

    public function calculateDistribution(int $caseId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM cases WHERE id = :id');
        $stmt->bindParam(':id', $caseId, PDO::PARAM_INT);
        $stmt->execute();
        $case = $stmt->fetch(PDO::FETCH_OBJ);
        if (!$case) {
            return null;
        }

        $totalEstate = $this->parseEstateValue($case->total_estate);

        $tree = $this->genealogyBuilder->buildGenealogy($caseId);
        if ($tree === []) {
            return [];
        }

        $this->applyUiRepresentation($tree);

        $normalization = $this->heirsNormalizer->normalize($tree);
        $eligibility = $this->eligibilityEngine->determineEligibility($normalization, $this->ruleBook);
        $heirCounts = $this->collectCountsFromEligibility($eligibility);

        if ($heirCounts === []) {
            return [];
        }

        $fixedShares = $this->fixedShareEngine->compute($heirCounts, $eligibility->getContext());
        $normalizedShares = $this->shareNormalizer->normalize($fixedShares, $eligibility, false);

        $domainNormalized = \NormalizedShares::create(
            $normalizedShares->getNormalizedGroupShares(),
            $normalizedShares->getNormalizedIndividualShares(),
            $normalizedShares->getSumFixedNormalized()
        );

        $asabaResult = \AsabaResult::empty();
        $residualForAsaba = $normalizedShares->getResidualForAsaba();
        if ($residualForAsaba->compareTo(Fraction::zero()) > 0) {
            $asabaResult = $this->asabaEngine->computeResidual($domainNormalized, $eligibility, $this->ruleBook);

            if (!$asabaResult->hasAsabah()) {
                $normalizedShares = $this->shareNormalizer->normalize($fixedShares, $eligibility, true);
                $domainNormalized = \NormalizedShares::create(
                    $normalizedShares->getNormalizedGroupShares(),
                    $normalizedShares->getNormalizedIndividualShares(),
                    $normalizedShares->getSumFixedNormalized()
                );
                $asabaResult = \AsabaResult::empty();
            }
        }

        [$finalGroups, $finalIndividuals] = $this->aggregateFinalShares(
            $normalizedShares,
            $asabaResult,
            $eligibility
        );

        return $this->buildUiResult(
            $tree,
            $finalGroups,
            $finalIndividuals,
            $totalEstate
        );
    }

    public function buildNormalizationResult(int $caseId): ?NormalizationResult
    {
        $tree = $this->genealogyBuilder->buildGenealogy($caseId);
        if ($tree === []) {
            return new NormalizationResult(
                [],
                new ContextFlags(false, false, false, false, false, 0, 0, 0),
                []
            );
        }

        $this->applyUiRepresentation($tree);

        return $this->heirsNormalizer->normalize($tree);
    }

    private function applyUiRepresentation(array &$tree): void
    {
        if ($this->shouldApplySubstitution()) {
            $this->getSubstitutionManager()->apply($tree);
        }
    }

    private function shouldApplySubstitution(): bool
    {
        if (defined('FEATURE_SUBSTITUTION')) {
            $value = FEATURE_SUBSTITUTION;
            return $value === true || $value === 'on' || $value === 'legacy';
        }

        if (defined('FEATURE_REPRESENTATION')) {
            $value = FEATURE_REPRESENTATION;
            return $value === true || $value === 'legacy' || $value === 'on';
        }

        return false;
    }

    private function getSubstitutionManager(): SubstitutionManager
    {
        if ($this->subManager === null) {
            $this->subManager = new SubstitutionManager();
        }

        return $this->subManager;
    }

    /**
     * @return array<string,int>
     */
    private function collectCountsFromEligibility(DomainEligibilityResult $eligibility): array
    {
        $counts = [];
        foreach ($eligibility->getEligibleHeirs() as $heir) {
            if (!$heir->isAlive()) {
                continue;
            }

            $count = $heir->getCount();
            if ($count <= 0) {
                continue;
            }

            $counts[$heir->getRole()] = $count;
        }

        ksort($counts);

        return $counts;
    }

    /**
     * @return array{array<string,Fraction>,array<string,Fraction[]>}
     */
    private function aggregateFinalShares(
        ServiceNormalizedShares $normalizedShares,
        \AsabaResult $asabaResult,
        DomainEligibilityResult $eligibility
    ): array {
        $normalizedGroups = $normalizedShares->getNormalizedGroupShares();
        $normalizedIndividuals = $normalizedShares->getNormalizedIndividualShares();
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
            $individualShares = $finalIndividuals[$key] ?? [];

            $sum = Fraction::zero();
            foreach ($individualShares as $fraction) {
                $sum = $sum->add($fraction);
            }

            if ($sum->equals($groupShare) && count($individualShares) === $count) {
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
     * @param Fraction[] $current
     * @param Fraction[] $additional
     *
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

    /**
     * @return array<string,int>
     */
    private function collectEligibleCounts(DomainEligibilityResult $eligibility): array
    {
        $counts = [];
        foreach ($eligibility->getEligibleHeirs() as $heir) {
            $role = $heir->getRole();
            $counts[$role] = ($counts[$role] ?? 0) + $heir->getCount();
        }

        return $counts;
    }

    /**
     * @param PersonNode[] $tree
     * @param array<string,Fraction> $normalizedGroups
     * @param array<string,Fraction> $finalGroups
     * @param array<string,Fraction[]> $finalIndividuals
     *
     * @return array<int,array<string,mixed>>
     */
    private function buildUiResult(
        array $tree,
        array $finalGroups,
        array $finalIndividuals,
        Fraction $totalEstate
    ): array {
        $nodes = $this->flattenTree($tree);
        $result = [];
        $roleIndex = [];

        foreach ($nodes as $node) {
            if (!$this->shouldIncludeNode($node)) {
                continue;
            }

            $role = $this->determineRoleForNode($node);
            if ($role === null) {
                continue;
            }

            $key = $this->resolveOutputKey($role, $finalIndividuals);
            $offset = $roleIndex[$key] ?? 0;
            $roleIndex[$key] = $offset + 1;

            $individualShares = $finalIndividuals[$key] ?? [];
            $share = $individualShares[$offset] ?? Fraction::zero();
            $amount = $share->mul($totalEstate);

            $result[] = [
                'id' => $node->id,
                'nombre' => $node->nombre ?? '',
                'tipo_heredero' => $node->heirTypeName !== '' ? $node->heirTypeName : ($node->heirTypeId ?? $role),
                'vivo' => (bool)($node->isAlive ?? $node->vivo ?? true),
                'share_fraction' => $share->asString(),
                'monto' => $amount->asString(),
            ];
        }

        return $result;
    }

    /**
     * @param array<string,Fraction[]> $finalIndividuals
     */
    private function resolveOutputKey(string $role, array $finalIndividuals): string
    {
        $directCount = count($finalIndividuals[$role] ?? []);
        if ($directCount > 0 && isset($finalIndividuals[$role])) {
            return RoleNamer::groupKey($role, $directCount);
        }

        $base = RoleNamer::baseRoleKey($role);
        foreach (array_keys($finalIndividuals) as $candidate) {
            $candidateBase = RoleNamer::baseRoleKey($candidate);
            if ($candidateBase === $base) {
                return $candidate;
            }

            if ($candidate === 'uterine_siblings' && ($base === HeirRole::UTERINE_BROTHER || $base === HeirRole::UTERINE_SISTER)) {
                return $candidate;
            }
        }

        return RoleNamer::groupKey($role, 1);
    }

    /**
     * @param PersonNode[] $tree
     *
     * @return PersonNode[]
     */
    private function flattenTree(array $tree): array
    {
        $result = [];
        foreach ($tree as $node) {
            $result[] = $node;
            if (!empty($node->children)) {
                $result = array_merge($result, $this->flattenTree($node->children));
            }
        }

        return $result;
    }

    private function shouldIncludeNode(PersonNode $node): bool
    {
        $alive = $node->isAlive ?? $node->vivo ?? 1;
        return (bool)$alive && empty($node->blocked);
    }

    private function determineRoleForNode(PersonNode $node): ?string
    {
        $heirTypeId = (int)($node->heirTypeId ?? 0);
        if (isset(self::TYPE_ID_TO_ROLE[$heirTypeId])) {
            return self::TYPE_ID_TO_ROLE[$heirTypeId];
        }

        $name = strtolower(trim((string)($node->heirTypeName ?? '')));
        if ($name !== '' && isset(self::NAME_TO_ROLE[$name])) {
            return self::NAME_TO_ROLE[$name];
        }

        $level = (int)($node->nivel ?? 0);
        if ($level === 1) {
            $sex = $this->resolveSexForNode($node, null);
            if ($sex === 'male') {
                return \HeirRole::SON;
            }
            if ($sex === 'female') {
                return \HeirRole::DAUGHTER;
            }
        }

        if ($level >= 2) {
            $sex = $this->resolveSexForNode($node, null);
            if ($sex === 'male') {
                return \HeirRole::SONS_SON;
            }
            if ($sex === 'female') {
                return \HeirRole::SONS_DAUGHTER;
            }
        }

        return null;
    }

    private function resolveSexForNode(PersonNode $node, ?string $role): string
    {
        if ($role !== null) {
            if (in_array($role, [\HeirRole::HUSBAND, \HeirRole::FATHER, \HeirRole::SON, \HeirRole::SONS_SON, \HeirRole::PATERNAL_GRANDFATHER, \HeirRole::FULL_BROTHER, \HeirRole::CONSANGUINE_BROTHER, \HeirRole::UTERINE_BROTHER], true)) {
                return 'male';
            }
            if (in_array($role, [\HeirRole::WIFE, \HeirRole::MOTHER, \HeirRole::DAUGHTER, \HeirRole::SONS_DAUGHTER, \HeirRole::MATERNAL_GRANDMOTHER, \HeirRole::FULL_SISTER, \HeirRole::CONSANGUINE_SISTER, \HeirRole::UTERINE_SISTER], true)) {
                return 'female';
            }
        }

        $raw = strtolower(trim((string)($node->sex ?? '')));
        if (in_array($raw, ['m', 'male', 'varon'], true)) {
            return 'male';
        }
        if (in_array($raw, ['f', 'female', 'mujer'], true)) {
            return 'female';
        }

        return 'unknown';
    }

    private function parseEstateValue(mixed $value): Fraction
    {
        if ($value instanceof Fraction) {
            return $value;
        }

        $string = trim((string)$value);
        if ($string === '') {
            return Fraction::zero();
        }

        $negative = false;
        if ($string[0] === '-') {
            $negative = true;
            $string = substr($string, 1);
        }

        if (str_contains($string, '.')) {
            [$intPart, $decimalPart] = explode('.', $string, 2);
            $decimalPart = rtrim($decimalPart, '0');
            if ($decimalPart === '') {
                $integer = (int)($negative ? '-' . $intPart : $intPart);
                return Fraction::fromInts($integer, 1);
            }

            $digits = strlen($decimalPart);
            $numeratorString = ltrim($intPart, '0');
            if ($numeratorString === '') {
                $numeratorString = '0';
            }
            $numeratorString .= $decimalPart;
            $numerator = (int)$numeratorString;
            if ($negative) {
                $numerator = -$numerator;
            }
            $denominator = 10 ** $digits;

            return Fraction::fromInts($numerator, $denominator);
        }

        $integer = (int)($negative ? '-' . $string : $string);

        return Fraction::fromInts($integer, 1);
    }
}
