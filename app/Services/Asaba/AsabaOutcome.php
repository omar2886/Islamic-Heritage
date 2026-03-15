<?php

declare(strict_types=1);

namespace App\Services\Asaba;

use App\Domain\Math\Fraction;

require_once __DIR__ . '/../../Domain/Math/Fraction.php';

final class AsabaOutcome
{
    private Fraction $residualConsumed;

    /** @var array<string,Fraction> */
    private array $groupShares;

    /** @var array<string,Fraction[]> */
    private array $individualShares;

    /** @var string[] */
    private array $targets;

    private string $method;

    private string $ruleId;

    private string $reason;

    /**
     * @param array<string,Fraction>   $groupShares
     * @param array<string,Fraction[]> $individualShares
     * @param string[]                 $targets
     */
    private function __construct(
        Fraction $residualConsumed,
        array $groupShares,
        array $individualShares,
        string $method,
        string $ruleId,
        array $targets,
        string $reason
    ) {
        $this->residualConsumed = $residualConsumed->reduce();
        $this->groupShares = $groupShares;
        $this->individualShares = $individualShares;
        $this->method = $method;
        $this->ruleId = $ruleId;
        $this->targets = $targets;
        $this->reason = $reason;
    }

    public static function none(): self
    {
        return new self(Fraction::zero(), [], [], 'none', '', [], '');
    }

    /**
     * @param Fraction[] $shares
     */
    public static function fromSingleGroup(
        string $role,
        array $shares,
        string $ruleId,
        string $reason,
        string $method = 'single'
    ): self {
        $shares = array_values($shares);
        if ($shares === []) {
            return self::none();
        }

        $groupShare = self::sumFractions($shares);

        return new self(
            $groupShare,
            [$role => $groupShare],
            [$role => $shares],
            $method,
            $ruleId,
            [$role],
            $reason
        );
    }

    /**
     * @param Fraction[] $maleShares
     * @param Fraction[] $femaleShares
     */
    public static function fromTwoGroups(
        string $maleRole,
        array $maleShares,
        string $femaleRole,
        array $femaleShares,
        string $ruleId,
        string $reason,
        ?string $method = null
    ): self {
        $maleShares = array_values($maleShares);
        $femaleShares = array_values($femaleShares);
        if ($maleShares === [] && $femaleShares === []) {
            return self::none();
        }

        $groupShares = [];
        $individualShares = [];
        $targets = [];

        if ($maleShares !== []) {
            $groupShares[$maleRole] = self::sumFractions($maleShares);
            $individualShares[$maleRole] = $maleShares;
            $targets[] = $maleRole;
        }

        if ($femaleShares !== []) {
            $groupShares[$femaleRole] = self::sumFractions($femaleShares);
            $individualShares[$femaleRole] = $femaleShares;
            $targets[] = $femaleRole;
        }

        $residualConsumed = self::sumFractions(array_values($groupShares));
        $method ??= ($maleShares !== [] && $femaleShares !== []) ? 'two_to_one' : 'equal';

        return new self(
            $residualConsumed,
            $groupShares,
            $individualShares,
            $method,
            $ruleId,
            $targets,
            $reason
        );
    }

    private static function sumFractions(array $fractions): Fraction
    {
        $sum = Fraction::zero();
        foreach ($fractions as $fraction) {
            if (!$fraction instanceof Fraction) {
                throw new \InvalidArgumentException('Expected Fraction instance.');
            }

            $sum = $sum->add($fraction);
        }

        return $sum->reduce();
    }

    public function isNone(): bool
    {
        return $this->groupShares === [];
    }

    public function method(): string
    {
        return $this->method;
    }

    /**
     * @return array<string,Fraction>
     */
    public function groupShares(): array
    {
        return $this->groupShares;
    }

    /**
     * @return array<string,Fraction[]>
     */
    public function individualShares(): array
    {
        return $this->individualShares;
    }

    public function residualConsumed(): Fraction
    {
        return $this->residualConsumed;
    }

    /**
     * @return string[]
     */
    public function targets(): array
    {
        return $this->targets;
    }

    public function ruleId(): string
    {
        return $this->ruleId;
    }

    public function reason(): string
    {
        return $this->reason;
    }
}
