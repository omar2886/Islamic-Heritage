<?php

namespace App\Domain\Normalization;

final class RoleAliases
{
    /**
     * @var array<string,string>
     */
    private const ROLE_ALIASES = [
        'paternal_uncle' => HeirRole::PATERNAL_UNCLE,
        'paternal_uncles' => HeirRole::PATERNAL_UNCLE,
        'paternal_uncle_son' => HeirRole::PATERNAL_UNCLE_SON,
        'paternal_uncle_sons' => HeirRole::PATERNAL_UNCLE_SON,
        'full_brother' => HeirRole::FULL_BROTHER,
        'full_brothers' => HeirRole::FULL_BROTHER,
        'full_sister' => HeirRole::FULL_SISTER,
        'full_sisters' => HeirRole::FULL_SISTER,
        'consanguine_brother' => HeirRole::CONSANGUINE_BROTHER,
        'consanguine_brothers' => HeirRole::CONSANGUINE_BROTHER,
        'consanguine_sister' => HeirRole::CONSANGUINE_SISTER,
        'consanguine_sisters' => HeirRole::CONSANGUINE_SISTER,
        'uterine_brother' => HeirRole::UTERINE_BROTHER,
        'uterine_brothers' => HeirRole::UTERINE_BROTHER,
        'uterine_sister' => HeirRole::UTERINE_SISTER,
        'uterine_sisters' => HeirRole::UTERINE_SISTER,
        'paternal_grandfather' => HeirRole::PATERNAL_GRANDFATHER,
        'paternal_grandfathers' => HeirRole::PATERNAL_GRANDFATHER,
        'maternal_grandmother' => HeirRole::MATERNAL_GRANDMOTHER,
        'maternal_grandmothers' => HeirRole::MATERNAL_GRANDMOTHER,
    ];

    /**
     * @param array<int,array<string,mixed>> $heirs
     *
     * @return array<int,array<string,mixed>>
     */
    public static function normalizeInput(array $heirs): array
    {
        $normalized = [];
        $wivesPosition = null;
        $wivesEntry = null;
        $wivesTotal = 0;
        $invalidCounts = [];

        foreach ($heirs as $heir) {
            if (!is_array($heir)) {
                $normalized[] = $heir;
                continue;
            }

            $role = $heir['role'] ?? null;
            if (!is_string($role)) {
                $normalized[] = $heir;
                continue;
            }

            $roleKey = self::normalizeRoleKey($role);
            if ($roleKey === 'wife' || $roleKey === 'wives') {
                if ($wivesPosition === null) {
                    $wivesPosition = count($normalized);
                    $wivesEntry = $heir;
                }

                [$countValue, $isValidCount] = self::parseCount($heir['count'] ?? null);
                if ($isValidCount) {
                    $wivesTotal += $countValue;
                } else {
                    $invalidCounts[] = $heir['count'] ?? null;
                }

                continue;
            }

            $normalized[] = $heir;
        }

        if ($wivesPosition !== null) {
            $wivesEntry = is_array($wivesEntry) ? $wivesEntry : [];
            $wivesEntry['role'] = 'wives';
            if ($invalidCounts !== []) {
                $wivesEntry['count'] = $invalidCounts[0];
            } else {
                $wivesEntry['count'] = $wivesTotal;
            }

            array_splice($normalized, $wivesPosition, 0, [$wivesEntry]);
        }

        return array_values($normalized);
    }

    private static function normalizeRoleKey(string $role): string
    {
        $key = strtolower(trim($role));
        $key = str_replace(['-', ' '], '_', $key);

        $key = preg_replace('/__+/', '_', $key) ?? $key;

        return self::ROLE_ALIASES[$key] ?? $key;
    }

    /**
     * @return array{0:int,1:bool}
     */
    private static function parseCount($raw): array
    {
        if (is_int($raw)) {
            return [$raw, true];
        }

        if (is_float($raw)) {
            return [(int) $raw, true];
        }

        if (is_string($raw)) {
            $trimmed = trim($raw);
            if ($trimmed === '') {
                return [0, false];
            }

            $filtered = filter_var($trimmed, FILTER_VALIDATE_INT);
            if ($filtered !== false) {
                return [(int) $filtered, true];
            }

            return [0, false];
        }

        return [0, false];
    }

    private function __construct()
    {
    }
}
