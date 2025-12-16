<?php

declare(strict_types=1);

require_once __DIR__ . '/MiniTestCase.php';

final class PaternalUnclesAsabaTest extends MiniTestCase
{
    public function testSinglePaternalUncleAbsorbsResidual(): void
    {
        $out = TestHarness::calc([
            ['role' => HeirRole::PATERNAL_UNCLE, 'count' => 1],
        ])->run();

        $this->assertSame('1/1', $out['group_shares'][HeirRole::PATERNAL_UNCLE]);
        $this->assertSame(['1/1'], $out['individual_shares'][HeirRole::PATERNAL_UNCLE]);
    }

    public function testPaternalUnclesTwoToOneSplitWithDaughters(): void
    {
        $out = TestHarness::calc([
            ['role' => HeirRole::PATERNAL_UNCLE, 'count' => 1],
            ['role' => HeirRole::PATERNAL_UNCLES_DAUGHTER, 'count' => 1],
        ])->run();

        $this->assertSame(['2/3'], $out['individual_shares'][HeirRole::PATERNAL_UNCLE]);
        $this->assertSame(['1/3'], $out['individual_shares'][HeirRole::PATERNAL_UNCLES_DAUGHTER]);
    }

    public function testFallbackToConsanguineUncles(): void
    {
        $out = TestHarness::calc([
            ['role' => HeirRole::CONSANGUINE_PATERNAL_UNCLE, 'count' => 2],
        ])->run();

        $this->assertSame('1/1', $out['group_shares'][HeirRole::CONSANGUINE_PATERNAL_UNCLE]);
        $this->assertSame(['1/2', '1/2'], $out['individual_shares'][HeirRole::CONSANGUINE_PATERNAL_UNCLE]);
    }

    public function testFallbackToPaternalUncleSons(): void
    {
        $out = TestHarness::calc([
            ['role' => HeirRole::PATERNAL_UNCLE_SON, 'count' => 1],
            ['role' => HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER, 'count' => 2],
        ])->run();

        $this->assertSame(['1/2'], $out['individual_shares'][HeirRole::PATERNAL_UNCLE_SON]);
        $this->assertSame(['1/4', '1/4'], $out['individual_shares'][HeirRole::PATERNAL_UNCLE_SONS_DAUGHTER]);
    }
}
