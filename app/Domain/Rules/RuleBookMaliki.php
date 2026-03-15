<?php

namespace App\Domain\Rules;

use InvalidArgumentException;
use RuntimeException;

require_once __DIR__ . '/../Normalization/HeirRole.php';

final class RuleBookMaliki
{
    private const DEFAULT_PATH = __DIR__ . '/../../Resources/rules/maliki.yml';

    /** @var array<string,array<string,mixed>> */
    private static array $cache = [];

    /** @var array<string,array<string,mixed>> */
    private static array $rawCache = [];

    private string $yamlPath;

    /** @var array<string,mixed> */
    private array $data;

    /** @var array<string,mixed> */
    private array $rawData;

    public function __construct(?string $yamlPath = null)
    {
        $this->yamlPath = $yamlPath ?? self::DEFAULT_PATH;
        if (!is_file($this->yamlPath)) {
            throw new InvalidArgumentException(sprintf('Rulebook YAML file "%s" not found.', $this->yamlPath));
        }

        $this->rawData = self::$rawCache[$this->yamlPath] ??= $this->parseYaml($this->yamlPath);
        $this->data = self::$cache[$this->yamlPath] ??= $this->normalize($this->rawData);
    }

    public function sha256(): string
    {
        $contents = @file_get_contents($this->yamlPath);
        if ($contents === false) {
            throw new RuntimeException(sprintf('Failed to read rulebook YAML file "%s".', $this->yamlPath));
        }

        return hash('sha256', $contents);
    }

    public function schemaVersion(): string
    {
        $version = $this->rawData['schema_version'] ?? '1';

        if (is_int($version) || is_float($version)) {
            return (string) $version;
        }

        if (is_string($version) && $version !== '') {
            return $version;
        }

        return '1';
    }

    /**
     * @return array<string,mixed>
     */
    public function raw(): array
    {
        return $this->rawData;
    }

    /**
     * @return array<string,mixed>
     */
    public function rawData(): array
    {
        return $this->raw();
    }

    /**
     * @return array<int,array{id:string,reason:?string,expression:?string,targets:array<int,string>}>
     */
    public function blocks(): array
    {
        /** @var array<int,array{id:string,reason:?string,expression:?string,targets:array<int,string>}> $blocks */
        $blocks = $this->data['blocks'];
        return $blocks;
    }

    /**
     * @return array<int,array{
     *     group:string,
     *     roles:array<int,string>,
     *     condition:?string,
     *     share:?string,
     *     group_share:?string,
     *     distribute:?string,
     *     note:?string
     * }>
     */
    public function fixedShares(): array
    {
        /** @var array<int,array{group:string,roles:array<int,string>,condition:?string,share:?string,group_share:?string,distribute:?string,note:?string}> $shares */
        $shares = $this->data['fixed_shares'];
        return $shares;
    }

    /**
     * @return array<string,mixed>
     */
    public function specials(): array
    {
        /** @var array<string,mixed> $specials */
        $specials = $this->data['special_cases'];
        return $specials;
    }

    /**
     * @return array<int,array{id:string,reason:?string,expression:?string,targets:array<int,string>}>
     */
    public function specialFlags(): array
    {
        /** @var array<int,array{id:string,reason:?string,expression:?string,targets:array<int,string>}> $flags */
        $flags = $this->data['special_flags'];
        return $flags;
    }

    /**
     * @return array<int,array{id:string,reason:?string,expression:?string,action:string}>
     */
    public function specialActions(): array
    {
        /** @var array<int,array{id:string,reason:?string,expression:?string,action:string}> $actions */
        $actions = $this->data['special_actions'];
        return $actions;
    }

    /**
     * @return array<int,string>
     */
    public function motherReductionExpressions(): array
    {
        /** @var array<int,string> $expressions */
        $expressions = $this->data['mother_reduction'];
        return $expressions;
    }

    /**
     * @return array<int,string>
     */
    public function motherReduction(): array
    {
        return $this->motherReductionExpressions();
    }

