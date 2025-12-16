<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Math\Fraction;
use InvalidArgumentException;

final class MoneyAllocator
{
    /**
     * @param array<array-key,Fraction> $fractions
     * @return array<array-key,string>
     */
    public static function allocate(array $fractions, string $estate, int $scale = 2): array
    {
        if ($scale < 0) {
            throw new InvalidArgumentException('Scale must be non-negative.');
        }

        if ($fractions === []) {
            return [];
        }

        $estateUnits = self::scaleToInteger($estate, $scale);

        $allocations = [];
        $sum = '0';
        foreach ($fractions as $key => $fraction) {
            if (!$fraction instanceof Fraction) {
                throw new InvalidArgumentException('All shares must be Fraction instances.');
            }

            $amountUnits = self::allocateShare($fraction, $estateUnits);
            $allocations[$key] = $amountUnits;
            $sum = self::bcAdd($sum, $amountUnits, 0);
        }

        $lastKey = array_key_last($allocations);
        if ($lastKey !== null) {
            $delta = self::bcSub($estateUnits, $sum, 0);
            if ($delta !== '0') {
                $allocations[$lastKey] = self::bcAdd($allocations[$lastKey], $delta, 0);
            }
        }

        return array_map(static fn (string $units): string => self::formatUnits($units, $scale), $allocations);
    }

    private static function allocateShare(Fraction $share, string $estateUnits): string
    {
        if ($estateUnits === '0' || $share->isZero()) {
            return '0';
        }

        $product = self::bcMul($estateUnits, $share->num, 0);
        [$quotient, $remainder] = self::divMod($product, $share->den);

        return self::roundHalfEven($quotient, $remainder, $share->den);
    }

    /**
     * @return array{0:string,1:string}
     */
    private static function divMod(string $value, string $divisor): array
    {
        if ($divisor === '0') {
            throw new InvalidArgumentException('Division by zero in money allocation.');
        }

        $quotient = self::bcDiv($value, $divisor, 0);
        $remainder = self::bcMod($value, $divisor);

        if ($remainder === null) {
            $remainder = '0';
        }

        return [$quotient, $remainder];
    }

    private static function roundHalfEven(string $quotient, string $remainder, string $denominator): string
    {
        if ($remainder === '0') {
            return $quotient;
        }

        $twiceRemainder = self::bcMul($remainder, '2', 0);
        $comparison = self::bcComp($twiceRemainder, $denominator, 0);

        if ($comparison === 1) {
            return self::bcAdd($quotient, '1', 0);
        }

        if ($comparison === -1) {
            return $quotient;
        }

        $absQuotient = $quotient;
        if ($absQuotient !== '' && $absQuotient[0] === '-') {
            $absQuotient = substr($absQuotient, 1);
        }

        $lastDigit = $absQuotient === '' ? 0 : (int) substr($absQuotient, -1);
        if ($lastDigit % 2 !== 0) {
            return self::bcAdd($quotient, '1', 0);
        }

        return $quotient;
    }

    private static function scaleToInteger(string $amount, int $scale): string
    {
        $value = trim($amount);
        if ($value === '') {
            throw new InvalidArgumentException('Estate value cannot be empty.');
        }

        $negative = false;
        $first = $value[0];
        if ($first === '-' || $first === '+') {
            $negative = $first === '-';
            $value = substr($value, 1);
        }

        if ($value === '' || !preg_match('/^\d+(?:\.\d+)?$/', $value)) {
            throw new InvalidArgumentException(sprintf('Invalid estate value "%s".', $amount));
        }

        [$integerPart, $fractionPart] = array_pad(explode('.', $value, 2), 2, '');
        $integerPart = ltrim($integerPart, '0');
        if ($integerPart === '' || $integerPart === false) {
            $integerPart = '0';
        }

        $fractionForRounding = $fractionPart;
        if (strlen($fractionForRounding) <= $scale) {
            $fractionForRounding = str_pad($fractionForRounding, $scale + 1, '0');
        }

        $roundDigitChar = $fractionForRounding[$scale] ?? '0';
        $roundDigit = (int) $roundDigitChar;
        $tail = substr($fractionForRounding, $scale + 1);
        $hasNonZeroTail = $tail !== '' && strspn($tail, '0') !== strlen($tail);

        $fractionScaled = $scale > 0 ? substr($fractionForRounding, 0, $scale) : '';
        if ($scale > 0) {
            $fractionScaled = str_pad($fractionScaled, $scale, '0');
        }

        $combined = $integerPart . $fractionScaled;
        $combined = ltrim($combined, '0');
        if ($combined === '' || $combined === false) {
            $combined = '0';
        }

        $roundUp = false;
        if ($roundDigit > 5) {
            $roundUp = true;
        } elseif ($roundDigit < 5) {
            $roundUp = false;
        } else { // exactly 5
            if ($hasNonZeroTail) {
                $roundUp = true;
            } else {
                $lastDigit = (int) substr($combined, -1);
                $roundUp = $lastDigit % 2 !== 0;
            }
        }

        if ($roundUp) {
            $combined = self::bcAdd($combined, '1', 0);
        }

        if ($negative && $combined !== '0') {
            $combined = '-' . $combined;
        }

        return $combined;
    }

