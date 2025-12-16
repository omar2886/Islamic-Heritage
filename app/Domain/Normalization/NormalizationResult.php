<?php

final class NormalizationResult
{
    /** @var Heir[] */
    private array $heirs;
    private ContextFlags $ctx;

    /**
     * @var array<string,array<int|string>>
     */
    private array $roleToPersonIds;

    /**
     * @param Heir[] $heirs
     */
    public function __construct(array $heirs, ContextFlags $ctx, array $roleToPersonIds = [])
    {
        $this->heirs = $heirs;
        $this->ctx = $ctx;
        $this->roleToPersonIds = $this->normalizeRolePersonMap($roleToPersonIds);
    }

    /**
     * @return Heir[]
     */
    public function getHeirs(): array
    {
        return $this->heirs;
    }

    public function getContext(): ContextFlags
    {
        return $this->ctx;
    }

    /**
     * @return array<string,array<int|string>>
     */
    public function getRoleToPersonIds(): array
    {
        return $this->roleToPersonIds;
    }

    /**
     * @param array<string,array<mixed>> $map
     * @return array<string,array<int|string>>
     */
    private function normalizeRolePersonMap(array $map): array
    {
        $normalized = [];

        foreach ($map as $role => $ids) {
            if (!is_array($ids)) {
                continue;
            }

            $normalizedRole = is_string($role) ? trim($role) : '';
            if ($normalizedRole === '') {
                continue;
            }

            $seen = [];
            $collected = [];

            foreach ($ids as $id) {
                if (!is_scalar($id)) {
                    continue;
                }

                $key = (string) $id;
                if (isset($seen[$key])) {
                    continue;
                }

                $seen[$key] = true;
                $collected[] = $id;
            }

            if ($collected === []) {
                continue;
            }

            $normalized[$normalizedRole] = $collected;
        }

        ksort($normalized);

        return $normalized;
    }
}
