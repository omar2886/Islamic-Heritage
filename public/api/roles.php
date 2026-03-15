<?php declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__.'/../../scripts/calc_runtime.php';

use App\Domain\RolesCatalog;

$roles = RolesCatalog::heirRoles();

echo json_encode([
    'ok' => true,
    'roles' => $roles,
    'count' => count($roles),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