    /**
     * @return array<string,mixed>
     */
    /**
     * @param array<string,mixed> $parsed
     *
     * @return array<string,mixed>
     */
    private function normalize(array $parsed): array
    {
        $blocks = $this->normalizeBlocks($parsed['blocks'] ?? null);
        $fixed = $this->normalizeFixedShares($parsed['fixed_shares'] ?? null);
        $specials = $this->normalizeSpecialCases($parsed['special_cases'] ?? null);
        $features = $this->normalizeFeatureFlags($parsed['special_flags'] ?? null);
        $motherReduction = $this->mergeMotherReduction(
            $fixed['mother_reduction'],
            $parsed['mother_reduction'] ?? null
        );

        return [
            'blocks' => $blocks,
            'fixed_shares' => $fixed['rules'],
            'special_cases' => $specials,
            'mother_reduction' => $motherReduction,
            'special_flags' => $specials['flags'],
            'special_actions' => $specials['actions'],
            'feature_flags' => $features,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public function featureFlags(): array
    {
        /** @var array<string,mixed> $flags */
        $flags = $this->data['feature_flags'];
        return $flags;
    }

    public function isFeatureEnabled(string $flag, bool $default = false): bool
    {
        $value = $this->flag($flag);
        if ($value === null) {
            return $default;
        }

        if (is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            $normalized = strtolower(trim($value));
            if ($normalized === '') {
                return $default;
            }

            if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
                return true;
            }

            if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
                return false;
            }

            return $default;
        }

        if (is_int($value)) {
            return $value !== 0;
        }

        if (is_float($value)) {
            return abs($value) > 0.0;
        }

        return $default;
    }

    public function flag(string $name, mixed $default = null): mixed
    {
        $flags = $this->featureFlags();

        return array_key_exists($name, $flags) ? $flags[$name] : $default;
    }

    /**
     * @param array<string,mixed> $overrides
     */
    public function withFeatureFlagOverrides(array $overrides): self
    {
        $clone = clone $this;

        foreach ($overrides as $name => $value) {
            if (!is_string($name) || trim($name) === '') {
                throw new InvalidArgumentException('Feature flag override keys must be non-empty strings.');
            }

            if (!is_scalar($value) && $value !== null) {
                throw new InvalidArgumentException(sprintf(
                    'Feature flag override "%s" must be a scalar or null value.',
                    $name
                ));
            }
        }

        $clone->data['feature_flags'] = array_replace($clone->featureFlags(), $overrides);

        return $clone;
    }

    /**
     * @return array<int,array{id:string,reason:?string,expression:?string,targets:array<int,string>}>
     */
    private function normalizeBlocks(mixed $raw): array
    {
        if (!is_array($raw)) {
            throw new InvalidArgumentException('"blocks" section must be an array of rules.');
        }

        $rules = [];
        $index = 0;
        foreach ($raw as $entry) {
            if (!is_array($entry)) {
                throw new InvalidArgumentException(sprintf('Block rule at index %d must be a mapping.', $index));
            }

            $id = $entry['id'] ?? null;
            if (!is_string($id) || trim($id) === '') {
                throw new InvalidArgumentException(sprintf('Block rule at index %d is missing a valid "id".', $index));
            }

            $when = $entry['when'] ?? null;
            $expression = $this->normalizeCondition($when, sprintf('blocks[%d].when', $index));

            $targets = $entry['targets'] ?? null;
            if (!is_array($targets) || $targets === []) {
                throw new InvalidArgumentException(sprintf('Block rule "%s" must declare at least one target.', $id));
            }

            $normalizedTargets = [];
            foreach ($targets as $target) {
                $role = $this->normalizeRoleName($target, sprintf('blocks[%d].targets', $index));
                $normalizedTargets[] = $role;
            }

            $reason = $entry['reason'] ?? ($entry['description'] ?? null);
            $rules[] = [
                'id' => $id,
                'reason' => isset($reason) && $reason !== '' ? (string) $reason : null,
                'expression' => $expression,
                'targets' => $normalizedTargets,
            ];

            $index++;
        }

        return $rules;
    }

