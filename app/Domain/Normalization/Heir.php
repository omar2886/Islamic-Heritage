<?php

final class Heir
{
    private string $role;
    private string $sex;
    private int $count;
    private bool $alive;
    private int $degree;
    private string $side;

    public function __construct(
        string $role,
        string $sex,
        int $count,
        bool $alive,
        int $degree,
        string $side
    ) {
        $this->role = $role;
        $this->sex = $sex;
        $this->count = $count;
        $this->alive = $alive;
        $this->degree = $degree;
        $this->side = $side;
    }

    public function getRole(): string
    {
        return $this->role;
    }

    public function getSex(): string
    {
        return $this->sex;
    }

    public function getCount(): int
    {
        return $this->count;
    }

    public function isAlive(): bool
    {
        return $this->alive;
    }

    public function getDegree(): int
    {
        return $this->degree;
    }

    public function getSide(): string
    {
        return $this->side;
    }
}
