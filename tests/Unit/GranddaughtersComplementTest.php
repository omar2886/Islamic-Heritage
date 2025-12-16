<?php

declare(strict_types=1);

require_once __DIR__ . '/MiniTestCase.php';

final class GranddaughtersComplementTest extends MiniTestCase
{
    public function testSingleDaughterWithBisGranddaughters(): void
    {
        $out = TestHarness::calc([
            ['role' => 'daughter', 'count' => 1],
            ['role' => 'sons_sons_daughter', 'count' => 2],
        ])->run();
        $this->assertSame('3/4', $out['group_shares']['daughter']);
        $this->assertSame('1/4', $out['group_shares']['sons_sons_daughter']);
    }
}
