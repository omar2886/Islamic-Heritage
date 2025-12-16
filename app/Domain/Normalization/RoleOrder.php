<?php

namespace App\Domain\Normalization;

final class RoleOrder
{
    public const ORDER = [
        'husband',
        'wife',
        'father',
        'mother',
        'paternal_grandfather',
        'maternal_grandmother',
        'son',
        'daughter',
        'sons_son',
        'sons_daughter',
        'full_brother',
        'full_sister',
        'consanguine_brother',
        'consanguine_sister',
        'uterine_brother',
        'uterine_sister',
        'paternal_uncle',
        'paternal_uncle_son',
    ];

    private function __construct()
    {
    }

    public static function cmp(string $a, string $b): int
    {
        $ia = array_search($a, self::ORDER, true);
        $ib = array_search($b, self::ORDER, true);

        return ($ia === false ? PHP_INT_MAX : $ia) <=> ($ib === false ? PHP_INT_MAX : $ib);
    }
}
