<?php

namespace App\Domain\Rules;

require_once __DIR__ . '/PredicateExceptions.php';
require_once __DIR__ . '/EvalCtx.php';

abstract class Expr
{
    abstract public function eval(EvalCtx $ctx): mixed;

    protected function toBool(mixed $value): bool
    {
        return (bool) $value;
    }
}

final class OrExpr extends Expr
{
    public function __construct(private Expr $left, private Expr $right)
    {
    }

    public function eval(EvalCtx $ctx): bool
    {
        return $this->toBool($this->left->eval($ctx)) || $this->toBool($this->right->eval($ctx));
    }
}

final class AndExpr extends Expr
{
    public function __construct(private Expr $left, private Expr $right)
    {
    }

    public function eval(EvalCtx $ctx): bool
    {
        return $this->toBool($this->left->eval($ctx)) && $this->toBool($this->right->eval($ctx));
    }
}

final class NotExpr extends Expr
{
    public function __construct(private Expr $expr)
    {
    }

    public function eval(EvalCtx $ctx): bool
    {
        return !$this->toBool($this->expr->eval($ctx));
    }
}

final class ComparisonExpr extends Expr
{
    public function __construct(private Expr $left, private string $operator, private Expr $right)
    {
    }

    public function eval(EvalCtx $ctx): bool
    {
        $lhs = $this->left->eval($ctx);
        $rhs = $this->right->eval($ctx);

        return match ($this->operator) {
            '==' => $lhs == $rhs,
            '!=' => $lhs != $rhs,
            '>=' => $lhs >= $rhs,
            '<=' => $lhs <= $rhs,
            '>' => $lhs > $rhs,
            '<' => $lhs < $rhs,
            default => false,
        };
    }
}

final class LiteralExpr extends Expr
{
    public function __construct(private mixed $value)
    {
    }

    public function eval(EvalCtx $ctx): mixed
    {
        return $this->value;
    }
}

final class ContextExpr extends Expr
{
    public function __construct(private string $name, private int $offset)
    {
    }

    public function eval(EvalCtx $ctx): int|bool
    {
        if (!$ctx->hasContextKey($this->name)) {
            throw new PredicateSyntaxException(sprintf('Unknown context alias "%s" at position %d.', $this->name, $this->offset));
        }

        return $ctx->context($this->name);
    }
}

final class CallExpr extends Expr
{
    /** @var Expr[] */
    private array $args;

    public function __construct(private string $fn, array $args, private int $offset)
    {
        $this->args = $args;
    }

    public function eval(EvalCtx $ctx): mixed
    {
        $evaluated = [];
        foreach ($this->args as $arg) {
            $evaluated[] = $arg->eval($ctx);
        }

        return $ctx->call($this->fn, $evaluated, $this->offset);
    }
}
