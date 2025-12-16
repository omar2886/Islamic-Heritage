<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$autoload = $root . '/vendor/autoload.php';
if (is_file($autoload)) {
    require_once $autoload;
}
require_once $root . '/app/Domain/Math/Fraction.php';

use App\Domain\Math\Fraction;

$raw = stream_get_contents(STDIN);
if ($raw === false) {
    fwrite(STDERR, "[ERROR] Failed to read fraction cases input\n");
    exit(2);
}

$cases = json_decode($raw, true);
if (!is_array($cases)) {
    fwrite(STDERR, "[ERROR] Invalid fraction cases payload\n");
    exit(2);
}

$passes = 0;
$failures = [];
$total = count($cases);

foreach ($cases as $index => $case) {
    if (!is_array($case)) {
        $failures[] = sprintf('[FAIL] Case at index %d is not an object.', $index);
        continue;
    }

    $id = isset($case['id']) ? (string) $case['id'] : sprintf('case_%d', $index);
    $operation = isset($case['operation']) ? (string) $case['operation'] : '';
    if ($operation === '') {
        $failures[] = sprintf('[FAIL] %s missing operation.', $id);
        continue;
    }

    $expectedException = $case['expect_exception'] ?? null;

    try {
        switch ($operation) {
            case 'parse':
                if (!array_key_exists('value', $case)) {
                    throw new \RuntimeException('Missing "value" for parse operation.');
                }
                $fraction = Fraction::fromString((string) $case['value']);
                if ($expectedException !== null) {
                    $failures[] = sprintf('[FAIL] %s expected exception %s but none thrown.', $id, $expectedException);
                    break;
                }
                if (!array_key_exists('expected', $case)) {
                    throw new \RuntimeException('Missing "expected" for parse operation.');
                }
                $expected = (string) $case['expected'];
                $actual = $fraction->asString();
                if ($actual !== $expected) {
                    $failures[] = sprintf('[FAIL] %s expected %s got %s.', $id, $expected, $actual);
                } else {
                    $passes++;
                }
                break;
            case 'add':
            case 'sub':
            case 'mul':
            case 'div':
                if (!array_key_exists('a', $case) || !array_key_exists('b', $case)) {
                    throw new \RuntimeException('Missing operands for arithmetic operation.');
                }
                $a = Fraction::fromString((string) $case['a']);
                $b = Fraction::fromString((string) $case['b']);
                $result = match ($operation) {
                    'add' => $a->add($b),
                    'sub' => $a->sub($b),
                    'mul' => $a->mul($b),
                    'div' => $a->div($b),
                    default => throw new \RuntimeException('Unsupported arithmetic operation.'),
                };
                if ($expectedException !== null) {
                    $failures[] = sprintf('[FAIL] %s expected exception %s but none thrown.', $id, $expectedException);
                    break;
                }
                if (!array_key_exists('expected', $case)) {
                    throw new \RuntimeException('Missing "expected" for arithmetic operation.');
                }
                $expected = (string) $case['expected'];
                $actual = $result->asString();
                if ($actual !== $expected) {
                    $failures[] = sprintf('[FAIL] %s expected %s got %s.', $id, $expected, $actual);
                } else {
                    $passes++;
                }
                break;
            case 'reduce':
                if (!array_key_exists('value', $case)) {
                    throw new \RuntimeException('Missing "value" for reduce operation.');
                }
                if (!array_key_exists('expected', $case)) {
                    throw new \RuntimeException('Missing "expected" for reduce operation.');
                }
                $fraction = Fraction::fromString((string) $case['value']);
                $actual = $fraction->reduce()->asString();
                $expected = (string) $case['expected'];
                if ($expectedException !== null) {
                    $failures[] = sprintf('[FAIL] %s expected exception %s but none thrown.', $id, $expectedException);
                    break;
                }
                if ($actual !== $expected) {
                    $failures[] = sprintf('[FAIL] %s expected %s got %s.', $id, $expected, $actual);
                } else {
                    $passes++;
                }
                break;
            case 'compare':
                if (!array_key_exists('a', $case) || !array_key_exists('b', $case)) {
                    throw new \RuntimeException('Missing operands for compare operation.');
                }
                if (!array_key_exists('expected', $case)) {
                    throw new \RuntimeException('Missing "expected" for compare operation.');
                }
                $a = Fraction::fromString((string) $case['a']);
                $b = Fraction::fromString((string) $case['b']);
                $actual = $a->compareTo($b);
                if ($expectedException !== null) {
                    $failures[] = sprintf('[FAIL] %s expected exception %s but none thrown.', $id, $expectedException);
                    break;
                }
                $expected = (int) $case['expected'];
                if ($actual !== $expected) {
                    $failures[] = sprintf('[FAIL] %s expected %d got %d.', $id, $expected, $actual);
                } else {
                    $passes++;
                }
                break;
            case 'to_float':
                if (!array_key_exists('value', $case)) {
                    throw new \RuntimeException('Missing "value" for to_float operation.');
                }
                if (!array_key_exists('expected', $case)) {
                    throw new \RuntimeException('Missing "expected" for to_float operation.');
                }
                $fraction = Fraction::fromString((string) $case['value']);
                if ($expectedException !== null) {
                    $failures[] = sprintf('[FAIL] %s expected exception %s but none thrown.', $id, $expectedException);
                    break;
                }
                $expected = (float) $case['expected'];
                $actual = $fraction->toFloat();
                $tolerance = isset($case['tolerance']) ? (float) $case['tolerance'] : 1e-9;
                if (abs($actual - $expected) > $tolerance) {
                    $failures[] = sprintf('[FAIL] %s expected %.12F got %.12F (tolerance %.12F).', $id, $expected, $actual, $tolerance);
                } else {
                    $passes++;
                }
                break;
            default:
                throw new \RuntimeException(sprintf('Unknown fraction operation "%s".', $operation));
        }
    } catch (\Throwable $throwable) {
        if ($expectedException === null) {
            $failures[] = sprintf('[ERROR] %s unexpected exception: %s', $id, $throwable->getMessage());
            continue;
        }

        $expectedClass = $expectedException;
        if ($throwable instanceof $expectedClass) {
            $passes++;
        } else {
            $failures[] = sprintf('[FAIL] %s expected %s got %s.', $id, $expectedClass, get_class($throwable));
        }
    }
}

echo sprintf("Fraction cases: %d/%d passed\n", $passes, $total);

if ($failures !== []) {
    foreach ($failures as $failure) {
        fwrite(STDERR, $failure . PHP_EOL);
    }
    exit(1);
}

exit(0);