    /**
     * @return array{rules:array<int,array{group:string,roles:array<int,string>,condition:?string,share:?string,group_share:?string,distribute:?string,note:?string}>,mother_reduction:array<int,string>}
     */
    private function normalizeFixedShares(mixed $raw): array
    {
        if (!is_array($raw)) {
            throw new InvalidArgumentException('"fixed_shares" section must be a mapping of roles.');
        }

        $rules = [];
        $motherReduction = [];
        $dedupe = [];

        foreach ($raw as $roleKey => $definitions) {
            $role = $this->normalizeRoleName($roleKey, 'fixed_shares');
            if (!is_array($definitions)) {
                throw new InvalidArgumentException(sprintf('Fixed share entries for role "%s" must be an array.', $role));
            }

            foreach ($definitions as $idx => $definition) {
                if (!is_array($definition)) {
                    throw new InvalidArgumentException(sprintf('Fixed share definition for "%s" at index %d must be a mapping.', $role, $idx));
                }

                $condition = $this->normalizeCondition($definition['when'] ?? null, sprintf('fixed_shares.%s[%d].when', $role, $idx));
                $share = $definition['share'] ?? null;
                $groupShare = $definition['group_share'] ?? null;

                if ($share === null && $groupShare === null) {
                    throw new InvalidArgumentException(sprintf('Fixed share definition for "%s" at index %d must declare "share" or "group_share".', $role, $idx));
                }

                if ($share !== null && $groupShare !== null) {
                    throw new InvalidArgumentException(sprintf('Fixed share definition for "%s" at index %d cannot declare both "share" and "group_share".', $role, $idx));
                }

                if ($share !== null && !is_string($share)) {
                    throw new InvalidArgumentException(sprintf('Fixed share "share" for "%s" at index %d must be a string fraction.', $role, $idx));
                }

                if ($groupShare !== null && !is_string($groupShare)) {
                    throw new InvalidArgumentException(sprintf('Fixed share "group_share" for "%s" at index %d must be a string fraction.', $role, $idx));
                }

                $distribution = $definition['distribute'] ?? null;
                if ($distribution !== null && !is_string($distribution)) {
                    throw new InvalidArgumentException(sprintf('Distribution directive for "%s" at index %d must be a string.', $role, $idx));
                }

                $note = $definition['note'] ?? null;
                if ($note !== null && !is_string($note)) {
                    throw new InvalidArgumentException(sprintf('Note for "%s" at index %d must be a string.', $role, $idx));
                }

                [$group, $roles] = $this->resolveGroupForRole($role);
                if ($distribution === null && $groupShare !== null) {
                    $distribution = 'equal';
                }

                if ($distribution === null && in_array($role, [
                    \HeirRole::WIFE,
                    \HeirRole::DAUGHTER,
                    \HeirRole::UTERINE_BROTHER,
                    \HeirRole::UTERINE_SISTER,
                ], true)) {
                    $distribution = 'equal';
                }

                $normalized = [
                    'group' => $group,
                    'roles' => $roles,
                    'condition' => $condition,
                    'share' => $share,
                    'group_share' => $groupShare,
                    'distribute' => $distribution,
                    'note' => $note,
                ];

                $key = $this->buildFixedShareKey($normalized);
                if (isset($dedupe[$key])) {
                    $existingIndex = $dedupe[$key];
                    $existingRoles = $rules[$existingIndex]['roles'];
                    $mergedRoles = array_values(array_unique(array_merge($existingRoles, $roles)));
                    sort($mergedRoles);
                    $rules[$existingIndex]['roles'] = $mergedRoles;
                } else {
                    $dedupe[$key] = count($rules);
                    $rules[] = $normalized;
                }

                if ($group === \HeirRole::MOTHER && $share === '1/6' && $condition !== null) {
                    $motherReduction[] = $condition;
                }
            }
        }

        return [
            'rules' => $rules,
            'mother_reduction' => array_values(array_unique($motherReduction)),
        ];
    }

    /**
     * @param string[] $collected
     *
     * @return string[]
     */
    private function mergeMotherReduction(array $collected, mixed $raw): array
    {
        if ($raw === null) {
            return $collected;
        }

        if (!is_array($raw)) {
            throw new InvalidArgumentException('"mother_reduction" section must be an array of expressions.');
        }

        foreach ($raw as $index => $expression) {
            if (!is_string($expression) || trim($expression) === '') {
                throw new InvalidArgumentException(sprintf(
                    'mother_reduction entry at index %d must be a non-empty string.',
                    $index
                ));
            }

            $collected[] = $expression;
        }

        $collected = array_values(array_unique($collected));
        sort($collected);

        return $collected;
    }

