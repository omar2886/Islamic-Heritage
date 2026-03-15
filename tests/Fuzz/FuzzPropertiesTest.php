<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class FuzzPropertiesTest extends TestCase
{
    public function testFuzz100DeterministicAndSums(): void
    {
        $php = trim(shell_exec('which php') ?: 'php');
        $cmd = escapeshellarg($php).' '.escapeshellarg(__DIR__.'/../fuzz/fuzz.php').' --cases=100 --seed=4242';
        exec($cmd, $out, $code);
        $this->assertSame(0, $code, "Fuzz run failed:\n".implode("\n",$out));
    }
}
