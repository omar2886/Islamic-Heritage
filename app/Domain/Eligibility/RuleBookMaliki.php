<?php

namespace App\Domain\Eligibility;

require_once __DIR__ . '/../Normalization/NormalizationResult.php';
require_once __DIR__ . '/../Normalization/ContextFlags.php';
require_once __DIR__ . '/../Normalization/Heir.php';
require_once __DIR__ . '/../Normalization/HeirRole.php';

final class RuleBookMaliki
{
    /**
     * @return array<int, array{ruleId: string, targets: array<int, string>, reason: string, predicate: callable}>
     */
    public function getBlockRules(): array
    {
        return [
            [
                'ruleId' => 'rb.son.blocks_full_consanguine',
                'targets' => [
                    \HeirRole::FULL_BROTHER,
                    \HeirRole::FULL_SISTER,
                    \HeirRole::CONSANGUINE_BROTHER,
                    \HeirRole::CONSANGUINE_SISTER,
                ],
                'reason' => 'blocked by presence of son',
                'predicate' => static function (\NormalizationResult $norm): bool {
                    foreach ($norm->getHeirs() as $heir) {
                        if ($heir->isAlive() && $heir->getRole() === \HeirRole::SON && $heir->getCount() > 0) {
                            return true;
                        }
                    }

                    return false;
                },
            ],
            [
                'ruleId' => 'rb.paternal_asc.blocks_full_consanguine',
                'targets' => [
                    \HeirRole::FULL_BROTHER,
                    \HeirRole::FULL_SISTER,
                    \HeirRole::CONSANGUINE_BROTHER,
                    \HeirRole::CONSANGUINE_SISTER,
                ],
                'reason' => 'blocked by paternal ascendant',
                'predicate' => static function (\NormalizationResult $norm): bool {
                    $ctx = $norm->getContext();

                    return $ctx->hasFather() || $ctx->hasPaternalGrandfather();
                },
            ],
            [
                'ruleId' => 'rb.paternal_line.blocks_uterines',
                'targets' => [
                    \HeirRole::UTERINE_BROTHER,
                    \HeirRole::UTERINE_SISTER,
                ],
                'reason' => 'blocked by descendant or paternal ascendant',
                'predicate' => static function (\NormalizationResult $norm): bool {
                    $ctx = $norm->getContext();

                    return $ctx->hasDescendants() || $ctx->hasFather() || $ctx->hasPaternalGrandfather();
                },
            ],
            [
                'ruleId' => 'rb.son.blocks_paternal_grandfather',
                'targets' => [
                    \HeirRole::PATERNAL_GRANDFATHER,
                ],
                'reason' => 'blocked by closer male descendant',
                'predicate' => static function (\NormalizationResult $norm): bool {
                    foreach ($norm->getHeirs() as $heir) {
                        if ($heir->isAlive() && $heir->getRole() === \HeirRole::SON && $heir->getCount() > 0) {
                            return true;
                        }
                    }

                    return false;
                },
            ],
        ];
    }

    public function shouldReduceMother(\ContextFlags $ctx): bool
    {
        return $ctx->hasDescendants() || $ctx->getSiblingsCount() >= 2;
    }
}
