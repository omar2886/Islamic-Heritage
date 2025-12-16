<?php
declare(strict_types=1);
require_once __DIR__ . '/_guard.php';

use App\Domain\Math\Fraction;

require_once __DIR__ . '/../../scripts/calc_lib.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    return;
}

$rawInput = file_get_contents('php://input');
if ($rawInput === false) {
    http_response_code(400);
    echo json_encode(['error' => 'Unable to read request body.']);
    return;
}

$data = json_decode($rawInput, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload.']);
    return;
}

if (!isset($data['cases']) || !is_array($data['cases'])) {
    http_response_code(400);
    echo json_encode(['error' => "Payload must contain a 'cases' array."]);
    return;
}

$results = [];
foreach ($data['cases'] as $index => $casePayload) {
    try {
        $normalizedInput = normalizeCasePayload($casePayload, $index);
    } catch (InvalidArgumentException $exception) {
        $results[] = [
            'input' => null,
            'output' => null,
            'ok' => false,
            'diagnostics' => [
                'sum_final' => '0/1',
                'residual_policy' => 'invalid_payload',
                'bayt_due' => '0/1',
                'warnings_count' => 0,
                'errors_count' => 1,
                'error' => $exception->getMessage(),
            ],
        ];
        continue;
    }

    $output = null;
    $warningsCount = 0;
    $errorsCount = 0;
    $sumFinal = '0/1';
    $residualPolicy = 'none';
    $baytDue = '0/1';
    $ok = false;

    try {
        $output = calc_from_array($normalizedInput);
    } catch (Throwable $throwable) {
        $output = [
            'warnings' => [],
            'errors' => ['Engine exception: ' . $throwable->getMessage()],
            'meta' => [
                'residual_policy' => 'exception',
                'bayt_due' => '0/1',
                'assertions' => [],
            ],
            'sum_final' => '0/1',
        ];
    }

    if (isset($output['warnings']) && is_array($output['warnings'])) {
        $warningsCount = count($output['warnings']);
    }
    if (isset($output['errors']) && is_array($output['errors'])) {
        $errorsCount = count($output['errors']);
    }

    if (isset($output['sum_final']) && is_string($output['sum_final'])) {
        $sumFinal = $output['sum_final'];
    }

    if (isset($output['meta']) && is_array($output['meta'])) {
        $meta = $output['meta'];
        if (isset($meta['residual_policy']) && is_string($meta['residual_policy'])) {
            $residualPolicy = $meta['residual_policy'];
        }
        if (isset($meta['bayt_due']) && is_string($meta['bayt_due'])) {
            $baytDue = $meta['bayt_due'];
        }
    } else {
        $meta = [];
    }

    $ok = determineOkFlag($sumFinal, $residualPolicy);

    $results[] = [
        'input' => $normalizedInput,
        'output' => $output,
        'ok' => $ok,
        'diagnostics' => [
            'sum_final' => $sumFinal,
            'residual_policy' => $residualPolicy,
            'bayt_due' => $baytDue,
            'warnings_count' => $warningsCount,
            'errors_count' => $errorsCount,
        ],
    ];
}

echo json_encode(['results' => $results], JSON_PRETTY_PRINT);

/**
 * @param mixed $payload
 * @throws InvalidArgumentException
 */
function normalizeCasePayload($payload, int $index): array
{
    if (!is_array($payload)) {
        throw new InvalidArgumentException(sprintf('Case at index %d must be an object.', $index));
    }

    if (!isset($payload['heirs']) || !is_array($payload['heirs'])) {
        throw new InvalidArgumentException(sprintf("Case %d must include a 'heirs' array.", $index));
    }

    $normalized = $payload;
    $normalizedHeirs = [];
    foreach ($payload['heirs'] as $heirIndex => $heir) {
        if (!is_array($heir)) {
            throw new InvalidArgumentException(sprintf('Heir at index %d in case %d must be an object.', $heirIndex, $index));
        }
        if (!isset($heir['role']) || !is_scalar($heir['role'])) {
            throw new InvalidArgumentException(sprintf('Heir at index %d in case %d must include a role.', $heirIndex, $index));
        }
        if (!array_key_exists('count', $heir)) {
            throw new InvalidArgumentException(sprintf('Heir at index %d in case %d must include a count.', $heirIndex, $index));
        }

        $normalizedHeirs[] = [
            'role' => (string) $heir['role'],
            'count' => $heir['count'],
        ];
    }
    $normalized['heirs'] = $normalizedHeirs;

    if (isset($normalized['cli_flags'])) {
        if (!is_array($normalized['cli_flags'])) {
            throw new InvalidArgumentException(sprintf("Case %d 'cli_flags' must be an array of strings.", $index));
        }
        $flags = [];
        foreach ($normalized['cli_flags'] as $flag) {
            if (!is_scalar($flag)) {
                throw new InvalidArgumentException(sprintf("Case %d 'cli_flags' must contain only scalar values.", $index));
            }
            $flags[] = (string) $flag;
        }
        $normalized['cli_flags'] = $flags;
    }

    return $normalized;
}

function determineOkFlag(string $sumFinal, string $residualPolicy): bool
{
    try {
        $fraction = Fraction::fromString($sumFinal);
    } catch (Throwable $throwable) {
        return false;
    }

    if ($fraction->equals(Fraction::one())) {
        return true;
    }

    if ($residualPolicy === 'bayt_al_mal' && $fraction->compareTo(Fraction::one()) < 0) {
        return true;
    }

    return false;
}
