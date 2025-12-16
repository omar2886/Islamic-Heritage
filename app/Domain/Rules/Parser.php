<?php

namespace App\Domain\Rules;

require_once __DIR__ . '/PredicateExceptions.php';
require_once __DIR__ . '/Ast.php';

final class Parser
{
    /** @var array<int,array{type:string,value:mixed,offset:int}> */
    private array $tokens = [];
    private int $position = 0;

    public function parse(string $src): Expr
    {
        $this->tokens = $this->tokenize($src);
        $this->position = 0;

        $expr = $this->parseOr();

        if ($this->position !== count($this->tokens)) {
            $unexpected = $this->tokens[$this->position]['value'];
            $offset = $this->tokens[$this->position]['offset'];
            throw new PredicateSyntaxException(sprintf('Unexpected token "%s" at position %d.', $unexpected, $offset));
        }

        return $expr;
    }

    private function parseOr(): Expr
    {
        $left = $this->parseAnd();

        while ($this->match('||')) {
            $right = $this->parseAnd();
            $left = new OrExpr($left, $right);
        }

        return $left;
    }

    private function parseAnd(): Expr
    {
        $left = $this->parseNot();

        while ($this->match('&&')) {
            $right = $this->parseNot();
            $left = new AndExpr($left, $right);
        }

        return $left;
    }

    private function parseNot(): Expr
    {
        if ($this->match('!')) {
            $expr = $this->parseNot();
            return new NotExpr($expr);
        }

        return $this->parseComparison();
    }

    private function parseComparison(): Expr
    {
        $left = $this->parsePrimary();

        $operators = ['==', '!=', '>=', '<=', '>', '<'];
        if ($this->peekIn($operators)) {
            $operator = $this->consume()['type'];
            $right = $this->parsePrimary();

            return new ComparisonExpr($left, $operator, $right);
        }

        return $left;
    }

    private function parsePrimary(): Expr
    {
        $token = $this->tokens[$this->position] ?? null;
        if ($token === null) {
            throw new PredicateSyntaxException('Unexpected end of expression.');
        }

        $type = $token['type'];
        if ($type === '(') {
            $this->position++;
            $expr = $this->parseOr();
            if (!$this->match(')')) {
                throw new PredicateSyntaxException('Missing closing parenthesis.');
            }
            return $expr;
        }

        if ($type === 'identifier') {
            $this->position++;
            $identifier = (string) $token['value'];

            if ($this->match('(')) {
                $args = $this->parseArguments();
                if (!$this->match(')')) {
                    throw new PredicateSyntaxException('Expected ")" after function arguments.');
                }

                return new CallExpr($identifier, $args, $token['offset']);
            }

            if (strncmp($identifier, 'ctx.', 4) === 0) {
                $contextName = substr($identifier, 4);
                if ($contextName === '') {
                    throw new PredicateSyntaxException(sprintf('Invalid context accessor at position %d.', $token['offset']));
                }

                return new ContextExpr($this->normalizeContextName($contextName), $token['offset']);
            }

            throw new PredicateSyntaxException(sprintf('Unknown identifier "%s" at position %d.', $identifier, $token['offset']));
        }

        if ($type === 'string') {
            $this->position++;
            return new LiteralExpr((string) $token['value']);
        }

        if ($type === 'number') {
            $this->position++;
            return new LiteralExpr((int) $token['value']);
        }

        throw new PredicateSyntaxException(sprintf('Unexpected token "%s".', $token['value']));
    }

    /**
     * @return Expr[]
     */
    private function parseArguments(): array
    {
        $args = [];
        if ($this->peekType(')')) {
            return $args;
        }

        do {
            $args[] = $this->parseOr();
        } while ($this->match(','));

        return $args;
    }

    /**
     * @param array<int,string> $types
     */
    private function peekIn(array $types): bool
    {
        $type = $this->tokens[$this->position]['type'] ?? null;
        if ($type === null) {
            return false;
        }

        return in_array($type, $types, true);
    }

    private function peekType(string $type): bool
    {
        return ($this->tokens[$this->position]['type'] ?? null) === $type;
    }

