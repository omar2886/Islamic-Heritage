<?php

namespace App\Domain\Rules;

use App\Domain\Eligibility\EligibilityContext;
use InvalidArgumentException;

final class SpecialCaseActions
{
    public static function execute(string $action, EligibilityContext $context): void
    {
        $normalized = trim($action);
        if ($normalized === '') {
            throw new InvalidArgumentException('Action name cannot be empty.');
        }

        if (!method_exists(self::class, $normalized)) {
            throw new InvalidArgumentException(sprintf('Unknown special case action "%s".', $normalized));
        }

        /** @var callable $callable */
        $callable = [self::class, $normalized];
        $callable($context);
    }

    public static function mark_umariyya(EligibilityContext $context): void
    {
        $context->setFlag('isUmariyya');
    }
}
