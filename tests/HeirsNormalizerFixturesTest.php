<?php
use App\Domain\Normalization\Sex;

require_once __DIR__ . '/../app/Models/PersonNode.php';
require_once __DIR__ . '/../app/Models/SubstitutionManager.php';
require_once __DIR__ . '/../app/Models/BlockageManager.php';
require_once __DIR__ . '/../app/Services/HeirsNormalizer.php';
require_once __DIR__ . '/../app/Domain/Normalization/HeirRole.php';
require_once __DIR__ . '/../app/Domain/Normalization/Sex.php';

function assertSameValue($expected, $actual, string $message = ''): void {
    if ($expected !== $actual) {
        $msg = $message !== '' ? $message : sprintf('Failed asserting that %s matches expected %s.', var_export($actual, true), var_export($expected, true));
        throw new RuntimeException($msg);
    }
}

function assertTrueValue(bool $condition, string $message = ''): void {
    if (!$condition) {
        $msg = $message !== '' ? $message : 'Failed asserting that condition is true.';
        throw new RuntimeException($msg);
    }
}

$substitution = new SubstitutionManager();
$blockage = new BlockageManager();
$normalizer = new HeirsNormalizer();

// Fixture: Nieta por hijo fallecido
$deceasedSon = new PersonNode([
    'id' => 1,
    'heirTypeId' => 3,
    'nombre' => 'Hijo fallecido',
    'vivo' => 0,
    'isAlive' => 0,
    'nivel' => 1,
    'sex' => 'm',
]);

$grandDaughter = new PersonNode([
    'id' => 2,
    'heirTypeId' => 0,
    'nombre' => 'Nieta',
    'vivo' => 1,
    'isAlive' => 1,
    'nivel' => 2,
    'sex' => 'f',
]);

$deceasedSon->children = [$grandDaughter];

$tree = [$deceasedSon, $grandDaughter];

$substitution->apply($tree);
$blockage->apply($tree);

$result = $normalizer->normalize($tree);
$heirs = $result->getHeirs();

$sonsDaughter = null;
foreach ($heirs as $heir) {
    if ($heir->getRole() === HeirRole::SONS_DAUGHTER) {
        $sonsDaughter = $heir;
        break;
    }
}

assertTrueValue($sonsDaughter !== null, 'Expected to find a sons_daughter heir.');
assertSameValue(Sex::FEMALE->value, $sonsDaughter->getSex(), 'Expected the sons_daughter heir to be female.');
assertSameValue(2, $sonsDaughter->getDegree(), 'Expected granddaughter to be at degree 2.');

$context = $result->getContext();
assertTrueValue($context->hasFemaleDescendant(), 'Context should flag presence of female descendants.');

echo "HeirsNormalizer granddaughter fixture passed.\n";
