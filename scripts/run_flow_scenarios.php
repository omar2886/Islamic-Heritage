<?php
declare(strict_types=1);

require __DIR__ . '/calc_lib.php';

$scenariosPath = __DIR__ . '/flow_scenarios.json';
if (!is_file($scenariosPath)) {
    fwrite(STDERR, "[FAIL] No se encontró flow_scenarios.json en scripts/\n");
    exit(1);
}

$json = file_get_contents($scenariosPath);
if (!is_string($json)) {
    fwrite(STDERR, "[FAIL] No se pudo leer flow_scenarios.json\n");
    exit(1);
}

$data = json_decode($json, true);
if (!is_array($data)) {
    fwrite(STDERR, "[FAIL] flow_scenarios.json no es un array JSON\n");
    exit(1);
}

$failures = [];

foreach ($data as $index => $scenario) {
    $name = isset($scenario['name']) && is_scalar($scenario['name'])
        ? (string) $scenario['name']
        : sprintf('Escenario #%d', $index + 1);

    $expectStatus = isset($scenario['expect_status']) && is_scalar($scenario['expect_status'])
        ? (int) $scenario['expect_status']
        : 200;

    $payload = $scenario['payload'] ?? null;
    if (!is_array($payload)) {
        $failures[] = sprintf('%s: payload inválido en fixture', $name);
        continue;
    }

    try {
        $out = calc_from_array($payload, true, true, false);
    } catch (Throwable $throwable) {
        if ($expectStatus === 400) {
            echo sprintf('[OK] %s: cálculo rechazado como se esperaba (%s)%s', $name, $throwable->getMessage(), PHP_EOL);
            continue;
        }

        $failures[] = sprintf('%s: excepción %s: %s', $name, get_class($throwable), $throwable->getMessage());
        continue;
    }

    if ($expectStatus === 400) {
        $hasErrors = isset($out['errors']) && is_array($out['errors']) && $out['errors'] !== [];
        $hasUnknownWarning = false;
        if (isset($out['warnings']) && is_array($out['warnings'])) {
            foreach ($out['warnings'] as $warning) {
                if (!is_string($warning)) {
                    continue;
                }

                if (stripos($warning, 'unknown heir role') !== false) {
                    $hasUnknownWarning = true;
                    break;
                }
            }
        }

        if (!$hasErrors && !$hasUnknownWarning) {
            $failures[] = sprintf('%s: se esperaba rechazo (400) pero la salida parece exitosa', $name);
            continue;
        }
    }

    if (!isset($out['shares'])) {
        $failures[] = sprintf("%s: output sin 'shares'", $name);
        continue;
    }

    $hasAmounts = array_key_exists('amounts', $out);
    if (!$hasAmounts && isset($out['amounts_by_role'], $out['amounts_by_individual'])) {
        $hasAmounts = true;
    }

    if (!$hasAmounts) {
        $failures[] = sprintf("%s: output sin 'amounts'", $name);
        continue;
    }

    echo sprintf('[OK] %s%s', $name, PHP_EOL);
}

if ($failures !== []) {
    foreach ($failures as $failure) {
        fwrite(STDERR, '[FAIL] ' . $failure . PHP_EOL);
    }
    exit(1);
}

echo "Todos los escenarios pasaron" . PHP_EOL;
