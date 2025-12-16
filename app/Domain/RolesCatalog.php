<?php declare(strict_types=1);

namespace App\Domain;

final class RolesCatalog
{
    /**
     * @return array<int, string>
     */
    public static function all(): array
    {
        return [
            'consanguine_brother',
            'consanguine_paternal_uncle',
            'consanguine_paternal_uncle_son',
            'consanguine_paternal_uncle_sons_daughter',
            'consanguine_paternal_uncles_daughter',
            'consanguine_sister',
            'daughter',
            'father',
            'full_brother',
            'full_sister',
            'husband',
            'maternal_grandmother',
            'maternal_great_grandmother',
            'mother',
            'paternal_grandfather',
            'paternal_grandmother',
            'paternal_great_grandmother',
            'paternal_uncle',
            'paternal_uncle_son',
            'paternal_uncle_sons_daughter',
            'paternal_uncles_daughter',
            'son',
            'sons_daughter',
            'sons_son',
            'unknown',
            'uterine_brother',
            'uterine_sister',
            'wife',
        ];
    }

    private function __construct()
    {
    }
}
