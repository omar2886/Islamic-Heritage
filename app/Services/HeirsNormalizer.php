<?php

use App\Domain\Normalization\LineageSide;
use App\Domain\Normalization\Sex;

require_once __DIR__ . '/../Models/PersonNode.php';
require_once __DIR__ . '/../Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../Domain/Normalization/Sex.php';
require_once __DIR__ . '/../Domain/Normalization/LineageSide.php';
require_once __DIR__ . '/../Domain/Normalization/Heir.php';
require_once __DIR__ . '/../Domain/Normalization/ContextFlags.php';
require_once __DIR__ . '/../Domain/Normalization/NormalizationResult.php';

class HeirsNormalizer
{
    private const TYPE_ID_TO_ROLE = [
        1  => HeirRole::HUSBAND,
        2  => HeirRole::WIFE,
        3  => HeirRole::SON,
        4  => HeirRole::DAUGHTER,
        5  => HeirRole::FATHER,
        6  => HeirRole::MOTHER,
        7  => HeirRole::PATERNAL_GRANDFATHER,
        8  => HeirRole::MATERNAL_GRANDMOTHER,
        15 => HeirRole::PATERNAL_GRANDMOTHER,
        9  => HeirRole::FULL_BROTHER,
        10 => HeirRole::FULL_SISTER,
        11 => HeirRole::CONSANGUINE_BROTHER,
        12 => HeirRole::CONSANGUINE_SISTER,
        13 => HeirRole::UTERINE_BROTHER,
        14 => HeirRole::UTERINE_SISTER,
    ];

    private const ROLE_PRIORITY = [
        HeirRole::HUSBAND => 10,
        HeirRole::WIFE => 10,
        HeirRole::FATHER => 20,
        HeirRole::MOTHER => 20,
        HeirRole::SON => 30,
        HeirRole::DAUGHTER => 30,
        HeirRole::SONS_SON => 40,
        HeirRole::SONS_DAUGHTER => 40,
        HeirRole::PATERNAL_GRANDFATHER => 50,
        HeirRole::PATERNAL_GRANDMOTHER => 50,
        HeirRole::MATERNAL_GRANDMOTHER => 50,
        HeirRole::FULL_BROTHER => 60,
        HeirRole::FULL_SISTER => 60,
        HeirRole::CONSANGUINE_BROTHER => 70,
        HeirRole::CONSANGUINE_SISTER => 70,
        HeirRole::PATERNAL_UNCLE => 80,
        HeirRole::PATERNAL_UNCLES_DAUGHTER => 80,
        HeirRole::CONSANGUINE_PATERNAL_UNCLE => 90,
        HeirRole::CONSANGUINE_PATERNAL_UNCLES_DAUGHTER => 90,
        HeirRole::PATERNAL_UNCLE_SON => 100,
        HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER => 100,
        HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON => 110,
        HeirRole::CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER => 110,
        HeirRole::UTERINE_BROTHER => 80,
        HeirRole::UTERINE_SISTER => 80,
        HeirRole::UNKNOWN => 999,
    ];

    public function normalize(array $genealogy): NormalizationResult
    {
        $flatNodes = $this->flatten($genealogy);
        $groups = [];
        $rolePersonMap = [];
        $personSeen = [];

        foreach ($flatNodes as $node) {
            if (!$this->shouldInclude($node)) {
                continue;
            }

            $role = $this->determineRole($node);
            if ($role === HeirRole::UNKNOWN) {
                continue;
            }

            $side = $this->resolveSide($node, $role);
            $degree = (int)($node->nivel ?? 0);
            $sex = $this->resolveSex($node, $role);

            $groupKey = implode('|', [$role, $side, $degree]);
            if (!isset($groups[$groupKey])) {
                $groups[$groupKey] = [
                    'role' => $role,
                    'sex' => $sex,
                    'count' => 0,
                    'degree' => $degree,
                    'side' => $side,
                ];
            }

            $groups[$groupKey]['count']++;
            if ($groups[$groupKey]['sex'] === Sex::UNKNOWN->value && $sex !== Sex::UNKNOWN->value) {
                $groups[$groupKey]['sex'] = $sex;
            }

            $personId = $node->id ?? null;
            if (is_scalar($personId)) {
                $this->appendPersonId($rolePersonMap, $personSeen, $role, $personId);
            }
        }

        $heirs = [];
        foreach ($groups as $group) {
            $heirs[] = new Heir(
                $group['role'],
                $group['sex'],
                $group['count'],
                true,
                $group['degree'],
                $group['side']
            );
        }

        $this->sortHeirs($heirs);
        $ctx = $this->buildContext($heirs);

        return new NormalizationResult($heirs, $ctx, $rolePersonMap);
    }

