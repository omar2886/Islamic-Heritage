<?php

namespace App\Domain\Rules;

require_once __DIR__ . '/PredicateExceptions.php';
require_once __DIR__ . '/../Normalization/NormalizationResult.php';
require_once __DIR__ . '/../Normalization/ContextFlags.php';
require_once __DIR__ . '/../Normalization/Heir.php';
require_once __DIR__ . '/../Normalization/HeirRole.php';

final class EvalCtx
{
    private \NormalizationResult $normalization;
    private \ContextFlags $context;
    /** @var array<string,int> */
    private array $roleCounts;
    /** @var array<string,int|bool> */
    private array $contextValues;
    private string $snapshot;
    /** @var array<string,mixed> */
    private array $flags;

    /**
     * @param array<string,mixed> $flags
     */
    public function __construct(\NormalizationResult $normalization, array $flags = [])
    {
        $this->normalization = $normalization;
        $this->context = $normalization->getContext();
        $this->roleCounts = $this->buildRoleCounts();
        $this->contextValues = $this->buildContextValues();
        $this->flags = $this->normalizeFlags($flags);
        $this->snapshot = $this->buildSnapshot();
    }

    /**
     * @param array<int,mixed> $args
     */
    public function call(string $fn, array $args, int $offset): mixed
    {
        $normalized = strtolower($fn);

        return match ($normalized) {
            'presence', 'any' => $this->callPresence($args, $offset),
            'count' => $this->callCount($args, $offset),
            'flag' => $this->callFlag($args, $offset),
            default => throw new PredicateSyntaxException(sprintf('Unknown function "%s" at position %d.', $fn, $offset)),
        };
    }

    public function presence(string $role): bool
    {
        $this->assertKnownRole($role);

        return ($this->roleCounts[$role] ?? 0) > 0;
    }

    public function count(string $role): int
    {
        $this->assertKnownRole($role);

        return $this->roleCounts[$role] ?? 0;
    }

    /**
     * @param array<int,mixed> $args
     */
    private function callPresence(array $args, int $offset): bool
    {
        $argument = $this->requireSingleArgument($args, 'presence', $offset);
        $role = (string) $argument;

        return $this->presence($role);
    }

    /**
     * @param array<int,mixed> $args
     */
    private function callCount(array $args, int $offset): int
    {
        $argument = $this->requireSingleArgument($args, 'count', $offset);
        $role = (string) $argument;

        return $this->count($role);
    }

    /**
     * @param array<int,mixed> $args
     */
    private function callFlag(array $args, int $offset): mixed
    {
        $argument = $this->requireSingleArgument($args, 'flag', $offset);
        $name = trim((string) $argument);
        if ($name === '') {
            throw new PredicateSyntaxException(sprintf('flag expects a non-empty name at position %d.', $offset));
        }

        return $this->flags[$name] ?? null;
    }

    /**
     * @param array<int,mixed> $args
     */
    private function requireSingleArgument(array $args, string $fn, int $offset): mixed
    {
        if (count($args) !== 1) {
            throw new PredicateSyntaxException(sprintf('%s expects exactly one argument at position %d.', $fn, $offset));
        }

        return $args[0];
    }

    public function hasContextKey(string $name): bool
    {
        return array_key_exists($name, $this->contextValues);
    }

    public function context(string $name): int|bool
    {
        if (!array_key_exists($name, $this->contextValues)) {
            throw new PredicateSyntaxException(sprintf('Unknown context alias "%s".', $name));
        }

        return $this->contextValues[$name];
    }

    public function snapshot(): string
    {
        return $this->snapshot;
    }

    /**
     * @return array<string,int>
     */
    private function buildRoleCounts(): array
    {
        $counts = [];
        foreach ($this->normalization->getHeirs() as $heir) {
            $role = $heir->getRole();
            $counts[$role] = ($counts[$role] ?? 0) + $heir->getCount();
        }

        ksort($counts);

        return $counts;
    }

    /**
     * @return array<string,int|bool>
     */
    private function buildContextValues(): array
    {
        $values = [
            'has_descendants' => $this->context->hasDescendants(),
            'has_male_descendant' => $this->context->hasMaleDescendant(),
            'has_female_descendant' => $this->context->hasFemaleDescendant(),
            'has_father' => $this->context->hasFather(),
            'has_paternal_grandfather' => $this->context->hasPaternalGrandfather(),
            'siblings_count' => $this->context->getSiblingsCount(),
            'uterines_count' => $this->context->getUterinesCount(),
            'wives_count' => $this->context->getWivesCount(),
            'siblings_count_preblock' => $this->computeSiblingsCountPreblock(),
        ];

        $values['has_asc_male'] = $this->computeHasAscMale($values);
        $values['is_kalala'] = $this->computeIsKalala($values);

        ksort($values);

        return $values;
    }

    private function computeSiblingsCountPreblock(): int
    {
        $count = 0;
        foreach ($this->normalization->getHeirs() as $heir) {
            if (!$heir->isAlive()) {
                continue;
            }

            $heirCount = $heir->getCount();
            if ($heirCount <= 0) {
                continue;
            }

            $role = $heir->getRole();
            if (in_array($role, [
                \HeirRole::FULL_BROTHER,
                \HeirRole::FULL_SISTER,
                \HeirRole::CONSANGUINE_BROTHER,
                \HeirRole::CONSANGUINE_SISTER,
                \HeirRole::UTERINE_BROTHER,
                \HeirRole::UTERINE_SISTER,
            ], true)) {
                $count += $heirCount;
            }
        }

        return $count;
    }

    /**
     * @param array<string,mixed> $flags
     * @return array<string,mixed>
     */
    private function normalizeFlags(array $flags): array
    {
        $normalized = [];
        foreach ($flags as $name => $value) {
            if (!is_string($name)) {
                continue;
            }

            $trimmed = trim($name);
            if ($trimmed === '') {
                continue;
            }

            $normalized[$trimmed] = $value;
        }

        ksort($normalized);

        return $normalized;
    }

    /**
     * @param array<string,int|bool> $values
     */
    private function computeHasAscMale(array $values): bool
    {
        $hasFather = (bool) ($values['has_father'] ?? false);
        $hasGrandfather = (bool) ($values['has_paternal_grandfather'] ?? false);

        return $hasFather || $hasGrandfather;
    }

    /**
     * @param array<string,int|bool> $values
     */
    private function computeIsKalala(array $values): bool
    {
        $hasMaleDescendant = (bool) ($values['has_male_descendant'] ?? false);
        $hasAscMale = $this->computeHasAscMale($values);

        return !$hasMaleDescendant && !$hasAscMale;
    }

    private function buildSnapshot(): string
    {
        $payload = [
            'roles' => $this->roleCounts,
            'ctx' => $this->contextValues,
            'flags' => $this->flags,
        ];

        $json = json_encode($payload, JSON_THROW_ON_ERROR);

        return sha1($json);
    }

    private function assertKnownRole(string $role): void
    {
        static $knownRoles = null;
        if ($knownRoles === null) {
            $reflection = new \ReflectionClass('HeirRole');
            $knownRoles = array_values($reflection->getConstants());
        }

        if (!in_array($role, $knownRoles, true)) {
            throw new UnknownRoleException(sprintf('Unknown role "%s".', $role));
        }
    }
}
