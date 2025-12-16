<?php
declare(strict_types=1);

/**
 * CLI fuzz runner (independiente de PHPUnit).
 * Uso:
 *   php tests/fuzz/fuzz.php --cases=1000 --seed=42 --php=/usr/bin/php
 * Opciones:
 *   --cases=N    número de casos a generar (def: 500)
 *   --seed=S     semilla determinista (def: 12345)
 *   --php=BIN    binario php (def: `which php`)
 */

const CALC_CLI = __DIR__ . '/../../scripts/calc_cli.php';
const PREPEND_BOOTSTRAP = __DIR__ . '/../unit/TestHarness.php';

function arg(string $name, $default) {
    foreach ($_SERVER['argv'] as $i => $a) {
        if (str_starts_with($a, $name.'=')) {
            return substr($a, strlen($name.'='));
        }
    }
    return $default;
}

$N    = (int) arg('--cases', '500');
$SEED = (int) arg('--seed', '12345');
$PHP  = (string) (arg('--php', trim(shell_exec('which php') ?? 'php')) ?: 'php');

mt_srand($SEED);

$coverage = [
    'role_present' => [],
    'combos' => [],
];

$criticalCombos = [
    'daughter+paternal_uncle:!son:!father',
    'father+pgf',
    'son+sibling',
    'wives>=2',
    'uterine_pair',
];

function gcd(int $a, int $b): int { $a = abs($a); $b = abs($b); while ($b) { [$a,$b] = [$b,$a % $b]; } return $a ?: 1; }
function parseFraction(string $s): array {
    // "p/q" -> [p,q]; "0/1" safe
    $s = trim($s);
    if (!preg_match('#^-?\d+/\d+$#', $s)) throw new RuntimeException("Bad fraction: $s");
    [$p,$q] = array_map('intval', explode('/',$s));
    if ($q === 0) throw new RuntimeException("Zero denominator: $s");
    $g = gcd($p,$q); $p/= $g; $q/= $g;
    return [$p,$q];
}

function fracAdd(array $a, array $b): array {
    [$p1,$q1] = $a; [$p2,$q2] = $b;
    $p = $p1*$q2 + $p2*$q1; $q = $q1*$q2; $g=gcd($p,$q);
    return [$p/$g, $q/$g];
}

function sumShares(array $group_shares): array {
    $sum = [0,1];
    foreach ($group_shares as $role => $fq) {
        if (!is_string($fq)) throw new RuntimeException("group_shares[$role] not string");
        $sum = fracAdd($sum, parseFraction($fq));
    }
    return $sum;
}

function nonNegative(array $group_shares): void {
    foreach ($group_shares as $role=>$fq) {
        [$p,$q] = parseFraction($fq);
        if ($p < 0) throw new RuntimeException("Negative share for $role = $fq");
    }
}

function ensureStringFlags($raw): array {
    if ($raw === null) {
        return [];
    }
    if (is_string($raw)) {
        $raw = [$raw];
    }
    if (!is_array($raw)) {
        throw new RuntimeException('cli_flags debe ser array de strings');
    }
    $flags = [];
    foreach ($raw as $flag) {
        if (!is_string($flag)) {
            throw new RuntimeException('cli_flags contiene valores no string');
        }
        $flags[] = $flag;
    }
    return $flags;
}

/**
 * @return array<string,int>
 */
function collectRoleCounts(array $heirs): array {
    $counts = [];
    foreach ($heirs as $heir) {
        if (!is_array($heir)) {
            continue;
        }

        $role = (string) ($heir['role'] ?? '');
        if ($role === '') {
            continue;
        }

        $count = (int) ($heir['count'] ?? 0);
        if ($count <= 0) {
            continue;
        }

        $counts[$role] = ($counts[$role] ?? 0) + $count;
    }

    return $counts;
}

function hasRole(array $counts, string $role): bool {
    return ($counts[$role] ?? 0) > 0;
}

function hasAnyRole(array $counts, array $roles): bool {
    foreach ($roles as $role) {
        if (hasRole($counts, $role)) {
            return true;
        }
    }

    return false;
}

