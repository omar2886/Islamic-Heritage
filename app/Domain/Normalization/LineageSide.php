<?php

declare(strict_types=1);

namespace App\Domain\Normalization;

enum LineageSide: string
{
    case PATERNAL = 'paternal';
    case MATERNAL = 'maternal';
    case NONE = 'none';
}

if (!\enum_exists('LineageSide') && \class_exists(LineageSide::class)) {
    @\class_alias(LineageSide::class, 'LineageSide');
}
