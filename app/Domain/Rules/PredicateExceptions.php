<?php

namespace App\Domain\Rules;

use RuntimeException;

class PredicateException extends RuntimeException
{
}

class PredicateSyntaxException extends PredicateException
{
}

final class PredicateTokenException extends PredicateSyntaxException
{
}

final class UnknownRoleException extends PredicateException
{
}