function groupShareValue(array $out, string $role): ?string
{
    $groups = $out['group_shares'] ?? null;
    if (!is_array($groups)) {
        return null;
    }

    if (array_key_exists($role, $groups) && is_string($groups[$role])) {
        return $groups[$role];
    }

    static $fallbacks = [
        'sons' => ['son'],
        'daughters' => ['daughter'],
        'wives' => ['wife'],
        'full_brothers' => ['full_brother'],
        'full_sisters' => ['full_sister'],
        'consanguine_brothers' => ['consanguine_brother'],
        'consanguine_sisters' => ['consanguine_sister'],
        'uterine_brothers' => ['uterine_brother'],
        'uterine_sisters' => ['uterine_sister'],
        'uterine_siblings' => ['uterine_brothers', 'uterine_sisters', 'uterine_brother', 'uterine_sister'],
    ];

    foreach ($fallbacks[$role] ?? [] as $candidate) {
        if (array_key_exists($candidate, $groups) && is_string($groups[$candidate])) {
            return $groups[$candidate];
        }
    }

    return null;
}

function assertFractionEquals($raw, string $expected, string $label): void
{
    if (!is_string($raw)) {
        throw new RuntimeException(sprintf('FAIL: %s expected %s, got %s', $label, $expected, var_export($raw, true)));
    }

    [$p,$q] = parseFraction($raw);
    [$ep,$eq] = parseFraction($expected);
    if (!($p === $ep && $q === $eq)) {
        throw new RuntimeException(sprintf('FAIL: %s expected %s, got %s', $label, $expected, $raw));
    }
}

function assertZero(array $out, string $role, string $label): void
{
    $value = groupShareValue($out, $role);
    if ($value === null) {
        return;
    }

    [$p, $q] = parseFraction($value);
    if ($p !== 0) {
        throw new RuntimeException(sprintf('FAIL: %s expected %s to be 0/1, got %s', $label, $role, $value));
    }
}

function assertZeroAny(array $out, array $roles, string $label): void
{
    foreach ($roles as $role) {
        assertZero($out, $role, $label);
    }
}

function assertHas(array $out, string $role, string $label): void
{
    $value = groupShareValue($out, $role);
    if ($value === null) {
        throw new RuntimeException(sprintf('FAIL: %s missing expected role %s', $label, $role));
    }

    [$p, $q] = parseFraction($value);
    if ($p <= 0) {
        throw new RuntimeException(sprintf('FAIL: %s expected %s to receive positive share, got %s', $label, $role, $value));
    }
}

function recordCoverage(array $input): void
{
    global $coverage;

    $counts = collectRoleCounts($input['heirs'] ?? []);
    $roles = array_keys($counts);

    foreach ($roles as $role) {
        $coverage['role_present'][$role] = ($coverage['role_present'][$role] ?? 0) + 1;
    }

    $roleSet = array_fill_keys($roles, true);

    if (
        isset($roleSet['daughter'])
        && isset($roleSet['paternal_uncle'])
        && !isset($roleSet['son'])
        && !isset($roleSet['sons_son'])
        && !isset($roleSet['father'])
    ) {
        $coverage['combos']['daughter+paternal_uncle:!son:!father'] =
            ($coverage['combos']['daughter+paternal_uncle:!son:!father'] ?? 0) + 1;
    }

    if (isset($roleSet['father']) && isset($roleSet['paternal_grandfather'])) {
        $coverage['combos']['father+pgf'] = ($coverage['combos']['father+pgf'] ?? 0) + 1;
    }

    $siblingRoles = [
        'full_brother','full_sister','consanguine_brother','consanguine_sister',
        'uterine_brother','uterine_sister',
    ];

    if (isset($roleSet['son'])) {
        foreach ($siblingRoles as $sibling) {
            if (isset($roleSet[$sibling])) {
                $coverage['combos']['son+sibling'] = ($coverage['combos']['son+sibling'] ?? 0) + 1;
                break;
            }
        }
    }

    $wifeTotal = ($counts['wife'] ?? 0) + ($counts['wives'] ?? 0);
    if ($wifeTotal >= 2) {
        $coverage['combos']['wives>=2'] = ($coverage['combos']['wives>=2'] ?? 0) + 1;
    }

    $hasUterinePair = ($counts['uterine_brother'] ?? 0) > 0 && ($counts['uterine_sister'] ?? 0) > 0;
    if ($hasUterinePair) {
        $coverage['combos']['uterine_pair'] = ($coverage['combos']['uterine_pair'] ?? 0) + 1;
    }
}

