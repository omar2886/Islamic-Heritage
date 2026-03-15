<?php
namespace App\Domain\Eligibility {

use App\Domain\Tracing\TraceEvent;
use Heir;
use InvalidArgumentException;

enum HeirRole: string
{
    case HUSBAND = 'husband';
    case WIVES = 'wives';
    case WIFE = 'wife';
    case FATHER = 'father';
    case MOTHER = 'mother';
    case PATERNAL_GRANDFATHER = 'paternal_grandfather';
    case PATERNAL_GRANDMOTHER = 'paternal_grandmother';
    case MATERNAL_GRANDMOTHER = 'maternal_grandmother';
    case SON = 'son';
    case DAUGHTER = 'daughter';
    case SONS_SON = 'sons_son';
    case SONS_DAUGHTER = 'sons_daughter';
    case FULL_BROTHER = 'full_brother';
    case FULL_SISTER = 'full_sister';
    case CONSANGUINE_BROTHER = 'consanguine_brother';
    case CONSANGUINE_SISTER = 'consanguine_sister';
    case PATERNAL_UNCLE = 'paternal_uncle';
    case PATERNAL_UNCLES_DAUGHTER = 'paternal_uncles_daughter';
    case PATERNAL_UNCLE_SON = 'paternal_uncle_son';
    case PATERNAL_UNCLE_SONS_DAUGHTER = 'paternal_uncle_sons_daughter';
    case CONSANGUINE_PATERNAL_UNCLE = 'consanguine_paternal_uncle';
    case CONSANGUINE_PATERNAL_UNCLES_DAUGHTER = 'consanguine_paternal_uncles_daughter';
    case CONSANGUINE_PATERNAL_UNCLE_SON = 'consanguine_paternal_uncle_son';
    case CONSANGUINE_PATERNAL_UNCLE_SONS_DAUGHTER = 'consanguine_paternal_uncle_sons_daughter';
    case UTERINE_BROTHER = 'uterine_brother';
    case UTERINE_SISTER = 'uterine_sister';
}

final class EligibilityResult
{
    /**
     * @var Heir[]
     */
    public readonly array $eligibleHeirs;

    /**
     * @var TraceEvent[]
     */
    public readonly array $notes;

    /**
     * @var array<string,Heir>
     */
    private array $eligibleHeirsByRole;

    public readonly EligibilityContext $eCtx;

    /**
     * @var array<string,array{counts:array<string,int>,presence:array<string,bool>}> 
     */
    private static array $aggregateCache = [];

    private string $snapshot;

    /**
     * @var array<string,int>|null
     */
    private ?array $countsCache = null;

    /**
     * @var array<string,bool>|null
     */
    private ?array $presenceCache = null;

    /**
     * @var array<string,array<int|string>>
     */
    private array $roleToPersonIds = [];

    /**
     * @param Heir[] $eligibleHeirs
     * @param TraceEvent[] $notes
     */
    public function __construct(array $eligibleHeirs, array $notes, EligibilityContext $context)
    {
        $this->eligibleHeirs = $this->assertHeirs($eligibleHeirs);
        $this->notes = $this->assertNotes($notes);
        $this->eCtx = $context;
        $this->eligibleHeirsByRole = $this->indexHeirsByRole($this->eligibleHeirs);
        $this->snapshot = $this->computeSnapshot($this->eligibleHeirs, $context);
        $this->roleToPersonIds = $this->deriveRoleToPersonIds($context);
    }

    /**
     * @return Heir[]
     */
    public function getEligibleHeirs(): array
    {
        return $this->eligibleHeirs;
    }

    /**
     * @return TraceEvent[]
     */
    public function getNotes(): array
    {
        return $this->notes;
    }

    /**
     * @return TraceEvent[]
     */
    public function getTraceByPhase(string $phase): array
    {
        return array_values(array_filter(
            $this->notes,
            static function (TraceEvent $note) use ($phase): bool {
                return $note->phase !== null && strcasecmp($note->phase, $phase) === 0;
            }
        ));
    }

    /**
     * @return array<int,array{rule_id:string,reason:string,targets:array<int,string>}>
     */
    public function traceByPhase(string $phase): array
    {
        return array_map(
            static function (TraceEvent $event): array {
                return [
                    'rule_id' => $event->ruleId,
                    'reason' => $event->reason,
                    'targets' => array_values($event->targets),
                ];
            },
            $this->getTraceByPhase($phase)
        );
    }

    public function getContext(): EligibilityContext
    {
        return $this->eCtx;
    }

    /**
     * @return Heir[]
     */
    public function getHeirs(): array
    {
        return $this->eligibleHeirs;
    }