    private function flatten(array $genealogy): array
    {
        $result = [];
        foreach ($genealogy as $node) {
            $result[] = $node;
            if (!empty($node->children)) {
                $result = array_merge($result, $this->flatten($node->children));
            }
        }
        return $result;
    }

    private function shouldInclude(PersonNode $node): bool
    {
        return boolval($node->isAlive ?? $node->vivo) && empty($node->blocked);
    }

    private function determineRole(PersonNode $node): string
    {
        $heirTypeId = (int)($node->heirTypeId ?? 0);
        if (isset(self::TYPE_ID_TO_ROLE[$heirTypeId])) {
            return self::TYPE_ID_TO_ROLE[$heirTypeId];
        }

        $normalizedName = strtolower(trim((string)($node->heirTypeName ?? '')));
        if ($normalizedName !== '') {
            $mappedByName = $this->mapByName($normalizedName);
            if ($mappedByName !== HeirRole::UNKNOWN) {
                return $mappedByName;
            }
        }

        $level = (int)($node->nivel ?? 0);
        if ($level >= 1) {
            $resolvedSex = $this->resolveSex($node, HeirRole::UNKNOWN);

            if ($level === 1) {
                if ($resolvedSex === Sex::FEMALE->value) {
                    return HeirRole::DAUGHTER;
                }
                if ($resolvedSex === Sex::MALE->value) {
                    return HeirRole::SON;
                }
                return HeirRole::UNKNOWN;
            }

            if ($level === 2) {
                if ($resolvedSex === Sex::FEMALE->value) {
                    return HeirRole::SONS_DAUGHTER;
                }
                if ($resolvedSex === Sex::MALE->value) {
                    return HeirRole::SONS_SON;
                }
                return HeirRole::UNKNOWN;
            }
        }

        return HeirRole::UNKNOWN;
    }

    private function mapByName(string $normalizedName): string
    {
        $map = [
            'esposo' => HeirRole::HUSBAND,
            'esposa' => HeirRole::WIFE,
            'padre' => HeirRole::FATHER,
            'madre' => HeirRole::MOTHER,
            'hijo' => HeirRole::SON,
            'hija' => HeirRole::DAUGHTER,
            'abuelo paterno' => HeirRole::PATERNAL_GRANDFATHER,
            'abuela paterna' => HeirRole::PATERNAL_GRANDMOTHER,
            'abuela materna' => HeirRole::MATERNAL_GRANDMOTHER,
            'hermano pleno' => HeirRole::FULL_BROTHER,
            'hermana plena' => HeirRole::FULL_SISTER,
            'hermano consanguineo' => HeirRole::CONSANGUINE_BROTHER,
            'hermana consanguinea' => HeirRole::CONSANGUINE_SISTER,
            'hermano uterino' => HeirRole::UTERINE_BROTHER,
            'hermana uterina' => HeirRole::UTERINE_SISTER,
        ];

        return $map[$normalizedName] ?? HeirRole::UNKNOWN;
    }

    private function resolveSex(PersonNode $node, string $role): string
    {
        $raw = strtolower((string)($node->sex ?? ''));
        if (in_array($role, [
            HeirRole::HUSBAND,
            HeirRole::FATHER,
            HeirRole::SON,
            HeirRole::SONS_SON,
            HeirRole::PATERNAL_GRANDFATHER,
            HeirRole::FULL_BROTHER,
            HeirRole::CONSANGUINE_BROTHER,
            HeirRole::UTERINE_BROTHER,
            HeirRole::PATERNAL_UNCLE,
            HeirRole::CONSANGUINE_PATERNAL_UNCLE,
            HeirRole::PATERNAL_UNCLE_SON,
            HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON,
        ], true)) {
            return Sex::MALE->value;
        }
        if (in_array($role, [
            HeirRole::WIFE,
            HeirRole::MOTHER,
            HeirRole::DAUGHTER,
            HeirRole::SONS_DAUGHTER,
            HeirRole::MATERNAL_GRANDMOTHER,
            HeirRole::PATERNAL_GRANDMOTHER,
            HeirRole::FULL_SISTER,
            HeirRole::CONSANGUINE_SISTER,
            HeirRole::UTERINE_SISTER,
            HeirRole::PATERNAL_UNCLES_DAUGHTER,
            HeirRole::CONSANGUINE_PATERNAL_UNCLES_DAUGHTER,
            HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER,
            HeirRole::CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER,
        ], true)) {
            return Sex::FEMALE->value;
        }

        if ($raw === 'm' || $raw === 'male' || $raw === 'varon') {
            return Sex::MALE->value;
        }
        if ($raw === 'f' || $raw === 'female' || $raw === 'mujer') {
            return Sex::FEMALE->value;
        }

        return Sex::UNKNOWN->value;
    }