function callEngine(array $input, string $phpBin): array {
    $payload = $input;
    $flags = ensureStringFlags($payload['cli_flags'] ?? []);
    unset($payload['cli_flags']);

    $cmd = escapeshellarg($phpBin)
        . ' -d auto_prepend_file=' . escapeshellarg(PREPEND_BOOTSTRAP)
        . ' ' . escapeshellarg(CALC_CLI) . ' --stdin';
    if ($flags !== []) {
        $cmd .= ' ' . implode(' ', array_map('escapeshellarg', $flags));
    }
    $desc = [['pipe','r'],['pipe','w'],['pipe','w']];
    $proc = proc_open($cmd, $desc, $pipes, dirname(CALC_CLI));
    if (!is_resource($proc)) throw new RuntimeException("proc_open failed");
    fwrite($pipes[0], json_encode($payload, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE));
    fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $err = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code = proc_close($proc);
    if ($code !== 0) {
        throw new RuntimeException("Engine exit=$code stderr=$err\ninput=".json_encode($input));
    }
    $json = json_decode($out, true);
    if (!is_array($json)) {
        throw new RuntimeException("Bad JSON output: $out");
    }
    return $json;
}

/** Generador aleatorio de herederos coherentes (entrada compacta ‘wife’ unifica ‘wives’). */
function genCase(): array {
    $roll = mt_rand(1, 20);
    if ($roll === 1) {
        return [
            'heirs' => [
                ['role' => 'daughter', 'count' => 1],
                ['role' => 'paternal_uncle', 'count' => 1],
            ],
            'cli_flags' => ['--audit', '--strict'],
        ];
    }

    if ($roll === 2) {
        return [
            'heirs' => [
                ['role' => 'wife', 'count' => 3],
                ['role' => 'son', 'count' => 1],
            ],
            'cli_flags' => ['--audit', '--strict'],
        ];
    }

    if ($roll === 3) {
        return [
            'heirs' => [
                ['role' => 'uterine_brother', 'count' => 1],
                ['role' => 'uterine_sister', 'count' => 1],
                ['role' => 'mother', 'count' => 1],
            ],
            'cli_flags' => ['--audit', '--strict'],
        ];
    }

    if ($roll === 4) {
        return [
            'heirs' => [
                ['role' => 'father', 'count' => 1],
                ['role' => 'paternal_grandfather', 'count' => 1],
                ['role' => 'mother', 'count' => 1],
            ],
            'cli_flags' => ['--audit', '--strict'],
        ];
    }

    // Universo de roles (ajusta si tu motor usa alias distintos)
    $universe = [
        'husband','wife',
        'father','mother','paternal_grandfather','maternal_grandmother','paternal_uncle',
        'son','daughter','sons_son','sons_daughter',
        'full_brother','full_sister','consanguine_brother','consanguine_sister',
        'uterine_brother','uterine_sister'
    ];

    $k = mt_rand(2, 6); // número de tipos a incluir (al menos 2 para forzar redistribución)
    $picked = [];
    while (count($picked) < $k) {
        $r = $universe[mt_rand(0, count($universe)-1)];
        $picked[$r] = true;
    }
    $roles = array_keys($picked);

    // Coherencia básica:
    if (in_array('husband',$roles,true) && in_array('wife',$roles,true)) {
        // rare: eliminar uno aleatoriamente
        if (mt_rand(0,1)===0) { $roles = array_values(array_diff($roles,['wife'])); } else { $roles = array_values(array_diff($roles,['husband'])); }
    }
    if (count($roles) === 1) {
        $roles[] = $roles[0] === 'husband' ? 'mother' : 'father';
    }

    if (!array_intersect(['son','sons_son'], $roles)) {
        $roles[] = mt_rand(0, 1) === 0 ? 'son' : 'sons_son';
    }
    // count (wives max 4)
    $heirs = [];
    foreach ($roles as $r) {
        $c = 1;
        if ($r === 'wife') $c = mt_rand(1, 4);
        if (in_array($r, ['son','daughter','sons_son','sons_daughter','full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister','paternal_uncle','paternal_uncles_daughter','paternal_uncle_son','paternal_uncle_sons_daughter'], true)) {
            $c = mt_rand(1, 3);
        }
        $heirs[] = ['role'=>$r,'count'=>$c];
    }
    return ['heirs'=>$heirs, 'cli_flags'=>['--audit','--strict']]; // audit para depurar
}

/** Propiedad P1: Σ=1/1 y no-negatividad */
function propertySumAndNonNegative(array $out): void {
    if (!isset($out['group_shares'])) throw new RuntimeException("Missing group_shares");
    nonNegative($out['group_shares']);

    $finalGroups = $out['shares']['final']['groups'] ?? null;
    if (is_array($finalGroups) && $finalGroups !== []) {
        [$p,$q] = sumShares($finalGroups);
    } else {
        [$p,$q] = sumShares($out['group_shares']);
    }
    if (!($p === 1 && $q === 1)) {
        throw new RuntimeException("Sum != 1/1, got $p/$q; out=".json_encode($out));
    }

    assertFractionEquals($out['sum_final'] ?? null, '1/1', 'sum_final');
}

