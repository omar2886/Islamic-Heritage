<?php

declare(strict_types=1);

require_once __DIR__ . '/TestHarness.php';

class MiniTestAssertionFailed extends RuntimeException
{
}

abstract class MiniTestCase
{
    private int $assertions = 0;

    protected function assertSame(mixed $expected, mixed $actual, string $message = ''): void
    {
        if ($expected !== $actual) {
            $defaultMessage = sprintf('Failed asserting that %s is identical to %s.', $this->exportValue($actual), $this->exportValue($expected));
            throw new MiniTestAssertionFailed($message !== '' ? $message : $defaultMessage);
        }

        $this->assertions++;
    }

    public function getAssertionCount(): int
    {
        return $this->assertions;
    }

    public function resetAssertions(): void
    {
        $this->assertions = 0;
    }

    private function exportValue(mixed $value): string
    {
        if (is_scalar($value) || $value === null) {
            return var_export($value, true);
        }

        if (is_array($value)) {
            return 'array(' . count($value) . ')';
        }

        if (is_object($value)) {
            return 'object(' . get_class($value) . ')';
        }

        return gettype($value);
    }
}
