<?php

namespace App\Domain\Rules;

require_once __DIR__ . '/PredicateExceptions.php';
require_once __DIR__ . '/Parser.php';
require_once __DIR__ . '/Evaluator.php';
require_once __DIR__ . '/EvalCtx.php';
require_once __DIR__ . '/../Normalization/NormalizationResult.php';
require_once __DIR__ . '/../Normalization/ContextFlags.php';
require_once __DIR__ . '/../Normalization/Heir.php';
require_once __DIR__ . '/../Normalization/HeirRole.php';

final class Predicates
{
    /** @var array<string,Expr> */
    private static array $exprCache = [];

    private static ?Evaluator $evaluator = null;

    /**
     * @param array<string,mixed> $memo
     * @param array<string,mixed> $flags
     */
    public static function eval(
        string $expression,
        \NormalizationResult $normalization,
        ?array &$memo = null,
        array $flags = [],
        ?string $predicateKey = null
    ): bool {
        $expression = trim($expression);
        if ($expression === '') {
            throw new PredicateSyntaxException('Expression cannot be empty.');
        }

        $ast = self::$exprCache[$expression] ?? null;
        if ($ast === null) {
            $parser = new Parser();
            $ast = $parser->parse($expression);
            self::$exprCache[$expression] = $ast;
        }

        $ctx = new EvalCtx($normalization, $flags);
        $key = $predicateKey ?? $expression;
        $memoKey = self::buildMemoKey($key, $ctx);

        $result = self::getEvaluator()->evaluate($memoKey, $ast, $ctx);

        if ($memo !== null) {
            $memo[$key][$ctx->snapshot()] = $result;
        }

        return $result;
    }

    private static function buildMemoKey(string $key, EvalCtx $ctx): string
    {
        return $key . '@' . $ctx->snapshot();
    }

    private static function getEvaluator(): Evaluator
    {
        if (self::$evaluator === null) {
            self::$evaluator = new Evaluator();
        }

        return self::$evaluator;
    }
}
