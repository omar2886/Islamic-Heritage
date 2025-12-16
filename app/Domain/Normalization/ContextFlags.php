<?php

final class ContextFlags
{
    private bool $hasDescendants;
    private bool $hasMaleDescendant;
    private bool $hasFemaleDescendant;
    private bool $hasFather;
    private bool $hasPaternalGrandfather;
    private int $siblingsCount;
    private int $uterinesCount;
    private int $wivesCount;

    public function __construct(
        bool $hasDescendants,
        bool $hasMaleDescendant,
        bool $hasFemaleDescendant,
        bool $hasFather,
        bool $hasPaternalGrandfather,
        int $siblingsCount,
        int $uterinesCount,
        int $wivesCount
    ) {
        $this->hasDescendants = $hasDescendants;
        $this->hasMaleDescendant = $hasMaleDescendant;
        $this->hasFemaleDescendant = $hasFemaleDescendant;
        $this->hasFather = $hasFather;
        $this->hasPaternalGrandfather = $hasPaternalGrandfather;
        $this->siblingsCount = $siblingsCount;
        $this->uterinesCount = $uterinesCount;
        $this->wivesCount = $wivesCount;
    }

    public function hasDescendants(): bool
    {
        return $this->hasDescendants;
    }

    public function hasMaleDescendant(): bool
    {
        return $this->hasMaleDescendant;
    }

    public function hasFemaleDescendant(): bool
    {
        return $this->hasFemaleDescendant;
    }

    public function hasFather(): bool
    {
        return $this->hasFather;
    }

    public function hasPaternalGrandfather(): bool
    {
        return $this->hasPaternalGrandfather;
    }

    public function getSiblingsCount(): int
    {
        return $this->siblingsCount;
    }

    public function getUterinesCount(): int
    {
        return $this->uterinesCount;
    }

    public function getWivesCount(): int
    {
        return $this->wivesCount;
    }
}
