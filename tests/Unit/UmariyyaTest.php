<?php

declare(strict_types=1);

require_once __DIR__ . '/MiniTestCase.php';

final class UmariyyaTest extends MiniTestCase
{
    public function testUmariyyaWithHusband(): void
    {
        $calc = TestHarness::calc([
            ['role' => 'husband', 'count' => 1],
            ['role' => 'mother', 'count' => 1],
            ['role' => 'father', 'count' => 1],
        ]);
        $out = $calc->run();
        $this->assertSame('1/2', $out['group_shares']['husband']);
        $this->assertSame('1/6', $out['group_shares']['mother']);
        $this->assertSame('1/3', $out['group_shares']['father']);
    }
}