    /**
     * @return array<string,mixed>
     */
    private function normalizeSpecialCases(mixed $raw): array
    {
        if (!is_array($raw)) {
            throw new InvalidArgumentException('"special_cases" section must be a mapping.');
        }

        $result = [
            'flags' => [],
            'actions' => [],
            'distribute' => [],
            'residual' => [],
            'radd' => [],
            'awl' => [],
        ];

        $flagsRaw = $raw['flags'] ?? [];
        if (!is_array($flagsRaw)) {
            throw new InvalidArgumentException('"special_cases.flags" must be an array.');
        }

        $flagRules = [];
        foreach ($flagsRaw as $idx => $entry) {
            if (!is_array($entry)) {
                throw new InvalidArgumentException(sprintf('Flag special case at index %d must be a mapping.', $idx));
            }

            $id = $entry['id'] ?? null;
            if (!is_string($id) || trim($id) === '') {
                throw new InvalidArgumentException(sprintf('Flag special case at index %d requires an "id".', $idx));
            }

            $when = $this->normalizeCondition($entry['when'] ?? null, sprintf('special_cases.flags[%d].when', $idx));

            $targets = $entry['targets'] ?? [];
            if (!is_array($targets) || $targets === []) {
                throw new InvalidArgumentException(sprintf('Flag special case "%s" must declare targets.', $id));
            }

            $normalizedTargets = [];
            foreach ($targets as $target) {
                $normalizedTargets[] = $this->normalizeRoleName($target, sprintf('special_cases.flags[%d].targets', $idx));
            }

            $reason = $entry['reason'] ?? ($entry['description'] ?? null);

            $flagRules[] = [
                'id' => $id,
                'expression' => $when,
                'targets' => $normalizedTargets,
                'reason' => isset($reason) && $reason !== '' ? (string) $reason : null,
            ];
        }

        $result['flags'] = $flagRules;

        $actionsRaw = $raw['actions'] ?? [];
        if (!is_array($actionsRaw)) {
            throw new InvalidArgumentException('"special_cases.actions" must be an array.');
        }

        $actionRules = [];
        foreach ($actionsRaw as $idx => $entry) {
            if (!is_array($entry)) {
                throw new InvalidArgumentException(sprintf('Action special case at index %d must be a mapping.', $idx));
            }

            $id = $entry['id'] ?? null;
            if (!is_string($id) || trim($id) === '') {
                throw new InvalidArgumentException(sprintf('Action special case at index %d requires an "id".', $idx));
            }

            $when = $this->normalizeCondition($entry['when'] ?? null, sprintf('special_cases.actions[%d].when', $idx));

            $action = $entry['action'] ?? null;
            if (!is_string($action) || trim($action) === '') {
                throw new InvalidArgumentException(sprintf('Action special case "%s" must declare an "action".', $id));
            }

            $reason = $entry['reason'] ?? ($entry['description'] ?? null);

            $actionRules[] = [
                'id' => $id,
                'expression' => $when,
                'action' => trim($action),
                'reason' => isset($reason) && $reason !== '' ? (string) $reason : null,
            ];
        }

        $result['actions'] = $actionRules;

        $distribute = $raw['distribute'] ?? [];
        if (!is_array($distribute)) {
            throw new InvalidArgumentException('"special_cases.distribute" must be an array.');
        }

        $distRules = [];
        foreach ($distribute as $idx => $entry) {
            if (!is_array($entry)) {
                throw new InvalidArgumentException(sprintf('Distribute special case at index %d must be a mapping.', $idx));
            }

            $id = $entry['id'] ?? null;
            if (!is_string($id) || trim($id) === '') {
                throw new InvalidArgumentException(sprintf('Distribute special case at index %d requires an "id".', $idx));
            }

            $when = $this->normalizeCondition($entry['when'] ?? null, sprintf('special_cases.distribute[%d].when', $idx));
            $targets = $entry['targets'] ?? [];
            if (!is_array($targets) || $targets === []) {
                throw new InvalidArgumentException(sprintf('Distribute special case "%s" must declare targets.', $id));
            }

            $normalizedTargets = [];
            foreach ($targets as $target) {
                $normalizedTargets[] = $this->normalizeRoleName($target, sprintf('special_cases.distribute[%d].targets', $idx));
            }

            $method = $entry['method'] ?? null;
            if (!is_string($method) || trim($method) === '') {
                throw new InvalidArgumentException(sprintf('Distribute special case "%s" must declare a method.', $id));
            }

            $residual = isset($entry['residual']) ? (bool) $entry['residual'] : false;
            $note = isset($entry['note']) ? (string) $entry['note'] : null;

            $distRules[] = [
                'id' => $id,
                'expression' => $when,
                'targets' => $normalizedTargets,
                'method' => $method,
                'residual' => $residual,
                'note' => $note,
            ];
        }

        $result['distribute'] = $distRules;

        $residualRules = $raw['residual'] ?? [];
        if (!is_array($residualRules)) {
            throw new InvalidArgumentException('"special_cases.residual" must be an array.');
        }

        $normalizedResidual = [];
        foreach ($residualRules as $idx => $entry) {
            if (!is_array($entry)) {
                throw new InvalidArgumentException(sprintf('Residual special case at index %d must be a mapping.', $idx));
            }

            $id = $entry['id'] ?? null;
            if (!is_string($id) || trim($id) === '') {
                throw new InvalidArgumentException(sprintf('Residual special case at index %d requires an "id".', $idx));
            }

            $when = $this->normalizeCondition($entry['when'] ?? null, sprintf('special_cases.residual[%d].when', $idx));
            $method = $entry['method'] ?? null;
            if (!is_string($method) || trim($method) === '') {
                throw new InvalidArgumentException(sprintf('Residual special case "%s" must declare a method.', $id));
            }

            $targets = $entry['targets'] ?? [];
            if (!is_array($targets)) {
                throw new InvalidArgumentException(sprintf('Residual special case "%s" must declare targets as an array.', $id));
            }

            $normalizedTargets = [];
            foreach ($targets as $target) {
                $normalizedTargets[] = $this->normalizeRoleName($target, sprintf('special_cases.residual[%d].targets', $idx));
            }

            $note = isset($entry['note']) ? (string) $entry['note'] : null;

            $normalizedResidual[] = [
                'id' => $id,
                'expression' => $when,
                'method' => $method,
                'targets' => $normalizedTargets,
                'note' => $note,
            ];
        }

        $result['residual'] = $normalizedResidual;

        $radd = $raw['radd'] ?? [];
        if (is_array($radd)) {
            $exclusions = $radd['exclusions'] ?? [];
            if (!is_array($exclusions)) {
                throw new InvalidArgumentException('"special_cases.radd.exclusions" must be an array.');
            }

            $normalizedExclusions = [];
            foreach ($exclusions as $target) {
                $normalizedExclusions[] = $this->normalizeRoleName($target, 'special_cases.radd.exclusions');
            }

            $note = isset($radd['note']) ? (string) $radd['note'] : null;
            $result['radd'] = [
                'exclusions' => $normalizedExclusions,
                'note' => $note,
            ];
        }

        $awl = $raw['awl'] ?? [];
        if (is_array($awl)) {
            $method = $awl['method'] ?? null;
            if ($method !== null && !is_string($method)) {
                throw new InvalidArgumentException('"special_cases.awl.method" must be a string.');
            }

            $description = $awl['description'] ?? null;
            if ($description !== null && !is_string($description)) {
                throw new InvalidArgumentException('"special_cases.awl.description" must be a string.');
            }

            $result['awl'] = [
                'method' => $method,
                'description' => $description,
            ];
        }

        return $result;
    }

