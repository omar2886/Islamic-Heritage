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
            $sum = bcadd($sum, $amountUnits, 0);
        }

        $lastKey = array_key_last($allocations);
        if ($lastKey !== null) {
            $delta = bcsub($estateUnits, $sum, 0);
            if ($delta !== '0') {
                $allocations[$lastKey] = bcadd($allocations[$lastKey], $delta, 0);
            }
        }

        return array_map(static fn (string $units): string => self::formatUnits($units, $scale), $allocations);
    }

    private static function allocateShare(Fraction $share, string $estateUnits): string
    {
        if ($estateUnits === '0' || $share->isZero()) {
            return '0';
        }

        $product = bcmul($estateUnits, $share->num, 0);
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

        $quotient = bcdiv($value, $divisor, 0);
        $remainder = bcmod($value, $divisor);

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

        $twiceRemainder = bcmul($remainder, '2', 0);
        $comparison = bccomp($twiceRemainder, $denominator, 0);

        if ($comparison === 1) {
            return bcadd($quotient, '1', 0);
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
            return bcadd($quotient, '1', 0);
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
            $combined = bcadd($combined, '1', 0);
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
}
