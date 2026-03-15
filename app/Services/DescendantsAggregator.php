<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Eligibility\EligibilityResult;
use App\Domain\Normalization\HeirRole;
use App\Domain\Normalization\Sex;

require_once __DIR__ . '/../Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../Domain/Normalization/Sex.php';
require_once __DIR__ . '/../Domain/Eligibility/EligibilityResult.php';

final class DescendantsAggregator
{
    /**
     * @var array<string,int>
     */
    private static array $DEGREE = [
        HeirRole::SON => 1,
        HeirRole::DAUGHTER => 1,
        HeirRole::SONS_SON => 2,
        HeirRole::SONS_DAUGHTER => 2,
        'sons_sons_son' => 3,
        'sons_sons_daughter' => 3,
        'sons_sons_sons_son' => 4,
        'sons_sons_sons_daughter' => 4,
        'sons_sons_sons_sons_son' => 5,
        'sons_sons_sons_sons_daughter' => 5,
        'sons_sons_sons_sons_sons_son' => 6,
        'sons_sons_sons_sons_sons_daughter' => 6,
    ];

    /**
     * @var array<string,string>
     */
    private static array $SEX = [
        HeirRole::SON => Sex::MALE->value,
        HeirRole::DAUGHTER => Sex::FEMALE->value,
        HeirRole::SONS_SON => Sex::MALE->value,
        HeirRole::SONS_DAUGHTER => Sex::FEMALE->value,
        'sons_sons_son' => Sex::MALE->value,
        'sons_sons_daughter' => Sex::FEMALE->value,
        'sons_sons_sons_son' => Sex::MALE->value,
        'sons_sons_sons_daughter' => Sex::FEMALE->value,
        'sons_sons_sons_sons_son' => Sex::MALE->value,
        'sons_sons_sons_sons_daughter' => Sex::FEMALE->value,
        'sons_sons_sons_sons_sons_son' => Sex::MALE->value,
        'sons_sons_sons_sons_sons_daughter' => Sex::FEMALE->value,
    ];

    /**
     * @var array<string,array{degree:int,is_male:bool,is_female:bool,sex:?string}|null>
     */
    private static array $DESC_CACHE = [];

    /**
     * @var array<string,array<int,array{males:int,females:int,roleMale:?string,roleFemale:?string}>>
     */
    private array $summaryCache = [];

    /**
     * @return array<int,array{males:int,females:int,roleMale:?string,roleFemale:?string}>
     */
    public function summarize(EligibilityResult $eligibility): array
    {
        $snapshot = $eligibility->snapshot();

        if (!array_key_exists($snapshot, $this->summaryCache)) {
            $this->summaryCache[$snapshot] = $this->summarizeCounts($eligibility->counts());
        }

        return $this->summaryCache[$snapshot];
    }

    /**
     * @param array<string,int> $counts
     * @return array<int,array{males:int,females:int,roleMale:?string,roleFemale:?string}>
     */
    public function summarizeCounts(array $counts): array
    {
        $summary = [];
        foreach ($counts as $role => $count) {
            if ($count <= 0) {
                continue;
            }

            $description = $this->describe($role);
            if ($description === null) {
                continue;
            }

            $degree = $description['degree'];
            $summary[$degree] ??= [
                'males' => 0,
                'females' => 0,
                'roleMale' => null,
                'roleFemale' => null,
            ];

            if ($description['is_male']) {
                $summary[$degree]['males'] += $count;
                $summary[$degree]['roleMale'] = $role;
            }

            if ($description['is_female']) {
                $summary[$degree]['females'] += $count;
                $summary[$degree]['roleFemale'] = $role;
            }
        }

        if ($summary !== []) {
            ksort($summary);
        }

        return $summary;
    }

    public function isDescendantRole(string $role): bool
    {
        return $this->describe($role) !== null;
    }

    /**
     * @return array{degree:int,is_male:bool,is_female:bool,sex:?string}|null
     */
    public function describe(string $role): ?array
    {
        if (!array_key_exists($role, self::$DESC_CACHE)) {
            $degree = self::$DEGREE[$role] ?? null;
            if ($degree === null) {
                self::$DESC_CACHE[$role] = null;

                return null;
            }

            $sex = self::$SEX[$role] ?? null;
            $isMale = $sex === Sex::MALE->value;
            $isFemale = $sex === Sex::FEMALE->value;

            self::$DESC_CACHE[$role] = [
                'degree' => $degree,
                'is_male' => $isMale,
                'is_female' => $isFemale,
                'sex' => $sex,
            ];
        }

        return self::$DESC_CACHE[$role];
    }
}
