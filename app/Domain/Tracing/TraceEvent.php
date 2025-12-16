<?php

declare(strict_types=1);

namespace App\Domain\Tracing;

final class TraceEvent
{
    public readonly string $ruleId;

    /**
     * @var string[]
     */
    public readonly array $targets;

    public readonly string $reason;

    public readonly ?string $phase;

    /**
     * @var array<string,mixed>
     */
    public readonly array $data;

    /**
     * @param string[] $targets
     * @param array<string,mixed> $data
     */
    public function __construct(
        string $ruleId,
        array $targets,
        string $reason,
        ?string $phase = null,
        array $data = []
    ) {
        $this->ruleId = $ruleId;
        $this->targets = array_values($targets);
        $this->reason = $reason;
        $this->phase = $phase;
        $this->data = $data;
    }
}