    private function resolveSide(PersonNode $node, string $role): string
    {
        $raw = strtolower(trim((string)($node->lineage_side ?? '')));
        if ($raw === 'paternal' || $raw === 'paterno') {
            return LineageSide::PATERNAL->value;
        }
        if ($raw === 'maternal' || $raw === 'materno') {
            return LineageSide::MATERNAL->value;
        }

        if ($role === HeirRole::FATHER || $role === HeirRole::PATERNAL_GRANDFATHER) {
            return LineageSide::PATERNAL->value;
        }
        if (in_array($role, [HeirRole::MOTHER, HeirRole::MATERNAL_GRANDMOTHER], true)) {
            return LineageSide::MATERNAL->value;
        }
        if (in_array($role, [HeirRole::PATERNAL_GRANDMOTHER], true)) {
            return LineageSide::PATERNAL->value;
        }

        return LineageSide::NONE->value;
    }

    private function sortHeirs(array &$heirs): void
    {
        usort($heirs, function (Heir $a, Heir $b): int {
            $degreeComparison = $a->getDegree() <=> $b->getDegree();
            if ($degreeComparison !== 0) {
                return $degreeComparison;
            }

            $priorityA = self::ROLE_PRIORITY[$a->getRole()] ?? 999;
            $priorityB = self::ROLE_PRIORITY[$b->getRole()] ?? 999;
            if ($priorityA !== $priorityB) {
                return $priorityA <=> $priorityB;
            }

            return strcmp($a->getRole(), $b->getRole());
        });
    }

    /**
     * @param Heir[] $heirs
     */
    private function buildContext(array $heirs): ContextFlags
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
            if ($heir->getDegree() >= 1) {
                $hasDescendants = true;
                if ($heir->getSex() === Sex::MALE->value) {
                    $hasMaleDescendant = true;
                }
                if ($heir->getSex() === Sex::FEMALE->value) {
                    $hasFemaleDescendant = true;
                }
            }

            if ($heir->getRole() === HeirRole::FATHER) {
                $hasFather = true;
            }
            if ($heir->getRole() === HeirRole::PATERNAL_GRANDFATHER) {
                $hasPaternalGrandfather = true;
            }

            if (in_array($heir->getRole(), [
                HeirRole::FULL_BROTHER,
                HeirRole::FULL_SISTER,
                HeirRole::CONSANGUINE_BROTHER,
                HeirRole::CONSANGUINE_SISTER,
                HeirRole::UTERINE_BROTHER,
                HeirRole::UTERINE_SISTER,
            ], true)) {
                $siblingsCount += $heir->getCount();
            }

            if (in_array($heir->getRole(), [HeirRole::UTERINE_BROTHER, HeirRole::UTERINE_SISTER], true)) {
                $uterinesCount += $heir->getCount();
            }

            if ($heir->getRole() === HeirRole::WIFE) {
                $wivesCount += $heir->getCount();
            }
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
     * @param array<string,array<int|string>> $rolePersonMap
     * @param array<string,array<string,bool>> $personSeen
     * @param int|string $personId
     */
    private function appendPersonId(array &$rolePersonMap, array &$personSeen, string $role, $personId): void
    {
        $normalizedRole = $this->normalizeRoleKey($role);
        $key = (string) $personId;

        if (!isset($personSeen[$normalizedRole])) {
            $personSeen[$normalizedRole] = [];
        }

        if (isset($personSeen[$normalizedRole][$key])) {
            return;
        }

        $personSeen[$normalizedRole][$key] = true;
        $rolePersonMap[$normalizedRole][] = $personId;
    }

    private function normalizeRoleKey(string $role): string
    {
        $normalized = strtolower(trim($role));
        $normalized = str_replace(['-', ' '], '_', $normalized);

        return preg_replace('/__+/', '_', $normalized) ?? $normalized;
    }
}
