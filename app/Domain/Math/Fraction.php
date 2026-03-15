<?php

declare(strict_types=1);

namespace App\Domain\Math;

use InvalidArgumentException;

final class Fraction
{
    public readonly string $num;
    public readonly string $den;

    private function __construct(int|string $num, int|string $den)
    {
        $normalizedNum = self::normalize((string) $num);
        $normalizedDen = self::normalize((string) $den);

        if ($normalizedDen === '0') {
            throw new InvalidArgumentException('Denominator cannot be zero.');
        }

        if ($normalizedNum === '0') {
            $this->num = '0';
            $this->den = '1';

            return;
        }

        if (self::isNegative($normalizedDen)) {
            $normalizedNum = self::negate($normalizedNum);
            $normalizedDen = self::negate($normalizedDen);
        }

        $gcd = self::gcd($normalizedNum, $normalizedDen);
        $this->num = self::divExact($normalizedNum, $gcd);
        $this->den = self::divExact($normalizedDen, $gcd);
    }

    public static function fromString(string $s): self
    {
        $value = trim($s);
        if ($value === '') {
            throw new InvalidArgumentException('Fraction string cannot be empty.');
        }

        if (str_contains($value, '/')) {
            [$rawNum, $rawDen] = array_map('trim', explode('/', $value, 2));
            if ($rawNum === '' || $rawDen === '') {
                throw new InvalidArgumentException(sprintf('Invalid fraction format "%s".', $s));
            }

            $num = self::parseInt($rawNum, 'numerator');
            $den = self::parseInt($rawDen, 'denominator');

            return new self($num, $den);
        }

        $num = self::parseInt($value, 'integer');

        return new self($num, '1');
    }

    /**
     * @param int|string $num
     * @param int|string $den
     */
    public static function fromInts(int|string $num, int|string $den = 1): self
    {
        return new self($num, $den);
    }

    public static function fromInt(int $value): self
    {
        return new self($value, '1');
    }

    public static function zero(): self
    {
        return new self('0', '1');
    }

    public static function one(): self
    {
        return new self('1', '1');
    }

    public function add(self $b): self
    {
        if ($this->num === '0') {
            return $b;
        }

        if ($b->num === '0') {
            return $this;
        }

        $lcm = self::lcm($this->den, $b->den);
        $scaledA = self::mulStrings($this->num, self::divExact($lcm, $this->den));
        $scaledB = self::mulStrings($b->num, self::divExact($lcm, $b->den));
        $sum = self::addStrings($scaledA, $scaledB);

        return new self($sum, $lcm);
    }

    public function sub(self $b): self
    {
        return $this->add(new self(self::negate($b->num), $b->den));
    }

    public function mul(self $b): self
    {
        if ($this->num === '0' || $b->num === '0') {
            return self::zero();
        }

        $gcd1 = self::gcd($this->num, $b->den);
        $gcd2 = self::gcd($b->num, $this->den);

        $leftNum = self::divExact($this->num, $gcd1);
        $rightNum = self::divExact($b->num, $gcd2);
        $leftDen = self::divExact($this->den, $gcd2);
        $rightDen = self::divExact($b->den, $gcd1);

        $num = self::mulStrings($leftNum, $rightNum);
        $den = self::mulStrings($leftDen, $rightDen);

        return new self($num, $den);
    }

    public function div(self $b): self
    {
        if ($b->num === '0') {
            throw new InvalidArgumentException('Division by zero.');
        }

        $reciprocal = new self($b->den, $b->num);

        return $this->mul($reciprocal);
    }

    public function reduce(): self
    {
        return $this;
    }

    public function eq(self $b): bool
    {
        return $this->equals($b);
    }

    public function lte(self $other): bool
    {
        return $this->compareTo($other) <= 0;
    }

    public function equals(self $b): bool
    {
        return $this->num === $b->num && $this->den === $b->den;
    }

    public function isZero(): bool
    {
        return $this->num === '0';
    }

    public function compareTo(self $other): int
    {
        if ($this->num === $other->num && $this->den === $other->den) {
            return 0;
        }

        $left = self::mulStrings($this->num, $other->den);
        $right = self::mulStrings($other->num, $this->den);

        return self::compareStrings($left, $right);
    }

