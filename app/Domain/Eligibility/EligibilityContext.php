<?php

namespace App\Domain\Eligibility;

use App\Domain\Rules\EvalCtx as RuleEvalCtx;
use App\Domain\Rules\Evaluator as RuleEvaluator;
use App\Domain\Rules\Parser as RuleParser;
use ContextFlags;
use InvalidArgumentException;

require_once __DIR__ . '/../Rules/EvalCtx.php';
require_once __DIR__ . '/../Rules/Parser.php';
require_once __DIR__ . '/../Rules/Evaluator.php';
require_once __DIR__ . '/../Normalization/NormalizationResult.php';

final class EligibilityContext
{
    public readonly bool $motherReduced;
    public readonly bool $uterinesBlocked;
    public readonly bool $motherThirdOfRemainderCandidate;
    public readonly int $siblingsCountPreBlock;
    public readonly bool $isKalala;
    public readonly bool $hasAscMale;

    /**
     * @var array<string,bool>
     */
    private array $flags;

    /**
     * @var string[]
     */
    public readonly array $blockedRoles;

    /**
     * @var string[]
     */
    public readonly array $appliedSpecialFlags;

    private ContextFlags $contextFlags;
    private ?\NormalizationResult $normalization = null;
    private ?RuleEvalCtx $ruleEvalCtx = null;

    /**
     * @var array<string,\App\Domain\Rules\Expr>
     */
    private array $parsedExpressions = [];

    private static ?RuleParser $ruleParser = null;
    private static ?RuleEvaluator $ruleEvaluator = null;

    /**
     * @param string[] $blockedRoles
     * @param string[] $appliedSpecialFlags
     */
    public function __construct(
        bool $motherReduced,
        bool $uterinesBlocked,
        bool $motherThirdOfRemainderCandidate,
        array $blockedRoles,
        ContextFlags $contextFlags,
        array $appliedSpecialFlags = [],
        int $siblingsCountPreBlock = 0,
        bool $isKalala = false,
        bool $hasAscMale = false,
        array $flags = [],
        ?\NormalizationResult $normalization = null
    ) {
        $this->motherReduced = $motherReduced;
        $this->uterinesBlocked = $uterinesBlocked;
        $this->motherThirdOfRemainderCandidate = $motherThirdOfRemainderCandidate;
        $this->blockedRoles = array_values(array_unique($blockedRoles));
        $this->contextFlags = $contextFlags;
        $this->appliedSpecialFlags = array_values(array_unique($appliedSpecialFlags));
        $this->siblingsCountPreBlock = $siblingsCountPreBlock;
        $this->isKalala = $isKalala;
        $this->hasAscMale = $hasAscMale;
        $this->flags = [];
        $this->normalization = $normalization;

        foreach ($flags as $name => $value) {
            $this->setFlag($name, (bool) $value);
        }
    }

    public function getContextFlags(): ContextFlags
    {
        return $this->contextFlags;
    }

    public function getNormalization(): ?\NormalizationResult
    {
        return $this->normalization;
    }

    public function hasDescendants(): bool
    {
        return $this->contextFlags->hasDescendants();
    }

    public function hasMaleDescendant(): bool
    {
        return $this->contextFlags->hasMaleDescendant();
    }

    public function hasFemaleDescendant(): bool
    {
        return $this->contextFlags->hasFemaleDescendant();
    }

    public function isMotherThirdOfRemainderCandidate(): bool
    {
        return $this->motherThirdOfRemainderCandidate;
    }

    /**
     * @return string[]
     */
    public function getAppliedSpecialFlags(): array
    {
        return $this->appliedSpecialFlags;
    }

    public function isKalala(): bool
    {
        return $this->isKalala;
    }

    public function hasAscMale(): bool
    {
        return $this->hasAscMale;
    }

    public function isUmariyya(): bool
    {
        return $this->getFlag('isUmariyya');
    }

    public function setFlag(string $name, bool $value = true): void
    {
        $normalized = trim($name);
        if ($normalized === '') {
            throw new InvalidArgumentException('Flag name cannot be empty.');
        }

        $this->flags[$normalized] = $value;
        $this->ruleEvalCtx = null;
    }

    public function getFlag(string $name, bool $default = false): bool
    {
        return $this->flags[$name] ?? $default;
    }

    /**
     * @return array<string,bool>
     */
    public function getFlags(): array
    {
        ksort($this->flags);

        return $this->flags;
    }

    /**
     * @param array<int,string> $expressions
     */
    public function evaluateOr(bool $default, array $expressions): bool
    {
        if ($expressions === []) {
            return $default;
        }

        $ctx = $this->ensureRuleEvalCtx();
        if ($ctx === null) {
            return $default;
        }

        foreach ($expressions as $expression) {
            $normalized = trim($expression);
            if ($normalized === '') {
                continue;
            }

            $expr = $this->parsedExpressions[$normalized] ?? null;
            if ($expr === null) {
                $expr = self::getRuleParser()->parse($normalized);
                $this->parsedExpressions[$normalized] = $expr;
            }

            if (self::getRuleEvaluator()->evaluate('ctx:' . $normalized, $expr, $ctx)) {
                return true;
            }
        }

        return false;
    }

    private function ensureRuleEvalCtx(): ?RuleEvalCtx
    {
        if ($this->normalization === null) {
            return null;
        }

        if ($this->ruleEvalCtx === null) {
            $this->ruleEvalCtx = new RuleEvalCtx($this->normalization, $this->flags);
        }

        return $this->ruleEvalCtx;
    }

    private static function getRuleParser(): RuleParser
    {
        if (self::$ruleParser === null) {
            self::$ruleParser = new RuleParser();
        }

        return self::$ruleParser;
    }

    private static function getRuleEvaluator(): RuleEvaluator
    {
        if (self::$ruleEvaluator === null) {
            self::$ruleEvaluator = new RuleEvaluator();
        }

        return self::$ruleEvaluator;
    }
}
