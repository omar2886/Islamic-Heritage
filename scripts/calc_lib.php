<?php
declare(strict_types=1);

require_once __DIR__ . '/calc_runtime.php';

function calc_from_array(array $input): array
{
    return \App\Scripts\CalcRunner::run($input);
}

