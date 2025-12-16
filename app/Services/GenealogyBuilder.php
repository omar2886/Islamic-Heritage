<?php
/**
 * app/Services/GenealogyBuilder.php
 */
require_once __DIR__ . '/../Models/Database.php';
require_once __DIR__ . '/../Models/PersonNode.php';

class GenealogyBuilder
{
    protected $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    public function buildGenealogy(int $caseId): array
    {
        $sql = "SELECT h.id, h.case_id, h.tipo_heredero, h.nombre,
                       h.vivo, h.lineage_side, h.father_id, h.mother_id, h.spouse_id,
                       h.sex, h.is_alive, h.blocked,
                       ht.name as heir_type_name, h.parent_id
                FROM heirs h
                LEFT JOIN heir_types ht ON ht.id = h.tipo_heredero
                WHERE h.case_id = :cid";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':cid' => $caseId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $map = [];
        foreach ($rows as $r) {
            $data = [
                'id'           => $r['id'],
                'caseId'       => $r['case_id'],
                'heirTypeId'   => (int)$r['tipo_heredero'],
                'nombre'       => $r['nombre'],
                'vivo'         => (int)$r['vivo'],
                'fatherId'     => $r['father_id'],
                'motherId'     => $r['mother_id'],
                'spouseId'     => $r['spouse_id'],
                'sex'          => $r['sex'],
                'isAlive'      => (int)$r['is_alive'],
                'blocked'      => (bool)$r['blocked'],
                'lineage_side' => $r['lineage_side'],
                'nivel'        => 0
            ];
            $pn = new PersonNode($data);
            $pn->heirTypeName = $r['heir_type_name'] ?? '';
            // Usar null coalescing para parent_id
            $pn->parentId = $r['parent_id'] ?? '';
            $map[$r['id']] = $pn;
        }

        // Enlazar children usando parent_id
        foreach ($map as $id => $node) {
            if (!empty($node->parentId) && isset($map[$node->parentId])) {
                $map[$node->parentId]->children[] = $node;
            }
        }

        // Top-level: nodos sin parent_id (vacío o NULL)
        $tops = [];
        foreach ($map as $node) {
            if (empty($node->parentId)) {
                $tops[] = $node;
            }
        }

        // Asignar nivel: top-level => nivel = 0; hijos => 1; nietos = 2; etc.
        foreach ($tops as $top) {
            $top->nivel = 0;
            $this->assignLevels($top, 0);
        }

        return $tops;
    }

    private function assignLevels(PersonNode $node, int $level)
    {
        $childLevel = $level + 1;
        foreach ($node->children as $child) {
            $child->nivel = $childLevel;
            $this->assignLevels($child, $childLevel);
        }
    }

    public function gatherChildren(array $nodes): array
    {
        $children = [];
        foreach ($nodes as $node) {
            if (($node->heirTypeId === 3 || $node->heirTypeId === 4) && $node->isAlive == 1 && !$node->blocked) {
                $children[] = $node;
            }
            if (!empty($node->children)) {
                $children = array_merge($children, $this->gatherChildren($node->children));
            }
        }
        return $children;
    }

    public function deceasedHasChildren(array $nodes): bool
    {
        foreach ($nodes as $node) {
            if (($node->heirTypeId === 3 || $node->heirTypeId === 4) && $node->isAlive == 1 && !$node->blocked) {
                return true;
            }
            if (!empty($node->children) && $this->deceasedHasChildren($node->children)) {
                return true;
            }
        }
        return false;
    }
}
