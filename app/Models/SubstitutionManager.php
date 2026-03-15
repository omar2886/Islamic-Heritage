<?php
/**
 * app/Models/SubstitutionManager.php
 *
 * Aplica sustituciones: si un heredero no está vivo y tiene descendientes,
 * lo reemplaza por sus hijos, repartiendo su cuota.
 */
require_once __DIR__ . '/../Domain/Math/Fraction.php';

use App\Domain\Math\Fraction;

class SubstitutionManager
{
    public function apply(array &$nodes): void
    {
        foreach ($nodes as $key => &$node) {
            // Si el nodo está muerto o bloqueado, sus hijos “sustituyen”.
            if ((!$node->isAlive || $node->blocked) && !empty($node->children)) {
                $this->replaceNodeWithChildren($nodes, $key, $node);
            } else {
                if (!empty($node->children)) {
                    $this->apply($node->children);
                }
            }
        }
    }

    private function replaceNodeWithChildren(array &$nodes, int $key, PersonNode $deadNode): void
    {
        $numChildren = count($deadNode->children);
        if ($numChildren > 0) {
            $sharePerChild = $deadNode->shareFraction instanceof Fraction
                ? $deadNode->shareFraction->div(Fraction::fromInt($numChildren))
                : Fraction::zero();

            foreach ($deadNode->children as $child) {
                $existing = $child->shareFraction instanceof Fraction ? $child->shareFraction : Fraction::zero();
                $child->shareFraction = $existing->add($sharePerChild);
            }
        }
        // Eliminar el nodo del array principal
        unset($nodes[$key]);
    }
}
