<?php declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__.'/../../scripts/calc_runtime.php';
$cls = 'App\\Domain\\Normalization\\HeirRole';
if (!class_exists($cls)) { echo json_encode(['roles'=>[]]); exit; }
$ref = new ReflectionClass($cls);
$consts = array_values(array_unique(array_values($ref->getConstants())));
sort($consts);
echo json_encode(['roles'=>$consts], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
