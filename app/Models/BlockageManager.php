<?php
/**
 * app/Models/BlockageManager.php
 * Bloquea descendientes (niveles ≥1) de herederos directos vivos.
 */
class BlockageManager
{
    public function apply(array &$nodes): void
    {
        foreach ($nodes as &$node) {
            if ($node->nivel === 0 && $node->isAlive && !$node->blocked) {
    $this->blockDescendants($node->children);
}
            if (!empty($node->children)) {
                $this->apply($node->children);
            }
        }
    }

    private function blockDescendants(array &$children): void
    {
        foreach ($children as $child) {
            $child->blocked = true;
            if (!empty($child->children)) {
                $this->blockDescendants($child->children);
            }
        }
    }
}
