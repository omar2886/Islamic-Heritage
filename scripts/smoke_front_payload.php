<?php
declare(strict_types=1);

// Smoke test for front payload path via calc_cli.php
$root = dirname(__DIR__);
$calcCli = $root . '/scripts/calc_cli.php';

if (!is_file($calcCli)) {
    fwrite(STDERR, "[FAIL] calc_cli.php no encontrado\n");
    exit(1);
}

$payload = [
    'heirs' => [
        ['role' => 'husband', 'count' => 1],
        ['role' => 'daughter', 'count' => 1],
    ],
    'cli_flags' => ['--explain', '--audit'],
];

$command = [PHP_BINARY, $calcCli, '--stdin'];
$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
];

$process = proc_open($command, $descriptors, $pipes, $root);
if (!is_resource($process)) {
    fwrite(STDERR, "[ERROR] no se pudo lanzar calc_cli.php\n");
    exit(1);
}

fwrite($pipes[0], json_encode($payload, JSON_UNESCAPED_UNICODE));
fclose($pipes[0]);

$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);

fclose($pipes[1]);
fclose($pipes[2]);

$status = proc_close($process);

if ($status !== 0) {
    fwrite(STDERR, '[FAIL] calc_cli.php terminó con código ' . $status . PHP_EOL);
    if ($stderr) {
        fwrite(STDERR, trim($stderr) . PHP_EOL);
    }
    exit(1);
}

$output = json_decode($stdout, true);
if (!is_array($output)) {
    fwrite(STDERR, "[FAIL] salida JSON inválida desde calc_cli.php\n");
    if ($stderr) {
        fwrite(STDERR, trim($stderr) . PHP_EOL);
    }
    exit(1);
}

$sumFinal = (string) ($output['sum_final'] ?? '');
if ($sumFinal !== '1/1') {
    fwrite(STDERR, sprintf('[FAIL] sum_final esperado 1/1, obtenido %s\n', $sumFinal));
    exit(1);
}

echo "[OK] calc_cli.php responde con sum_final=1/1 para payload mínimo\n";
exit(0);