    public function toFloat(): float
    {
        if (function_exists('bcdiv')) {
            return (float) bcdiv($this->num, $this->den, 12);
        }

        return (float) ((int) $this->num / (int) $this->den);
    }

    public function asString(): string
    {
        return sprintf('%s/%s', $this->num, $this->den);
    }

    public function __toString(): string
    {
        return $this->asString();
    }

    private static function parseInt(string $value, string $label): string
    {
        if (!preg_match('/^[+-]?\d+$/', $value)) {
            throw new InvalidArgumentException(sprintf('Invalid %s "%s".', $label, $value));
        }

        return self::normalize($value);
    }

    private static function gcd(int|string $a, int|string $b): string
    {
        $left = self::abs((string) $a);
        $right = self::abs((string) $b);

        if ($left === '0') {
            return $right === '0' ? '1' : $right;
        }

        while ($right !== '0') {
            $tmp = $right;
            $right = self::mod($left, $right);
            $left = $tmp;
        }

        return $left;
    }

    private static function lcm(string $a, string $b): string
    {
        if ($a === '0' || $b === '0') {
            return '0';
        }

        $gcd = self::gcd($a, $b);
        $divided = self::divExact($a, $gcd);

        return self::mulStrings($divided, $b);
    }

    private static function abs(string $value): string
    {
        return self::isNegative($value) ? substr($value, 1) : $value;
    }

    private static function isNegative(string $value): bool
    {
        return str_starts_with($value, '-');
    }

    private static function negate(string $value): string
    {
        if ($value === '0') {
            return '0';
        }

        return self::isNegative($value) ? substr($value, 1) : '-' . $value;
    }

    private static function addStrings(string $a, string $b): string
    {
        if (function_exists('bcadd')) {
            return self::normalize(bcadd($a, $b, 0));
        }

        return self::normalize((string) ((int) $a + (int) $b));
    }

    private static function mulStrings(string $a, string $b): string
    {
        if (function_exists('bcmul')) {
            return self::normalize(bcmul($a, $b, 0));
        }

        return self::normalize((string) ((int) $a * (int) $b));
    }

    private static function divExact(string $a, string $b): string
    {
        if ($b === '0') {
            throw new InvalidArgumentException('Division by zero.');
        }

        if (function_exists('bcdiv')) {
            $result = bcdiv($a, $b, 0);
            if (self::mulStrings($result, $b) !== self::normalize($a)) {
                throw new InvalidArgumentException('Non exact division in Fraction.');
            }

            return self::normalize($result);
        }

        if ((int) $b === 0) {
            throw new InvalidArgumentException('Division by zero.');
        }

        if ((int) $a % (int) $b !== 0) {
            throw new InvalidArgumentException('Non exact division in Fraction.');
        }

        return self::normalize((string) intdiv((int) $a, (int) $b));
    }

    private static function mod(string $a, string $b): string
    {
        if ($b === '0') {
            throw new InvalidArgumentException('Modulo by zero.');
        }

        if (function_exists('bcmod')) {
            $mod = bcmod($a, $b);
            if ($mod === '0') {
                return '0';
            }

            if (self::isNegative($mod)) {
                $mod = bcadd($mod, $b, 0);
            }

            return self::normalize($mod);
        }

        $intB = (int) $b;
        if ($intB === 0) {
            throw new InvalidArgumentException('Modulo by zero.');
        }

        $mod = (int) $a % $intB;
        if ($mod < 0) {
            $mod += abs($intB);
        }

        return self::normalize((string) $mod);
    }

    private static function compareStrings(string $a, string $b): int
    {
        if (function_exists('bccomp')) {
            return bccomp($a, $b, 0);
        }

        $intA = (int) $a;
        $intB = (int) $b;

        return $intA <=> $intB;
    }

    private static function normalize(string $value): string
    {
        $trimmed = ltrim($value);
        if ($trimmed === '') {
            return '0';
        }

        $sign = '';
        if ($trimmed[0] === '+' || $trimmed[0] === '-') {
            $sign = $trimmed[0];
            $trimmed = substr($trimmed, 1);
        }

        $trimmed = ltrim($trimmed, '0');
        if ($trimmed === '' || $trimmed === false) {
            return '0';
        }

        if ($sign === '-') {
            return '-' . $trimmed;
        }

        return $trimmed;
    }
}
