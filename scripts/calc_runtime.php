<?php
declare(strict_types=1);

/**
 * calc_runtime.php
 * Bootstrap de runtime para hosting sin Composer.
 * - Si existe vendor/autoload.php, úsalo.
 * - Si no, autoloader PSR-4 mínimo para App\*.
 */

// 1) Composer si está disponible
$composer = __DIR__ . '/../vendor/autoload.php';
if (is_file($composer)) {
    require_once $composer;
}

// 2) Fallback PSR-4 mínimo (para hosting sin Composer)
$projectRoot = realpath(__DIR__ . '/..');
$appDir     = $projectRoot . '/app';
$scriptsDir = $projectRoot . '/scripts';

if (!class_exists('Composer\\Autoload\\ClassLoader', false)) {
    spl_autoload_register(function (string $class) use ($appDir, $scriptsDir) {
        if (strncmp($class, 'App\\', 4) !== 0) return;
        $rel = str_replace('\\', '/', $class) . '.php';
        $path = (strncmp($rel, 'App/Scripts/', 12) === 0)
            ? $scriptsDir . '/' . substr($rel, 12)
            : $appDir     . '/' . substr($rel, 4);
        if (is_file($path)) require_once $path;
    });
}

$_ENV['EMIT_BAYT_AL_MAL'] = $_ENV['EMIT_BAYT_AL_MAL'] ?? '0';