    public function hasHeir(string $role): bool
    {
        $this->ensureAggregates();

        return $this->presenceCache[$role] ?? false;
    }

    public function getHeir(string $role): ?Heir
    {
        return $this->eligibleHeirsByRole[$role] ?? null;
    }

    public function getHeirCount(string $role): int
    {
        $this->ensureAggregates();

        return $this->countsCache[$role] ?? 0;
    }

    /**
     * @param string[] $roles
     */
    public function getTotalCount(array $roles): int
    {
        $total = 0;
        foreach ($roles as $role) {
            $total += $this->getHeirCount($role);
        }

        return $total;
    }

    public function hasAnyRole(string ...$roles): bool
    {
        foreach ($roles as $role) {
            if ($this->hasHeir($role)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param Heir[] $eligibleHeirs
     *
     * @return Heir[]
     */
    private function assertHeirs(array $eligibleHeirs): array
    {
        foreach ($eligibleHeirs as $heir) {
            if (!$heir instanceof Heir) {
                throw new InvalidArgumentException('Eligible heirs must be instances of Heir.');
            }
        }

        return array_values($eligibleHeirs);
    }

    /**
     * @param TraceEvent[] $notes
     *
     * @return TraceEvent[]
     */
    private function assertNotes(array $notes): array
    {
        foreach ($notes as $note) {
            if (!$note instanceof TraceEvent) {
                throw new InvalidArgumentException('Eligibility notes must be TraceEvent instances.');
            }
        }

        return array_values($notes);
    }

    /**
     * @param Heir[] $eligibleHeirs
     *
     * @return array<string,Heir>
     */
    private function indexHeirsByRole(array $eligibleHeirs): array
    {
        $byRole = [];
        foreach ($eligibleHeirs as $heir) {
            $byRole[$heir->getRole()] = $heir;
        }

        ksort($byRole);

        return $byRole;
    }

    /**
     * @param Heir[] $eligibleHeirs
     *
     * @return array{0:array<string,int>,1:array<string,bool>}
     */
    private function buildHeirCaches(array $eligibleHeirs): array
    {
        $counts = [];
        $presence = [];

        foreach ($eligibleHeirs as $heir) {
            $role = $heir->getRole();
            $count = $heir->getCount();
            $isPresent = $heir->isAlive() && $count > 0;

            if ($isPresent) {
                $counts[$role] = ($counts[$role] ?? 0) + $count;
                $presence[$role] = true;
                continue;
            }

            if (!array_key_exists($role, $presence)) {
                $presence[$role] = false;
            }
        }

        ksort($counts);
        ksort($presence);

        return [$counts, $presence];
    }

    /**
     * @return array<string,int>
     */
    public function counts(): array
    {
        $this->ensureAggregates();

        return $this->countsCache;
    }

    public function has(HeirRole $r): bool
    {
        $this->ensureAggregates();

        return $this->presenceCache[$r->value] ?? false;
    }

    public function snapshot(): string
    {
        return $this->snapshot;
    }

    /**
     * @return array<string,array<int|string>>
     */
    public function roleToPersonIds(): array
    {
        return $this->roleToPersonIds;
    }

    private function deriveRoleToPersonIds(EligibilityContext $context): array
    {
        $normalization = $context->getNormalization();
        if ($normalization === null) {
            return [];
        }

        $map = $normalization->getRoleToPersonIds();
        if ($map === []) {
            return [];
        }

        $sanitized = [];
        foreach ($map as $role => $ids) {
            if (!is_string($role) || $role === '') {
                continue;
            }

            if (!is_array($ids)) {
                continue;
            }

            $sanitized[$role] = $this->sanitizePersonIds($ids);
        }

        return $this->augmentRoleAliases($sanitized);
    }

    /**
     * @param array<int|string> $ids
     * @return array<int|string>
     */
    private function sanitizePersonIds(array $ids): array
    {
        $unique = [];
        $seen = [];

        foreach ($ids as $id) {
            if (!is_scalar($id)) {
                continue;
            }

            $key = (string) $id;
            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $unique[] = $id;
        }

        return $unique;
    }

    /**
     * @param array<string,array<int|string>> $map
     * @return array<string,array<int|string>>
     */
    private function augmentRoleAliases(array $map): array
    {
        $result = $map;

        if (isset($map[HeirRole::WIFE->value])) {
            $result['wives'] = $this->mergePersonLists(
                $map['wives'] ?? [],
                $map[HeirRole::WIFE->value]
            );
        }

        if (isset($map[HeirRole::DAUGHTER->value])) {
            $result['daughters'] = $this->mergePersonLists(
                $map['daughters'] ?? [],
                $map[HeirRole::DAUGHTER->value]
            );
        }

        $uterine = $this->mergePersonLists(
            $map[HeirRole::UTERINE_BROTHER->value] ?? [],
            $map[HeirRole::UTERINE_SISTER->value] ?? []
        );
        if ($uterine !== []) {
            $result['uterine_siblings'] = $uterine;
        }

        ksort($result);

        return $result;
    }

    /**
     * @param array<int|string> ...$lists
     * @return array<int|string>
     */
    private function mergePersonLists(array ...$lists): array
    {
        $merged = [];
        $seen = [];

        foreach ($lists as $list) {
            foreach ($list as $id) {
                if (!is_scalar($id)) {
                    continue;
                }

                $key = (string) $id;
                if (isset($seen[$key])) {
                    continue;
                }

                $seen[$key] = true;
                $merged[] = $id;
            }
        }

        return $merged;
    }

    private function ensureAggregates(): void
    {
        if ($this->countsCache !== null && $this->presenceCache !== null) {
            return;
        }

        $cached = self::$aggregateCache[$this->snapshot] ?? null;
        if ($cached === null) {
            $cached = $this->buildHeirCaches($this->eligibleHeirs);
            self::$aggregateCache[$this->snapshot] = $cached;
        }

        [$this->countsCache, $this->presenceCache] = $cached;
    }

    /**
     * @param Heir[] $eligibleHeirs
     */
    private function computeSnapshot(array $eligibleHeirs, EligibilityContext $context): string
    {
        $sourceHeirs = $context->getNormalization()?->getHeirs() ?? $eligibleHeirs;

        $payload = [];
        foreach ($sourceHeirs as $heir) {
            if (!$heir instanceof Heir) {
                continue;
            }

            $payload[] = [
                'role' => $heir->getRole(),
                'alive' => $heir->isAlive(),
                'count' => $heir->getCount(),
            ];
        }

        if ($payload === []) {
            return 'empty';
        }

        usort($payload, static function (array $a, array $b): int {
            $roleCmp = strcmp($a['role'], $b['role']);
            if ($roleCmp !== 0) {
                return $roleCmp;
            }

            if ($a['alive'] !== $b['alive']) {
                return $a['alive'] ? -1 : 1;
            }

            return $a['count'] <=> $b['count'];
        });

        $json = json_encode($payload, JSON_THROW_ON_ERROR);

        return sha1($json);
    }
}
}

namespace {

use App\Domain\Eligibility\EligibilityContext;
use App\Domain\Eligibility\EligibilityResult as DomainEligibilityResult;
use App\Domain\Tracing\TraceEvent;

/**
 * @deprecated Legacy DTO kept for compatibility with the legacy UI layer.
 */
final class EligibilityResult
{
    private DomainEligibilityResult $inner;

    public function __construct(DomainEligibilityResult $inner)
    {
        $this->inner = $inner;
    }

    public function getEligibleHeirs(): array
    {
        return $this->inner->getEligibleHeirs();
    }

    public function getHeirs(): array
    {
        return $this->inner->getEligibleHeirs();
    }

    public function getContext(): EligibilityContext
    {
        return $this->inner->getContext();
    }

    public function hasHeir(string $role): bool
    {
        return $this->inner->hasHeir($role);
    }

    public function getHeir(string $role): ?\Heir
    {
        return $this->inner->getHeir($role);
    }

    public function getHeirCount(string $role): int
    {
        return $this->inner->getHeirCount($role);
    }

    /**
     * @param string[] $roles
     */
    public function getTotalCount(array $roles): int
    {
        return $this->inner->getTotalCount($roles);
    }

    public function hasAnyRole(string ...$roles): bool
    {
        return $this->inner->hasAnyRole(...$roles);
    }

    public function getNotes(): array
    {
        return $this->inner->getNotes();
    }

    /**
     * @return TraceEvent[]
     */
    public function getTraceByPhase(string $phase): array
    {
        return $this->inner->getTraceByPhase($phase);
    }

    /**
     * @return array<int,array{rule_id:string,reason:string,targets:array<int,string>}>
     */
    public function traceByPhase(string $phase): array
    {
        return $this->inner->traceByPhase($phase);
    }

    /**
     * @return array<string,int>
     */
    public function counts(): array
    {
        return $this->inner->counts();
    }

    public function has(\App\Domain\Eligibility\HeirRole $role): bool
    {
        return $this->inner->has($role);
    }

    public function toDomain(): DomainEligibilityResult
    {
        return $this->inner;
    }

    /**
     * @return array<string,array<int|string>>
     */
    public function roleToPersonIds(): array
    {
        return $this->inner->roleToPersonIds();
    }
}
}
