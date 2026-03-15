<?php

declare(strict_types=1);

namespace App\Domain\Normalization;

enum Sex: string
{
    case MALE = 'male';
    case FEMALE = 'female';
    case UNKNOWN = 'unknown';
}

if (!\enum_exists('Sex') && \class_exists(Sex::class)) {
    @\class_alias(Sex::class, 'Sex');
}
