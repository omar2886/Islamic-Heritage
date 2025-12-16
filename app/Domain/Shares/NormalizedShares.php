<?php

require_once __DIR__ . '/../Math/Fraction.php';
require_once __DIR__ . '/FixedShareResult.php';

use App\Domain\Math\Fraction;

final class NormalizedShares
{
    /** @var array<string,Fraction> */
    private array $normalizedGroupShares;

    /** @var array<string,Fraction[]> */
    private array $normalizedIndividualShares;

    private Fraction $sumFixedNormalized;

    private Fraction $residualForAsaba;

    /**
     * @param array<string,Fraction> $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    private function __construct(
        array $groupShares,
        array $individualShares,
        Fraction $sumFixedNormalized,
        Fraction $residualForAsaba
    ) {
        $this->normalizedGroupShares = $groupShares;
        $this->normalizedIndividualShares = $individualShares;
        $this->sumFixedNormalized = $sumFixedNormalized;
        $this->residualForAsaba = $residualForAsaba;
    }

    /**
     * @param array<string,Fraction> $groupShares
     * @param array<string,Fraction[]> $individualShares
     */
    public static function create(array $groupShares, array $individualShares, Fraction $sumFixedNormalized): self
    {
        $normalizedGroupShares = [];
        foreach ($groupShares as $role => $share) {
            if (!$share instanceof Fraction) {
                throw new \InvalidArgumentException('Group shares must be Fraction instances.');
            }

            $normalizedGroupShares[$role] = $share->reduce();
        }
        ksort($normalizedGroupShares);

        $normalizedIndividualShares = [];
        foreach ($individualShares as $role => $shares) {
            $normalizedIndividualShares[$role] = [];
            foreach ($shares as $fraction) {
                if (!$fraction instanceof Fraction) {
                    throw new \InvalidArgumentException('Individual shares must be Fraction instances.');
                }

                $normalizedIndividualShares[$role][] = $fraction->reduce();
            }
        }
        ksort($normalizedIndividualShares);

        $sum = $sumFixedNormalized->reduce();
        $residual = Fraction::fromInt(1)->sub($sum)->reduce();

        return new self($normalizedGroupShares, $normalizedIndividualShares, $sum, $residual);
    }

    /**
     * @return array<string,Fraction>
     */
    public function getGroupShares(): array
    {
        return $this->normalizedGroupShares;
    }

    /**
     * @return array<string,Fraction[]>
     */
    public function getIndividualShares(): array
    {
        return $this->normalizedIndividualShares;
    }

    public function getSumFixedNormalized(): Fraction
    {
        return $this->sumFixedNormalized;
    }

    public function getResidualForAsaba(): Fraction
    {
        return $this->residualForAsaba;
    }
}

