<?php
/**
 * app/Models/PersonNode.php
 * Clase que representa un nodo en el árbol genealógico.
 */

require_once __DIR__ . '/../Domain/Math/Fraction.php';

use App\Domain\Math\Fraction;

class PersonNode
{
    public $id;
    public $caseId;
    public $heirTypeId;
    public $nombre;
    public $vivo;         // 1 = vivo, 0 = muerto
    public $count;
    public $parentId;     // Para enlazar descendientes (según el mapping)
    public $lineage_side; // (paternal/maternal)

    public $fatherId;
    public $motherId;
    public $spouseId;
    public $sex = 'M';
    public $isAlive = 1;
    public $blocked = false;

    public $children = [];
    public Fraction $shareFraction;
    public $heirTypeName = '';

    // Nuevo campo para el nivel (0 = directos, 1 = descendientes directos, 2 = nietos, etc.)
    public $nivel = 0;

    public function __construct($data = [])
    {
        foreach ($data as $key => $value) {
            if (property_exists($this, $key)) {
                $this->$key = $value;
            }
        }
        $this->vivo = isset($data['vivo']) ? intval($data['vivo']) : 1;
        if (!isset($data['isAlive'])) {
            $this->isAlive = $this->vivo;
        }
        if (isset($data['shareFraction'])) {
            $value = $data['shareFraction'];
            if ($value instanceof Fraction) {
                $this->shareFraction = $value;
            } elseif (is_string($value)) {
                $this->shareFraction = Fraction::fromString($value);
            } else {
                $this->shareFraction = Fraction::zero();
            }
        } else {
            $this->shareFraction = Fraction::zero();
        }
        if (!isset($data['nivel'])) {
            $this->nivel = 0;
        }
    }

    public function setChildren(array $children)
    {
        $this->children = $children;
    }

    public function getChildren()
    {
        return $this->children;
    }

    public function heredarParte(Fraction $fraction)
    {
        $this->shareFraction = $this->shareFraction->add($fraction);
    }
}
