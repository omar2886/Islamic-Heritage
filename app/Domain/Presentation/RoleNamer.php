<?php

declare(strict_types=1);

namespace App\Domain\Presentation;

use App\Domain\Normalization\HeirRole;

final class RoleNamer
{
    /**
     * @var array<string,string>
     */
    private const ALIASES = [
        'husbands' => HeirRole::HUSBAND,
        'wives' => HeirRole::WIFE,
        'sons' => HeirRole::SON,
        'daughters' => HeirRole::DAUGHTER,
        'sons_sons' => HeirRole::SONS_SON,
        'sons_daughters' => HeirRole::SONS_DAUGHTER,
        'full_brothers' => HeirRole::FULL_BROTHER,
        'full_sisters' => HeirRole::FULL_SISTER,
        'consanguine_brothers' => HeirRole::CONSANGUINE_BROTHER,
        'consanguine_sisters' => HeirRole::CONSANGUINE_SISTER,
        'uterine_brothers' => HeirRole::UTERINE_BROTHER,
        'uterine_sisters' => HeirRole::UTERINE_SISTER,
        'uterine_siblings' => 'uterine_siblings',
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
    ];

    /**
     * @var array<string,string>
     */
    private const PLURALS = [
        HeirRole::HUSBAND => 'husbands',
        HeirRole::WIFE => 'wives',
        HeirRole::FATHER => 'fathers',
        HeirRole::MOTHER => 'mothers',
        HeirRole::SON => 'sons',
        HeirRole::DAUGHTER => 'daughters',
        HeirRole::SONS_SON => 'sons_sons',
        HeirRole::SONS_DAUGHTER => 'sons_daughters',
        HeirRole::UTERINE_BROTHER => 'uterine_brothers',
        HeirRole::UTERINE_SISTER => 'uterine_sisters',
        HeirRole::FULL_BROTHER => 'full_brothers',
        HeirRole::FULL_SISTER => 'full_sisters',
        HeirRole::CONSANGUINE_BROTHER => 'consanguine_brothers',
        HeirRole::CONSANGUINE_SISTER => 'consanguine_sisters',
        HeirRole::PATERNAL_UNCLE => 'paternal_uncles',
        HeirRole::PATERNAL_UNCLES_DAUGHTER => 'paternal_uncles_daughters',
        HeirRole::PATERNAL_UNCLE_SON => 'paternal_uncles_sons',
        HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER => 'paternal_uncles_sons_daughters',
        HeirRole::CONSANGUINE_PATERNAL_UNCLE => 'consanguine_paternal_uncles',
        HeirRole::CONSANGUINE_PATERNAL_UNCLES_DAUGHTER => 'consanguine_paternal_uncles_daughters',
        HeirRole::CONSANGUINE_PATERNAL_UNCLE_SON => 'consanguine_paternal_uncles_sons',
        HeirRole::CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER => 'consanguine_paternal_uncles_sons_daughters',
        HeirRole::PATERNAL_GRANDFATHER => 'paternal_grandfathers',
        HeirRole::PATERNAL_GRANDMOTHER => 'paternal_grandmothers',
        HeirRole::MATERNAL_GRANDMOTHER => 'maternal_grandmothers',
        HeirRole::PATERNAL_GREAT_GRANDMOTHER => 'paternal_great_grandmothers',
        HeirRole::MATERNAL_GREAT_GRANDMOTHER => 'maternal_great_grandmothers',
        HeirRole::UNKNOWN => 'unknowns',
        'uterine_siblings' => 'uterine_siblings',
    ];

    private const IMMUTABLE = ['uterine_siblings'];

    private function __construct()
    {
    }

    public static function groupKey(string $role, int $count): string
    {
        $base = self::normalizeKey($role);

        if (in_array($base, self::IMMUTABLE, true)) {
            return $base;
        }

        if ($base === HeirRole::WIFE) {
            if ($count === 1) {
                return HeirRole::WIFE;
            }

            if ($count > 1) {
                return 'wives';
            }
        }

        if ($count <= 1) {
            return $base;
        }

        return self::PLURALS[$base] ?? ($base . 's');
    }

    public static function baseRoleKey(string $role): string
    {
        return self::normalizeKey($role);
    }

    private static function normalizeKey(string $role): string
    {
        $key = strtolower(trim($role));
        $key = str_replace(['-', ' '], '_', $key);
        $key = preg_replace('/__+/', '_', $key) ?? $key;

        $canonical = self::ALIASES[$key] ?? $key;

        return $canonical;
    }
}