    private static function formatUnits(string $units, int $scale): string
    {
        if ($scale === 0) {
            return $units;
        }

        $negative = false;
        if ($units !== '' && $units[0] === '-') {
            $negative = true;
            $units = substr($units, 1);
        }

        $units = ltrim($units, '0');
        if ($units === '' || $units === false) {
            $units = '0';
        }

        $length = strlen($units);
        if ($length <= $scale) {
            $integer = '0';
            $fraction = str_pad($units, $scale, '0', STR_PAD_LEFT);
        } else {
            $integer = substr($units, 0, $length - $scale);
            $fraction = substr($units, -$scale);
        }

        $result = $integer . '.' . $fraction;
        $isZero = ($integer === '0' && $fraction === str_repeat('0', $scale));

        if ($negative && !$isZero) {
            $result = '-' . $result;
        }

        return $result;
    }

    private static function bcAdd(string $a, string $b, int $scale = 0): string
    {
        if (function_exists('bcadd')) {
            return \bcadd($a, $b, $scale);
        }

        self::assertZeroScale($scale, __FUNCTION__);

        return self::addIntegers($a, $b);
    }

    private static function bcSub(string $a, string $b, int $scale = 0): string
    {
        if (function_exists('bcsub')) {
            return \bcsub($a, $b, $scale);
        }

        self::assertZeroScale($scale, __FUNCTION__);

        return self::addIntegers($a, self::negate($b));
    }

    private static function bcMul(string $a, string $b, int $scale = 0): string
    {
        if (function_exists('bcmul')) {
            return \bcmul($a, $b, $scale);
        }

        self::assertZeroScale($scale, __FUNCTION__);

        $sign = self::isNegative($a) xor self::isNegative($b) ? '-' : '';
        $absA = self::absValue($a);
        $absB = self::absValue($b);

        if ($absA === '0' || $absB === '0') {
            return '0';
        }

        $result = self::mulAbs($absA, $absB);

        return $sign === '-' ? '-' . $result : $result;
    }

    private static function bcDiv(string $a, string $b, int $scale = 0): string
    {
        if (function_exists('bcdiv')) {
            return \bcdiv($a, $b, $scale);
        }

        self::assertZeroScale($scale, __FUNCTION__);

        [$quotient] = self::divModIntegers($a, $b);

        return $quotient;
    }

    private static function bcMod(string $a, string $b): string
    {
        if (function_exists('bcmod')) {
            $mod = \bcmod($a, $b);

            return $mod ?? '0';
        }

        [, $remainder] = self::divModIntegers($a, $b);

        return $remainder;
    }

    private static function bcComp(string $a, string $b, int $scale = 0): int
    {
        if (function_exists('bccomp')) {
            return \bccomp($a, $b, $scale);
        }

        self::assertZeroScale($scale, __FUNCTION__);

        return self::compareIntegers($a, $b);
    }

    private static function assertZeroScale(int $scale, string $fn): void
    {
        if ($scale !== 0) {
            throw new InvalidArgumentException(sprintf('%s fallback only supports scale 0.', $fn));
        }
    }

    private static function addIntegers(string $a, string $b): string
    {
        $negativeA = self::isNegative($a);
        $negativeB = self::isNegative($b);
        $absA = self::absValue($a);
        $absB = self::absValue($b);

        if ($negativeA === $negativeB) {
            $sum = self::addAbs($absA, $absB);

            return $negativeA ? self::negate($sum) : $sum;
        }

        $cmp = self::compareAbs($absA, $absB);
        if ($cmp === 0) {
            return '0';
        }

        if ($cmp > 0) {
            $diff = self::subAbs($absA, $absB);

            return $negativeA ? self::negate($diff) : $diff;
        }

        $diff = self::subAbs($absB, $absA);

        return $negativeB ? self::negate($diff) : $diff;
    }

    private static function divModIntegers(string $a, string $b): array
    {
        if ($b === '0') {
            throw new InvalidArgumentException('Division by zero.');
        }

        $negativeResult = self::isNegative($a) xor self::isNegative($b);
        $absA = self::absValue($a);
        $absB = self::absValue($b);

        [$quotient, $remainder] = self::divModAbs($absA, $absB);

        if ($negativeResult && $quotient !== '0') {
            $quotient = '-' . $quotient;
        }

        if (self::isNegative($a) && $remainder !== '0') {
            $remainder = '-' . $remainder;
        }

        return [$quotient, $remainder];
    }

