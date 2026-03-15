<?php

namespace App\Domain\Rules;

final class YamlValidator
{
    /**
     * @var string[]
     */
    private const ALLOWED_BLOCK_KEYS = ['id', 'when', 'targets', 'reason', 'description'];

    /**
     * @var string[]
     */
    private const ALLOWED_ACTION_KEYS = ['id', 'when', 'action', 'reason', 'description'];

    /**
     * @var string[]
     */
    private const ALLOWED_ACTIONS = [
        'mark_umariyya',
        'block',
        'promote_fixed',
        'set_flag',
        'clear_flag',
    ];

    /**
     * @param array<string,mixed> $yaml
     *
     * @return string[]
     */
    public static function validate(array $yaml): array
    {
        $errors = [];

        if (!isset($yaml['blocks']) || !is_array($yaml['blocks'])) {
            $errors[] = 'blocks missing/invalid';
        }

        if (!isset($yaml['fixed_shares']) || !is_array($yaml['fixed_shares'])) {
            $errors[] = 'fixed_shares missing/invalid';
        }

        if (!isset($yaml['context_flags']) || !is_array($yaml['context_flags'])) {
            $errors[] = 'context_flags missing/invalid';
        }

        $warnings = [];

        if (isset($yaml['blocks']) && is_array($yaml['blocks'])) {
            /** @var array<string,array<int,array{index:int,condition:mixed}>> $blockConditions */
            $blockConditions = [];
            foreach ($yaml['blocks'] as $index => $block) {
                if (!is_array($block)) {
                    $errors[] = sprintf('blocks[%d] must be a mapping', $index);
                    continue;
                }

                foreach ($block as $key => $_) {
                    if (!in_array($key, self::ALLOWED_BLOCK_KEYS, true)) {
                        $errors[] = sprintf('Unknown key "%s" in blocks[%d]', $key, $index);
                    }
                }

                $id = $block['id'] ?? null;
                if (is_string($id) && trim($id) !== '') {
                    $blockConditions[$id][] = [
                        'index' => $index,
                        'condition' => $block['when'] ?? null,
                    ];
                }
            }

            $warnings = array_merge($warnings, self::detectOverlaps($blockConditions, 'blocks'));
        }

        if (isset($yaml['special_cases']) && is_array($yaml['special_cases'])) {
            $specialCases = $yaml['special_cases'];
            $actions = $specialCases['actions'] ?? [];
            if (isset($specialCases['actions']) && !is_array($actions)) {
                $errors[] = 'special_cases.actions missing/invalid';
            }

            if (is_array($actions)) {
                /** @var array<string,array<int,array{index:int,condition:mixed}>> $actionConditions */
                $actionConditions = [];
                foreach ($actions as $index => $actionEntry) {
                    if (!is_array($actionEntry)) {
                        $errors[] = sprintf('special_cases.actions[%d] must be a mapping', $index);
                        continue;
                    }

                    foreach ($actionEntry as $key => $_) {
                        if (!in_array($key, self::ALLOWED_ACTION_KEYS, true)) {
                            $errors[] = sprintf('Unknown key "%s" in special_cases.actions[%d]', $key, $index);
                        }
                    }

                    $actionName = $actionEntry['action'] ?? null;
                    if (is_string($actionName) && trim($actionName) !== '') {
                        $normalizedAction = trim($actionName);
                        if (!in_array($normalizedAction, self::ALLOWED_ACTIONS, true)) {
                            $errors[] = sprintf('Unknown action "%s" in special_cases.actions[%d]', $normalizedAction, $index);
                        }
                    }

                    $id = $actionEntry['id'] ?? null;
                    if (is_string($id) && trim($id) !== '') {
                        $actionConditions[$id][] = [
                            'index' => $index,
                            'condition' => $actionEntry['when'] ?? null,
                        ];
                    }
                }

                $warnings = array_merge($warnings, self::detectOverlaps($actionConditions, 'special_cases.actions'));
            }
        }

        foreach ($warnings as $warning) {
            trigger_error($warning, E_USER_WARNING);
        }

        return $errors;
    }

    /**
     * @param array<string,array<int,array{index:int,condition:mixed}>> $rulesById
     * @return string[]
     */
    private static function detectOverlaps(array $rulesById, string $section): array
    {
        $warnings = [];

        foreach ($rulesById as $id => $rules) {
            if (count($rules) <= 1) {
                continue;
            }

            $count = count($rules);
            for ($i = 0; $i < $count; $i++) {
                for ($j = $i + 1; $j < $count; $j++) {
                    if (self::conditionsPotentiallyOverlap($rules[$i]['condition'], $rules[$j]['condition'])) {
                        $warnings[] = sprintf(
                            'Potential overlap detected for %s entry "%s" between indices %d and %d.',
                            $section,
                            $id,
                            $rules[$i]['index'],
                            $rules[$j]['index']
                        );

                        continue 3;
                    }
                }
            }
        }

        return $warnings;
    }

    private static function conditionsPotentiallyOverlap(mixed $first, mixed $second): bool
    {
        if (self::isConditionUnconditional($first) || self::isConditionUnconditional($second)) {
            return true;
        }

        if (is_string($first) && is_string($second)) {
            return trim($first) === trim($second);
        }

        return $first == $second;
    }

    private static function isConditionUnconditional(mixed $condition): bool
    {
        if ($condition === null) {
            return true;
        }

        if (is_string($condition)) {
            $normalized = strtolower(trim($condition));

            return $normalized === '' || $normalized === 'otherwise' || $normalized === 'true';
        }

        return false;
    }
}
