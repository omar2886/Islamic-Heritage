<?php declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__.'/../../scripts/calc_runtime.php';

use App\Domain\RolesCatalog;

echo json_encode(['roles' => RolesCatalog::all()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