    private function match(string $type): bool
    {
        if ($this->peekType($type)) {
            $this->position++;
            return true;
        }

        return false;
    }

    /**
     * @return array{type:string,value:mixed,offset:int}
     */
    private function consume(): array
    {
        return $this->tokens[$this->position++];
    }

    private function normalizeContextName(string $identifier): string
    {
        $normalized = preg_replace('/([a-z])([A-Z])/', '$1_$2', $identifier);
        $normalized = strtolower(str_replace(['__', '-'], '_', (string) $normalized));
        $normalized = str_replace('_pre_block', '_preblock', $normalized);

        return $normalized;
    }

    /**
     * @return array<int,array{type:string,value:mixed,offset:int}>
     */
    private function tokenize(string $expression): array
    {
        $length = strlen($expression);
        $tokens = [];
        $offset = 0;

        while ($offset < $length) {
            $char = $expression[$offset];

            if (ctype_space($char)) {
                $offset++;
                continue;
            }

            if ($char === '!' || $char === '(' || $char === ')' || $char === ',') {
                $tokens[] = ['type' => $char, 'value' => $char, 'offset' => $offset];
                $offset++;
                continue;
            }

            if ($char === '&' || $char === '|') {
                $pair = substr($expression, $offset, 2);
                if ($pair !== '&&' && $pair !== '||') {
                    throw new PredicateTokenException(sprintf('Invalid operator starting at position %d.', $offset));
                }

                $tokens[] = ['type' => $pair, 'value' => $pair, 'offset' => $offset];
                $offset += 2;
                continue;
            }

            if ($char === '=' || $char === '!' || $char === '<' || $char === '>') {
                $pair = substr($expression, $offset, 2);
                $single = $expression[$offset];

                $operators = ['==', '!=', '>=', '<='];
                if (in_array($pair, $operators, true)) {
                    $tokens[] = ['type' => $pair, 'value' => $pair, 'offset' => $offset];
                    $offset += 2;
                    continue;
                }

                if ($single === '<' || $single === '>') {
                    $tokens[] = ['type' => $single, 'value' => $single, 'offset' => $offset];
                    $offset++;
                    continue;
                }

                if ($single === '!') {
                    throw new PredicateTokenException(sprintf('Invalid token "!" at position %d.', $offset));
                }
            }

            if ($char === '"' || $char === '\'') {
                $quote = $char;
                $offset++;
                $start = $offset;
                $buffer = '';

                while ($offset < $length) {
                    $current = $expression[$offset];
                    if ($current === '\\') {
                        if ($offset + 1 >= $length) {
                            throw new PredicateTokenException('Unterminated escape sequence in string literal.');
                        }
                        $buffer .= $expression[$offset + 1];
                        $offset += 2;
                        continue;
                    }

                    if ($current === $quote) {
                        $tokens[] = ['type' => 'string', 'value' => $buffer, 'offset' => $start - 1];
                        $offset++;
                        continue 2;
                    }

                    $buffer .= $current;
                    $offset++;
                }

                throw new PredicateTokenException('Unterminated string literal.');
            }

            if (ctype_digit($char)) {
                $start = $offset;
                while ($offset < $length && ctype_digit($expression[$offset])) {
                    $offset++;
                }

                $number = substr($expression, $start, $offset - $start);
                $tokens[] = ['type' => 'number', 'value' => (int) $number, 'offset' => $start];
                continue;
            }

            if (ctype_alpha($char) || $char === '_') {
                $start = $offset;
                $identifier = '';
                while ($offset < $length) {
                    $current = $expression[$offset];
                    if (ctype_alnum($current) || $current === '_' || $current === '.') {
                        $identifier .= $current;
                        $offset++;
                        continue;
                    }
                    break;
                }

                $tokens[] = ['type' => 'identifier', 'value' => $identifier, 'offset' => $start];
                continue;
            }

            throw new PredicateTokenException(sprintf('Invalid character "%s" at position %d.', $char, $offset));
        }

        return $tokens;
    }
}