    /**
     * @return array<string,bool>
     */
    private function normalizeFeatureFlags(mixed $raw): array
    {
        if ($raw === null) {
            return [];
        }

        if (!is_array($raw)) {
            throw new InvalidArgumentException('"special_flags" section must be a mapping of feature toggles.');
        }

        $flags = [];
        foreach ($raw as $name => $value) {
            if (!is_string($name) || trim($name) === '') {
                throw new InvalidArgumentException('Feature flag keys in "special_flags" must be non-empty strings.');
            }

            if (!is_scalar($value) && $value !== null) {
                throw new InvalidArgumentException(sprintf(
                    'Feature flag "%s" must be a scalar or null value.',
                    $name
                ));
            }

            $flags[$name] = $value;
        }

        ksort($flags);

        return $flags;
    }

    private function normalizeCondition(mixed $value, string $path): ?string
    {
        if ($value === null) {
            throw new InvalidArgumentException(sprintf('Condition at "%s" must be provided.', $path));
        }

        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '' || $trimmed === 'otherwise') {
                return null;
            }

            return $this->translateExpression($trimmed, $path);
        }

        if (!is_array($value)) {
            throw new InvalidArgumentException(sprintf('Condition at "%s" must be a string or structured expression.', $path));
        }

        if (isset($value['any_of'])) {
            $parts = $value['any_of'];
            if (!is_array($parts) || $parts === []) {
                throw new InvalidArgumentException(sprintf('Condition "%s.any_of" must be a non-empty array.', $path));
            }

            $expressions = [];
            foreach ($parts as $idx => $part) {
                $expr = $this->normalizeCondition($part, sprintf('%s.any_of[%d]', $path, $idx));
                $expressions[] = $expr === null ? '1 == 1' : $expr;
            }

            return implode(' || ', $expressions);
        }

        if (isset($value['all_of'])) {
            $parts = $value['all_of'];
            if (!is_array($parts) || $parts === []) {
                throw new InvalidArgumentException(sprintf('Condition "%s.all_of" must be a non-empty array.', $path));
            }

            $expressions = [];
            foreach ($parts as $idx => $part) {
                $expr = $this->normalizeCondition($part, sprintf('%s.all_of[%d]', $path, $idx));
                $expressions[] = $expr === null ? '1 == 1' : $expr;
            }

            return implode(' && ', $expressions);
        }

        throw new InvalidArgumentException(sprintf('Unsupported structured condition at "%s".', $path));
    }

    private function translateExpression(string $expression, string $path): string
    {
        $expression = $this->expandUterineCounts($expression, $path);

        $patterns = [
            '/\bnot\s+/' => '!',
            '/\band\b/' => '&&',
            '/\bor\b/' => '||',
        ];

        foreach ($patterns as $pattern => $replacement) {
            $expression = preg_replace($pattern, $replacement, $expression);
        }

        $expression = preg_replace('/context\./', 'ctx.', $expression);

        $expression = preg_replace_callback(
            '/heirs\.([a-z_]+)\.count/',
            function (array $matches) use ($path): string {
                $role = $matches[1];
                if ($role === 'uterine') {
                    throw new InvalidArgumentException(sprintf('Use of "heirs.uterine.count" at "%s" must appear with == 1 or >= 2 comparisons.', $path));
                }

                $normalized = $this->normalizeRoleName($role, $path);
                return sprintf('count("%s")', $normalized);
            },
            $expression
        );

        $expression = preg_replace_callback(
            '/heirs\.([a-z_]+)\.exists/',
            function (array $matches) use ($path): string {
                $role = $this->normalizeRoleName($matches[1], $path);
                return sprintf('presence("%s")', $role);
            },
            $expression
        );

        if (str_contains($expression, 'heirs.uterine.count')) {
            throw new InvalidArgumentException(sprintf('Unsupported uterine count expression at "%s".', $path));
        }

        return trim($expression);
    }

    private function expandUterineCounts(string $expression, string $path): string
    {
        $replacements = [
            '/heirs\.uterine\.count\s*==\s*1/' => '((count("uterine_brother") == 1 && count("uterine_sister") == 0) || (count("uterine_sister") == 1 && count("uterine_brother") == 0))',
            '/heirs\.uterine\.count\s*>=\s*2/' => '(count("uterine_brother") >= 2 || count("uterine_sister") >= 2 || (count("uterine_brother") >= 1 && count("uterine_sister") >= 1))',
            '/heirs\.uterine\.count\s*==\s*0/' => '(count("uterine_brother") == 0 && count("uterine_sister") == 0)',
        ];

        $result = $expression;
        foreach ($replacements as $pattern => $replacement) {
            $result = preg_replace($pattern, $replacement, $result);
        }

        if (str_contains($result, 'heirs.uterine.count')) {
            throw new InvalidArgumentException(sprintf('Unsupported uterine count comparison at "%s".', $path));
        }

        return $result;
    }

    /**
     * @return array{0:string,1:array<int,string>}
     */
    private function resolveGroupForRole(string $role): array
    {
        return match ($role) {
            \HeirRole::WIFE => ['wives', [\HeirRole::WIFE]],
            \HeirRole::DAUGHTER => ['daughters', [\HeirRole::DAUGHTER]],
            \HeirRole::UTERINE_BROTHER, \HeirRole::UTERINE_SISTER => ['uterine_siblings', [\HeirRole::UTERINE_BROTHER, \HeirRole::UTERINE_SISTER]],
            default => [$role, [$role]],
        };
    }

    /**
     * @param array{group:string,roles:array<int,string>,condition:?string,share:?string,group_share:?string,distribute:?string,note:?string} $normalized
     */
    private function buildFixedShareKey(array $normalized): string
    {
        $parts = [
            $normalized['group'],
            $normalized['condition'] ?? '__default__',
            $normalized['share'] ?? '__share__',
            $normalized['group_share'] ?? '__group__',
            $normalized['distribute'] ?? '__dist__',
        ];

        return implode('|', $parts);
    }

    private function normalizeRoleName(mixed $value, string $path): string
    {
        if (!is_string($value)) {
            throw new InvalidArgumentException(sprintf('Role reference in "%s" must be a string.', $path));
        }

        $role = trim($value);
        if ($role === '') {
            throw new InvalidArgumentException(sprintf('Role reference in "%s" cannot be empty.', $path));
        }

        $normalized = $this->canonicalizeRole($role);
        if (!in_array($normalized, $this->knownRoles(), true)) {
            throw new InvalidArgumentException(sprintf('Unknown role "%s" referenced in "%s".', $role, $path));
        }

        return $normalized;
    }

    private function canonicalizeRole(string $role): string
    {
        $role = str_replace([' ', '-'], '_', strtolower($role));
        return $role;
    }

    /**
     * @return array<int,string>
     */
    private function knownRoles(): array
    {
        static $roles = null;
        if ($roles === null) {
            $reflection = new \ReflectionClass('HeirRole');
            $roles = array_values($reflection->getConstants());
        }

        return $roles;
    }

    /**
     * @return array<string,mixed>
     */
    private function parseYaml(string $path): array
    {
        if (function_exists('yaml_parse_file')) {
            $parsed = yaml_parse_file($path);
            if (!is_array($parsed)) {
                throw new RuntimeException(sprintf('Failed to parse rulebook YAML at "%s".', $path));
            }

            return $parsed;
        }

        return $this->parseYamlManually($path);
    }

    /**
     * @return array<string,mixed>
     */
    private function parseYamlManually(string $path): array
    {
        $lines = file($path, FILE_IGNORE_NEW_LINES);
        if ($lines === false) {
            throw new RuntimeException(sprintf('Unable to read YAML file "%s".', $path));
        }

        $index = 0;
        $parsed = $this->parseYamlBlock($lines, 0, $index);

        if (!is_array($parsed)) {
            throw new RuntimeException(sprintf('Malformed YAML structure in "%s".', $path));
        }

        return $parsed;
    }

    /**
     * @param array<int,string> $lines
     * @return array<mixed>
     */
    private function parseYamlBlock(array $lines, int $indent, int &$index): array
    {
        $result = [];
        $type = null; // null, 'list', or 'map'
        $count = count($lines);

        while ($index < $count) {
            $rawLine = rtrim($lines[$index], "\r\n");
            $stripped = $this->stripComment($rawLine);
            $trimmed = ltrim($stripped, ' ');

            if ($trimmed === '') {
                $index++;
                continue;
            }

            $currentIndent = strlen($stripped) - strlen($trimmed);
            if ($currentIndent < $indent) {
                break;
            }
            if ($currentIndent > $indent) {
                throw new RuntimeException(sprintf('Invalid indentation at line %d of "%s".', $index + 1, $this->yamlPath));
            }

            if (str_starts_with($trimmed, '- ')) {
                if ($type === null) {
                    $type = 'list';
                    $result = [];
                } elseif ($type !== 'list') {
                    throw new RuntimeException(sprintf('Mixed mapping and sequence at line %d of "%s".', $index + 1, $this->yamlPath));
                }

                $itemContent = substr($trimmed, 2);
                $index++;

                if ($itemContent === '') {
                    $result[] = $this->parseYamlBlock($lines, $indent + 2, $index);
                    continue;
                }

                if ($this->isMappingLine($itemContent)) {
                    $result[] = $this->parseInlineMappingLine($itemContent, $lines, $indent + 2, $index);
                    continue;
                }

                $result[] = $this->parseScalar($itemContent);
                continue;
            }

            if ($type === null) {
                $type = 'map';
                $result = [];
            } elseif ($type !== 'map') {
                throw new RuntimeException(sprintf('Mixed sequence and mapping at line %d of "%s".', $index + 1, $this->yamlPath));
            }

            [$key, $value, $hasValue] = $this->splitKeyValue($trimmed);
            $index++;

            if ($hasValue) {
                $result[$key] = $value;
                continue;
            }

            $result[$key] = $this->parseYamlBlock($lines, $indent + 2, $index);
        }

        if ($type === 'list') {
            return array_values($result);
        }

        return $result;
    }

    /**
     * @param array<int,string> $lines
     * @return array<string,mixed>
     */
    private function parseInlineMappingLine(string $line, array $lines, int $indent, int &$index): array
    {
        [$key, $value, $hasValue] = $this->splitKeyValue($line);
        $map = [];

        if ($hasValue) {
            $map[$key] = $value;
        } else {
            $map[$key] = $this->parseYamlBlock($lines, $indent, $index);
        }

        $count = count($lines);
        while ($index < $count) {
            $rawLine = rtrim($lines[$index], "\r\n");
            $stripped = $this->stripComment($rawLine);
            $trimmed = ltrim($stripped, ' ');

            if ($trimmed === '') {
                $index++;
                continue;
            }

            $currentIndent = strlen($stripped) - strlen($trimmed);
            if ($currentIndent < $indent) {
                break;
            }
            if ($currentIndent > $indent) {
                throw new RuntimeException(sprintf('Invalid indentation at line %d of "%s".', $index + 1, $this->yamlPath));
            }
            if (str_starts_with($trimmed, '- ')) {
                break;
            }

            $index++;
            [$nextKey, $nextValue, $hasValue] = $this->splitKeyValue($trimmed);
            if ($hasValue) {
                $map[$nextKey] = $nextValue;
            } else {
                $map[$nextKey] = $this->parseYamlBlock($lines, $indent + 2, $index);
            }
        }

        return $map;
    }

    /**
     * @return array{0:string,1:mixed,2:bool}
     */
    private function splitKeyValue(string $line): array
    {
        $position = $this->findUnquotedColon($line);
        if ($position === null) {
            throw new RuntimeException(sprintf('Invalid mapping entry "%s" in "%s".', $line, $this->yamlPath));
        }

        $key = trim(substr($line, 0, $position));
        $valuePart = trim(substr($line, $position + 1));

        if ($valuePart === '') {
            return [$key, null, false];
        }

        return [$key, $this->parseScalar($valuePart), true];
    }

    private function isMappingLine(string $line): bool
    {
        return $this->findUnquotedColon($line) !== null;
    }

    private function findUnquotedColon(string $line): ?int
    {
        $length = strlen($line);
        $inSingle = false;
        $inDouble = false;

        for ($i = 0; $i < $length; $i++) {
            $char = $line[$i];
            if ($char === "'" && !$inDouble) {
                $inSingle = !$inSingle;
                continue;
            }
            if ($char === '"' && !$inSingle) {
                $inDouble = !$inDouble;
                continue;
            }
            if ($char === ':' && !$inSingle && !$inDouble) {
                return $i;
            }
        }

        return null;
    }

    private function parseScalar(string $value): mixed
    {
        $value = trim($value);

        if ($value === 'true') {
            return true;
        }
        if ($value === 'false') {
            return false;
        }
        if ($value === 'null') {
            return null;
        }

        $length = strlen($value);
        if ($length >= 2 && $value[0] === '"' && $value[$length - 1] === '"') {
            $inner = substr($value, 1, $length - 2);
            return stripcslashes($inner);
        }

        if ($length >= 2 && $value[0] === "'" && $value[$length - 1] === "'") {
            $inner = substr($value, 1, $length - 2);
            return str_replace("''", "'", $inner);
        }

        if ($value !== '' && ctype_digit($value)) {
            return (int) $value;
        }

        return $value;
    }

    private function stripComment(string $line): string
    {
        $length = strlen($line);
        $inSingle = false;
        $inDouble = false;

        for ($i = 0; $i < $length; $i++) {
            $char = $line[$i];
            if ($char === "'" && !$inDouble) {
                $inSingle = !$inSingle;
                continue;
            }
            if ($char === '"' && !$inSingle) {
                $inDouble = !$inDouble;
                continue;
            }
            if ($char === '#' && !$inSingle && !$inDouble) {
                return substr($line, 0, $i);
            }
        }

        return $line;
    }
}
