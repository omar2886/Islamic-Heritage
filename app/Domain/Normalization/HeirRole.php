<?php

namespace App\Domain\Normalization {

final class HeirRole
{
    public const HUSBAND = 'husband';
    public const WIFE = 'wife';
    public const FATHER = 'father';
    public const MOTHER = 'mother';
    public const SON = 'son';
    public const DAUGHTER = 'daughter';
    public const SONS_SON = 'sons_son';
    public const SONS_DAUGHTER = 'sons_daughter';
    public const UTERINE_BROTHER = 'uterine_brother';
    public const UTERINE_SISTER = 'uterine_sister';
    public const FULL_BROTHER = 'full_brother';
    public const FULL_SISTER = 'full_sister';
    public const CONSANGUINE_BROTHER = 'consanguine_brother';
    public const CONSANGUINE_SISTER = 'consanguine_sister';
    public const PATERNAL_UNCLE = 'paternal_uncle';
    public const PATERNAL_UNCLES_DAUGHTER = 'paternal_uncles_daughter';
    public const PATERNAL_UNCLE_SON = 'paternal_uncle_son';
    public const PATERNAL_UNCLE_SONS_DAUGHTER = 'paternal_uncle_sons_daughter';
    public const CONSANGUINE_PATERNAL_UNCLE = 'consanguine_paternal_uncle';
    public const CONSANGUINE_PATERNAL_UNCLES_DAUGHTER = 'consanguine_paternal_uncles_daughter';
    public const CONSANGUINE_PATERNAL_UNCLE_SON = 'consanguine_paternal_uncle_son';
    public const CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER = 'consanguine_paternal_uncle_sons_daughter';
    public const PATERNAL_GRANDFATHER = 'paternal_grandfather';
    public const PATERNAL_GRANDMOTHER = 'paternal_grandmother';
    public const MATERNAL_GRANDMOTHER = 'maternal_grandmother';
    public const PATERNAL_GREAT_GRANDMOTHER = 'paternal_great_grandmother';
    public const MATERNAL_GREAT_GRANDMOTHER = 'maternal_great_grandmother';
    public const UNKNOWN = 'unknown';

    private function __construct()
    {
    }
}

}

namespace {

if (!class_exists('HeirRole', false)) {
    class_alias(\App\Domain\Normalization\HeirRole::class, 'HeirRole');
}

}
