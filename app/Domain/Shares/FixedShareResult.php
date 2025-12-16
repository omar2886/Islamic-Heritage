<?php

require_once __DIR__ . '/../Math/Fraction.php';

use App\Domain\Math\Fraction;

final class FixedShareResult
{
    /** @var array<string,Fraction> */
    private array $groupShares;

    /** @var array<string,Fraction[]> */
    private array $individualShares;

    private Fraction $sumFixed;

    private bool $motherThirdOfRemainder;

    private function __construct(
        array $groupShares,
        array $individualShares,
        Fraction $sumFixed,
        bool $motherThirdOfRemainder
    ) {
        $this->groupShares = $groupShares;
        $this->individualShares = $individualShares;
        $this->sumFixed = $sumFixed;
        $this->motherThirdOfRemainder = $motherThirdOfRemainder;
    }

    public static function empty(): self
    {
        return new self([], [], Fraction::zero(), false);
    }

    public static function fromParts(
        array $groupShares,
        array $individualShares,
        Fraction $sumFixed,
        bool $motherThirdOfRemainder
    ): self {
        return new self(
            self::normalizeGroupShares($groupShares),
            self::normalizeIndividualShares($individualShares),
            $sumFixed->reduce(),
            $motherThirdOfRemainder
        );
    }

    public function withGroupShare(string $role, Fraction $share): self
    {
        $groupShares = $this->groupShares;
        $groupShares[$role] = $share->reduce();
        ksort($groupShares);

        $sum = self::sumFractions($groupShares);

        return new self($groupShares, $this->individualShares, $sum, $this->motherThirdOfRemainder);
    }

    /**
     * @param Fraction[] $shares
     */
    public function withIndividualShares(string $role, array $shares): self
    {
        $individualShares = $this->individualShares;
        $individualShares[$role] = self::normalizeShareList($shares);
        ksort($individualShares);

        return new self($this->groupShares, $individualShares, $this->sumFixed, $this->motherThirdOfRemainder);
    }

    public function markMotherThirdOfRemainder(): self
    {
        if ($this->motherThirdOfRemainder) {
            return $this;
        }

        return new self($this->groupShares, $this->individualShares, $this->sumFixed, true);
    }

    /**
     * @return array<string,Fraction>
     */
    public function getGroupShares(): array
    {
        return $this->groupShares;
    }

    /**
     * @return array<string,Fraction[]>
     */
    public function getIndividualShares(): array
    {
        return $this->individualShares;
    }

    public function getSumFixed(): Fraction
    {
        return $this->sumFixed;
    }

    public function usesMotherThirdOfRemainder(): bool
    {
        return $this->motherThirdOfRemainder;
    }

    /**
     * @param array<string,Fraction> $shares
     */
    private static function normalizeGroupShares(array $shares): array
    {
        $normalized = [];
        foreach ($shares as $role => $share) {
            if (!$share instanceof Fraction) {
                throw new \InvalidArgumentException('Group shares must be Fraction instances.');
            }

            $normalized[$role] = $share->reduce();
        }

        ksort($normalized);

        return $normalized;
    }

    /**
     * @param array<string,Fraction[]> $shares
     */
    private static function normalizeIndividualShares(array $shares): array
    {
        $normalized = [];
        foreach ($shares as $role => $fractions) {
            $normalized[$role] = self::normalizeShareList($fractions);
        }

        ksort($normalized);

        return $normalized;
    }

    /**
     * @param Fraction[] $shares
     *
     * @return Fraction[]
     */
    private static function normalizeShareList(array $shares): array
    {
        $normalized = [];
        foreach ($shares as $fraction) {
            if (!$fraction instanceof Fraction) {
                throw new \InvalidArgumentException('Individual shares must be fractions.');
            }

            $normalized[] = $fraction->reduce();
        }

        return $normalized;
    }

    /**
     * @param array<string,Fraction> $fractions
     */
    private static function sumFractions(array $fractions): Fraction
    {
        $sum = Fraction::zero();
        foreach ($fractions as $fraction) {
            $sum = $sum->add($fraction);
        }

        return $sum->reduce();
    }
}
