<?php
declare(strict_types=1);

require_once __DIR__ . '/../../scripts/calc_lib.php';

class_exists(\App\Scripts\CalcRunner::class);

use App\Domain\Normalization\HeirRole;

$aliases = [
    'husband','wife','father','mother','paternal_grandfather','maternal_grandmother',
    'son','daughter','sons_son','sons_daughter','full_brother','full_sister',
    'consanguine_brother','consanguine_sister','uterine_brother','uterine_sister',
    'paternal_uncle','paternal_uncles',
];

$roleConstants = array_values((new ReflectionClass(HeirRole::class))->getConstants());

foreach ($aliases as $alias) {
    $canonical = \App\Scripts\resolveCanonicalRole($alias);
    if ($canonical === null) {
        fwrite(STDERR, "Alias '$alias' returned null" . PHP_EOL);
        exit(1);
    }

    if ($canonical === HeirRole::UNKNOWN) {
        fwrite(STDERR, "Alias '$alias' resolved to UNKNOWN" . PHP_EOL);
        exit(1);
    }

    if (!in_array($canonical, $roleConstants, true)) {
        fwrite(STDERR, "Alias '$alias' resolved to invalid role '$canonical'" . PHP_EOL);
        exit(1);
    }
}

echo "OK" . PHP_EOL;
