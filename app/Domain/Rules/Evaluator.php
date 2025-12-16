<?php

namespace App\Domain\Rules;

require_once __DIR__ . '/Ast.php';
require_once __DIR__ . '/EvalCtx.php';

final class Evaluator
{
    /** @var array<string,bool> */
    private array $memo = [];

    public function evaluate(string $key, Expr $expr, EvalCtx $ctx): bool
    {
        if (array_key_exists($key, $this->memo)) {
            return $this->memo[$key];
        }

        $result = (bool) $expr->eval($ctx);
        $this->memo[$key] = $result;

        return $result;
    }
}
