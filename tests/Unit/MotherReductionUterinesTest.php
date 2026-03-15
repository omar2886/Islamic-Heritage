<?php

declare(strict_types=1);

require_once __DIR__ . '/MiniTestCase.php';

final class MotherReductionUterinesTest extends MiniTestCase
{
    public function testMotherReductionWithSiblings(): void
    {
        $out = TestHarness::calc([
            ['role' => 'mother', 'count' => 1],
            ['role' => 'full_brother', 'count' => 2],
        ])->run();
        $this->assertSame('1/6', $out['group_shares']['mother']);
    }
}