/** Propiedad P2: determinismo (misma entrada ⇒ misma salida) */
function propertyDeterministic(array $input, array $out1, array $out2): void {
    if (json_encode($out1) !== json_encode($out2)) {
        throw new RuntimeException("Non-deterministic output for input=".json_encode($input));
    }
}

/** Propiedad P3: bloqueos canónicos */
function propertyCanonicalBlocks(array $counts, array $out): void
{
    if (hasAnyRole($counts, ['son', 'sons_son'])) {
        assertZeroAny($out, ['full_brothers', 'consanguine_brothers', 'uterine_brothers'], 'son_blocks_siblings');

        foreach (['full_sisters', 'consanguine_sisters'] as $sisterRole) {
            $value = groupShareValue($out, $sisterRole);
            if ($value === null) {
                continue;
            }

            [$p, $q] = parseFraction($value);
            if ($p > 0) {
                throw new RuntimeException(sprintf('Male descendant present; %s should be 0/1, got %s', $sisterRole, $value));
            }
        }
    }

    if (hasRole($counts, 'father') && hasRole($counts, 'paternal_grandfather')) {
        assertZero($out, 'paternal_grandfather', 'father_blocks_pgf');
    }
}

function propertyAsabaCollateral(array $counts, array $out): void
{
    if (!hasRole($counts, 'daughter')) {
        return;
    }

    if (!hasRole($counts, 'paternal_uncle')) {
        return;
    }

    if (hasAnyRole($counts, ['son', 'sons_son', 'father'])) {
        return;
    }

    assertHas($out, 'paternal_uncle', 'asabah_collateral_present');

    $roleSet = array_keys(array_filter($counts, static fn (int $count): bool => $count > 0));
    sort($roleSet);
    if ($roleSet !== ['daughter', 'paternal_uncle']) {
        return;
    }

    $daughterShare = groupShareValue($out, 'daughters');
    $uncleShare = groupShareValue($out, 'paternal_uncle');
    if ($daughterShare === null || $uncleShare === null) {
        throw new RuntimeException('FAIL: asabah_collateral_daughter_uncle (missing shares)');
    }

    [$dNum, $dDen] = parseFraction($daughterShare);
    [$uNum, $uDen] = parseFraction($uncleShare);

    if ($counts['daughter'] === 1) {
        if (!($dNum === 1 && $dDen === 2 && $uNum === 1 && $uDen === 2)) {
            throw new RuntimeException('FAIL: asabah_collateral_daughter_uncle (1 daughter)');
        }

        return;
    }

    if (!($dNum === 2 && $dDen === 3 && $uNum === 1 && $uDen === 3)) {
        throw new RuntimeException('FAIL: asabah_collateral_daughter_uncle (multi daughters)');
    }
}

$fail = 0;
for ($i=1; $i <= $N; $i++) {
    $input = genCase();
    recordCoverage($input);

    $roleCounts = collectRoleCounts($input['heirs'] ?? []);

    // 2 ejecuciones para determinismo
    $o1 = callEngine($input, $PHP);
    $o2 = callEngine($input, $PHP);

    try {
        propertySumAndNonNegative($o1);
        propertyDeterministic($input, $o1, $o2);
        propertyCanonicalBlocks($roleCounts, $o1);
        propertyAsabaCollateral($roleCounts, $o1);
    } catch (\Throwable $ex) {
        $fail++;
        fwrite(STDERR, "[FAIL #$i] ".$ex->getMessage().PHP_EOL);
        fwrite(STDERR, "Input: ".json_encode($input).PHP_EOL);
        // Si falla, corta pronto:
        break;
    }

    if (($i % 50) === 0) {
        fwrite(STDERR, "…$i OK".PHP_EOL);
    }
}

ksort($coverage['role_present']);
ksort($coverage['combos']);

if ($fail === 0) {
    echo "FUZZ OK: $N cases passed (seed=$SEED)".PHP_EOL;
    echo "COVERAGE: " . json_encode($coverage, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;

    $missing = [];
    foreach ($criticalCombos as $combo) {
        if (($coverage['combos'][$combo] ?? 0) === 0) {
            $missing[] = $combo;
        }
    }

    if ($missing !== []) {
        fwrite(STDERR, 'Missing critical combos: '.implode(', ', $missing).PHP_EOL);
        exit(2);
    }

    exit(0);
}

echo "COVERAGE: " . json_encode($coverage, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
exit(1);
