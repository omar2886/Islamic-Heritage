#!/usr/bin/env php
<?php

declare(strict_types=1);

require_once __DIR__ . '/MiniTestCase.php';

$pattern = __DIR__ . '/*Test.php';
$files = glob($pattern) ?: [];
sort($files);

foreach ($files as $file) {
    require_once $file;
}

$declared = get_declared_classes();
$tests = array_filter(
    $declared,
    static fn (string $class): bool => is_subclass_of($class, MiniTestCase::class)
);
sort($tests);

$totalTests = 0;
$failures = 0;

foreach ($tests as $class) {
    $instance = new $class();
    $methods = array_filter(
        get_class_methods($instance),
        static fn (string $method): bool => str_starts_with($method, 'test')
    );
    sort($methods);

    foreach ($methods as $method) {
        $totalTests++;
        $instance->resetAssertions();
        try {
            $instance->$method();
            printf("[OK] %s::%s (%d assertions)\n", $class, $method, $instance->getAssertionCount());
        } catch (MiniTestAssertionFailed $failure) {
            $failures++;
            fprintf(STDERR, "[FAIL] %s::%s %s\n", $class, $method, $failure->getMessage());
        } catch (Throwable $throwable) {
            $failures++;
            fprintf(STDERR, "[ERROR] %s::%s %s\n", $class, $method, $throwable->getMessage());
        }
    }
}

printf("\nTests: %d, Failures: %d\n", $totalTests, $failures);

exit($failures > 0 ? 1 : 0);
