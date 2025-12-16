<?php
declare(strict_types=1);
require_once __DIR__ . '/_guard.php';

// CORS/cache básico (opcional)
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../../scripts/calc_lib.php'; // expone calc_from_array()

function param(string $k, $def) {
    return isset($_GET[$k]) ? $_GET[$k] : $def;
}

$cases = max(1, (int) param('cases', 300));
$seed  = (int) param('seed', 42);

@ini_set('max_execution_time', '600');
@ini_set('memory_limit', '512M');
mt_srand($seed);

// Utilidades fracciones (idénticas al fuzz CLI)
function gcd_int(int $a, int $b): int { $a=abs($a); $b=abs($b); while ($b) { $t=$b; $b=$a%$b; $a=$t; } return $a ?: 1; }
function parse_frac(string $s): array {
    if (!preg_match('#^-?\d+/\d+$#', $s)) throw new RuntimeException("Bad fraction: $s");
    [$p,$q] = array_map('intval', explode('/',$s));
    if ($q===0) throw new RuntimeException("Zero denominator");
    $g=gcd_int($p,$q);
    return [$p/$g,$q/$g];
}
function frac_add(array $a, array $b): array {
    [$p1,$q1]=$a; [$p2,$q2]=$b; $p=$p1*$q2+$p2*$q1; $q=$q1*$q2; $g=gcd_int($p,$q); return [$p/$g,$q/$g];
}
function sum_shares(array $gs): array { $s=[0,1]; foreach ($gs as $fq) { $s=frac_add($s, parse_frac($fq)); } return $s; }

// Generador coherente (idéntico al CLI fuzz, sin shell)
function gen_case(): array {
    $U = [
        'husband','wife',
        'father','mother','paternal_grandfather','maternal_grandmother',
        'son','daughter','sons_son','sons_daughter',
        'full_brother','full_sister','consanguine_brother','consanguine_sister',
        'uterine_brother','uterine_sister',
        'paternal_uncle','paternal_uncles_daughter',
        'paternal_uncle_son','paternal_uncle_sons_daughter'
    ];
    $k = mt_rand(1, 6);
    $pick = [];
    while (count($pick)<$k) { $pick[$U[mt_rand(0,count($U)-1)]] = true; }
    $roles = array_keys($pick);
    if (in_array('husband',$roles,true) && in_array('wife',$roles,true)) {
        if (mt_rand(0,1)===0) { $roles = array_values(array_diff($roles,['wife'])); }
        else                  { $roles = array_values(array_diff($roles,['husband'])); }
    }
    $heirs=[];
    foreach ($roles as $r) {
        $c=1;
        if ($r==='wife') $c = mt_rand(1,4);
        if (in_array($r, ['son','daughter','sons_son','sons_daughter','full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister','paternal_uncle','paternal_uncles_daughter','paternal_uncle_son','paternal_uncle_sons_daughter'], true)) {
            $c = mt_rand(1,3);
        }
        $heirs[]=['role'=>$r,'count'=>$c];
    }
    return ['heirs'=>$heirs, 'cli_flags'=>['--audit']]; // audit útil para depurar
}

// Propiedades (Σ=1, no-negatividad, determinismo, bloqueos)
function property_sum_nonneg(array $out) {
    if (!isset($out['group_shares'])) throw new RuntimeException('Missing group_shares');
    foreach ($out['group_shares'] as $role=>$fq) {
        [$p,$q]=parse_frac($fq);
        if ($p<0) throw new RuntimeException("Negative share for $role=$fq");
    }
    $finalGroups = $out['shares']['final']['groups'] ?? null;
    if (is_array($finalGroups) && $finalGroups !== []) {
        [$p,$q]=sum_shares($finalGroups);
    } else {
        [$p,$q]=sum_shares($out['group_shares']);
    }
    if (!($p===1 && $q===1)) throw new RuntimeException("Sum != 1/1 got $p/$q");
}
function property_deterministic(array $in) {
    $o1 = calc_from_array($in);
    $o2 = calc_from_array($in);
    if (json_encode($o1) !== json_encode($o2)) {
        throw new RuntimeException('Non-deterministic output for input='.json_encode($in));
    }
}
function property_blocks(array $in, array $out) {
    $roles = array_column($in['heirs'],'role');
    $hasMaleDesc = in_array('son',$roles,true) || in_array('sons_son',$roles,true);
    $gs = $out['group_shares'] ?? [];
    if ($hasMaleDesc) {
        foreach (['full_brother','consanguine_brother','full_sister','consanguine_sister'] as $sib) {
            if (isset($gs[$sib])) {
                [$p,$q]=parse_frac($gs[$sib]);
                if ($p>0) throw new RuntimeException("Male descendant present; $sib must be 0/1, got {$gs[$sib]}");
            }
        }
    }
    if (in_array('father',$roles,true) && isset($gs['paternal_grandfather'])) {
        [$p,$q]=parse_frac($gs['paternal_grandfather']);
        if ($p>0) throw new RuntimeException("Father present; PGF must be 0/1, got {$gs['paternal_grandfather']}");
    }
}

// HTML minimal
echo "<h1>Web Fuzz</h1>";
echo "<p>cases=$cases seed=$seed</p>";
echo "<pre>";

$ok = 0;
for ($i=1; $i<=$cases; $i++) {
    $input = gen_case();
    $out   = calc_from_array($input);

    // P1
    property_sum_nonneg($out);
    // P2
    property_deterministic($input);
    // P3
    property_blocks($input, $out);

    $ok++;
    if (($i % 50) === 0) {
        echo "…$i OK\n";
        @ob_flush(); @flush();
    }
}
echo "FUZZ OK: $ok cases passed (seed=$seed)\n";
echo "</pre>";
