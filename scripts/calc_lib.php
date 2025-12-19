<?php
declare(strict_types=1);

require_once __DIR__ . '/calc_runtime.php';

function calc_from_array(array $input, bool $explain = false, bool $audit = false, bool $strict = false): array
{
    $payload = $input;

    $flags = [];
    if (isset($payload['cli_flags']) && is_array($payload['cli_flags'])) {
        $flags = $payload['cli_flags'];
    }

    if ($explain && !in_array('--explain', $flags, true)) {
        $flags[] = '--explain';
    }

    if ($audit && !in_array('--audit', $flags, true)) {
        $flags[] = '--audit';
    }

    if ($strict && !in_array('--strict', $flags, true)) {
        $flags[] = '--strict';
    }

    if ($flags !== []) {
        $payload['cli_flags'] = $flags;
    }

    $output = \App\Scripts\CalcRunner::run($payload);

    $amounts = isset($output['amounts']) && is_array($output['amounts']) ? $output['amounts'] : [];
    if (isset($output['amounts_by_role']) && is_array($output['amounts_by_role'])) {
        $amounts['amounts_by_role'] = $output['amounts_by_role'];
    }

    if (isset($output['amounts_by_individual']) && is_array($output['amounts_by_individual'])) {
        $amounts['individual_amounts_by_role'] = $output['amounts_by_individual'];
    }

    if ($amounts !== [] || !isset($output['amounts'])) {
        $output['amounts'] = $amounts;
    }

    return $output;
}
