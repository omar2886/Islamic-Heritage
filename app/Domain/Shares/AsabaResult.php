<?php

require_once __DIR__ . '/../Math/Fraction.php';
require_once __DIR__ . '/../Tracing/TraceEvent.php';

use App\Domain\Math\Fraction;
use App\Domain\Tracing\TraceEvent;

final class AsabaResult
{
    public Fraction $residualConsumed;

    /** @var array<string,Fraction> */
    public array $asabaGroupShares;

    /** @var array<string,Fraction[]> */
    public array $asabaIndividualShares;

    /** @var TraceEvent[] */
    public array $notes;

    private bool $hasAsabah;

    /**
     * @param array<string,Fraction>   $asabaGroupShares
     * @param array<string,Fraction[]> $asabaIndividualShares
     * @param TraceEvent[]             $notes
     */
    public function __construct(
        Fraction $residualConsumed,
        array $asabaGroupShares,
        array $asabaIndividualShares,
        array $notes,
        bool $hasAsabah = false
    ) {
        foreach ($asabaGroupShares as $fraction) {
            if (!$fraction instanceof Fraction) {
                throw new InvalidArgumentException('Group shares must be fractions.');
            }
        }

        foreach ($asabaIndividualShares as $role => $fractions) {
            if (!is_array($fractions)) {
                throw new InvalidArgumentException('Individual share groups must be arrays of fractions.');
            }

            foreach ($fractions as $fraction) {
                if (!$fraction instanceof Fraction) {
                    throw new InvalidArgumentException(sprintf('Individual shares for role "%s" must be fractions.', (string) $role));
                }
            }
        }

        foreach ($notes as $note) {
            if (!$note instanceof TraceEvent) {
                throw new InvalidArgumentException('Notes must contain TraceEvent instances.');
            }
        }

        ksort($asabaGroupShares);
        ksort($asabaIndividualShares);

        $this->residualConsumed = $residualConsumed->reduce();
        $this->asabaGroupShares = $asabaGroupShares;
        $this->asabaIndividualShares = $asabaIndividualShares;
        $this->notes = array_values($notes);
        $this->hasAsabah = $hasAsabah;
    }

    public static function empty(): self
    {
        return new self(Fraction::zero(), [], [], [], false);
    }

    public function getResidualConsumed(): Fraction
    {
        return $this->residualConsumed;
    }

    /**
     * @return array<string,Fraction>
     */
    public function getGroupShares(): array
    {
        return $this->asabaGroupShares;
    }

    /**
     * @return array<string,Fraction[]>
     */
    public function getIndividualShares(): array
    {
        return $this->asabaIndividualShares;
    }

    /**
     * @return TraceEvent[]
     */
    public function getNotes(): array
    {
        return $this->notes;
    }

    public function hasAsabah(): bool
    {
        return $this->hasAsabah;
    }
}