    private static function compareIntegers(string $a, string $b): int
    {
        $negativeA = self::isNegative($a);
        $negativeB = self::isNegative($b);

        if ($negativeA !== $negativeB) {
            return $negativeA ? -1 : 1;
        }

        $absComparison = self::compareAbs(self::absValue($a), self::absValue($b));

        return $negativeA ? -$absComparison : $absComparison;
    }

    private static function isNegative(string $value): bool
    {
        $trimmed = ltrim($value);

        return $trimmed !== '' && $trimmed[0] === '-';
    }

    private static function absValue(string $value): string
    {
        $trimmed = ltrim($value);
        if ($trimmed === '') {
            return '0';
        }

        if ($trimmed[0] === '-' || $trimmed[0] === '+') {
            $trimmed = substr($trimmed, 1);
        }

        $trimmed = ltrim($trimmed, '0');

        return $trimmed === '' || $trimmed === false ? '0' : $trimmed;
    }

    private static function negate(string $value): string
    {
        $normalized = self::absValue($value);
        if ($normalized === '0') {
            return '0';
        }

        return '-' . $normalized;
    }

    private static function addAbs(string $a, string $b): string
    {
        $carry = 0;
        $result = '';
        $lenA = strlen($a);
        $lenB = strlen($b);
        $max = max($lenA, $lenB);

        for ($i = 0; $i < $max; $i++) {
            $digitA = $lenA - 1 - $i >= 0 ? (int) $a[$lenA - 1 - $i] : 0;
            $digitB = $lenB - 1 - $i >= 0 ? (int) $b[$lenB - 1 - $i] : 0;
            $sum = $digitA + $digitB + $carry;
            $carry = intdiv($sum, 10);
            $result .= (string) ($sum % 10);
        }

        if ($carry > 0) {
            $result .= (string) $carry;
        }

        $reversed = strrev($result);

        return ltrim($reversed, '0') ?: '0';
    }

    private static function subAbs(string $a, string $b): string
    {
        // assumes $a >= $b
        $borrow = 0;
        $result = '';
        $lenA = strlen($a);
        $lenB = strlen($b);

        for ($i = 0; $i < $lenA; $i++) {
            $digitA = (int) $a[$lenA - 1 - $i];
            $digitB = $lenB - 1 - $i >= 0 ? (int) $b[$lenB - 1 - $i] : 0;
            $digit = $digitA - $borrow - $digitB;
            if ($digit < 0) {
                $digit += 10;
                $borrow = 1;
            } else {
                $borrow = 0;
            }
            $result .= (string) $digit;
        }

        $reversed = strrev($result);

        return ltrim($reversed, '0') ?: '0';
    }

    private static function mulAbs(string $a, string $b): string
    {
        $lenA = strlen($a);
        $lenB = strlen($b);
        $products = array_fill(0, $lenA + $lenB, 0);

        for ($i = $lenA - 1; $i >= 0; $i--) {
            $carry = 0;
            $digitA = (int) $a[$i];
            for ($j = $lenB - 1; $j >= 0; $j--) {
                $digitB = (int) $b[$j];
                $idx = $i + $j + 1;
                $sum = $digitA * $digitB + $products[$idx] + $carry;
                $products[$idx] = $sum % 10;
                $carry = intdiv($sum, 10);
            }
            $products[$i] += $carry;
        }

        $result = ltrim(implode('', $products), '0');

        return $result === '' ? '0' : $result;
    }

    private static function divModAbs(string $value, string $divisor): array
    {
        if ($divisor === '0') {
            throw new InvalidArgumentException('Division by zero.');
        }

        if ($value === '0') {
            return ['0', '0'];
        }

        $quotient = '';
        $remainder = '0';
        $divisorInt = $divisor;

        for ($i = 0, $len = strlen($value); $i < $len; $i++) {
            $remainder = self::trimLeadingZeros($remainder . $value[$i]);
            $digit = 0;
            while (self::compareAbs($remainder, $divisorInt) >= 0) {
                $remainder = self::subAbs($remainder, $divisorInt);
                $digit++;
            }
            $quotient .= (string) $digit;
        }

        $quotient = self::trimLeadingZeros($quotient);
        $remainder = self::trimLeadingZeros($remainder);

        return [$quotient, $remainder];
    }

    private static function compareAbs(string $a, string $b): int
    {
        $a = self::trimLeadingZeros($a);
        $b = self::trimLeadingZeros($b);

        $lenA = strlen($a);
        $lenB = strlen($b);

        if ($lenA !== $lenB) {
            return $lenA <=> $lenB;
        }

        if ($a === $b) {
            return 0;
        }

        return $a < $b ? -1 : 1;
    }

    private static function trimLeadingZeros(string $value): string
    {
        $trimmed = ltrim($value, '0');

        return $trimmed === '' || $trimmed === false ? '0' : $trimmed;
    }
}
