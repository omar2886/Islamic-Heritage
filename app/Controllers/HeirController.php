<?php
/**
 * app/Controllers/HeirController.php
 */
require_once __DIR__ . '/../Models/Database.php';

class HeirController {
    private $db;
    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }
    public function storeHeirs($case_id) {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
        if (!$case_id) throw new Exception("❌ Error: Missing case_id!");

        $this->db->beginTransaction();

        // Recoger arrays
        $nombres       = $_POST['nombre']         ?? [];
        // Para herederos directos se usa tipo_heredero[], para descendientes se usa tipo_descendiente[]
        $tiposDirectos = $_POST['tipo_heredero']    ?? [];
        $tiposDesc     = $_POST['tipo_descendiente']  ?? [];
        $vivos         = $_POST['vivo']           ?? [];
        $sexoArr       = $_POST['sexo']           ?? [];
        $parentCl      = $_POST['parent_id']      ?? [];
        $clientIds     = $_POST['client_id']      ?? [];
        $niveles       = $_POST['nivel']          ?? [];

        // Mapeo de tipos para directos
        $heirTypeMap = [
            'esposo'              => 1, 'spouse' => 1,
            'esposa'              => 2, 'spouse_female' => 2,
            'hijo'                => 3, 'son' => 3,
            'hija'                => 4, 'daughter' => 4,
            'father'              => 5, 'padre' => 5,
            'mother'              => 6, 'madre' => 6,
            'brother'             => 9,
            'sister'              => 10,
            'paternal_grandfather'=> 7,
            'maternal_grandmother'=> 8,
            'paternal_grandmother'=> 15
        ];

        $allHeirs = [];
        $countHeirs = count($nombres);
        for ($i = 0; $i < $countHeirs; $i++) {
            $nivel = isset($niveles[$i]) ? intval($niveles[$i]) : 0;
            // Si nivel 0, se usa el array de tipos directos; si nivel ≥1, forzamos "descendiente"
            $tipo = ($nivel === 0) ? strtolower(trim($tiposDirectos[$i] ?? '')) : "descendiente";
            $allHeirs[] = [
                'index'       => $i,
                'nombre'      => trim($nombres[$i] ?? ''),
                'tipo'        => $tipo,
                'vivo'        => isset($vivos[$i]) ? intval($vivos[$i]) : 1,
                'sexo'        => strtolower(trim($sexoArr[$i] ?? '')), // para nivel 0; en descendientes se usará según la lógica del árbol
                'parentClient'=> strtolower(trim($parentCl[$i] ?? '')),
                'clientId'    => strtolower(trim($clientIds[$i] ?? '')),
                'nivel'       => $nivel
            ];
        }

        usort($allHeirs, function($a, $b) {
            return $a['nivel'] - $b['nivel'];
        });

        $mapping = [];
        try {
            // PRIMERA PASADA: Insertar todos sin parent (parent_id=NULL)
            foreach ($allHeirs as $heir) {
                if (!$heir['nombre'] || !$heir['tipo']) continue;
                $tipo = $heir['tipo'];
                if ($heir['nivel'] === 0) {
                    if (!isset($heirTypeMap[$tipo])) {
                        throw new Exception("Error: Tipo de heredero no válido: " . htmlspecialchars($tipo));
                    }
                    $tipoId = $heirTypeMap[$tipo];
                } else {
                    // Para descendientes, se guarda el tipo "descendiente" (valor 0)
                    $tipoId = 0;
                }
                $stmt = $this->db->prepare("
                    INSERT INTO heirs (case_id, nombre, tipo_heredero, vivo, parent_id, sex)
                    VALUES (:case_id, :nombre, :tipo, :vivo, NULL, :sex)
                ");
                $stmt->execute([
                    ':case_id' => $case_id,
                    ':nombre'  => $heir['nombre'],
                    ':tipo'    => $tipoId,
                    ':vivo'    => $heir['vivo'],
                    ':sex'     => ($heir['sexo'] !== '') ? $heir['sexo'] : null,
                ]);
                $newId = $this->db->lastInsertId();
                $mapping[$heir['clientId']] = [
                    'dbId' => $newId,
                    'sexo' => $heir['sexo'],
                    'tipo' => $tipo,
                    'nivel'=> $heir['nivel']
                ];
            }

            // SEGUNDA PASADA: Actualizar parent_id según mapping
            foreach ($allHeirs as $heir) {
                $myClientId = $heir['clientId'];
                $parentClient = $heir['parentClient'];
                if (!empty($parentClient) && isset($mapping[$parentClient]) && isset($mapping[$myClientId])) {
                    $parentDbId = $mapping[$parentClient]['dbId'];
                    $myDbId = $mapping[$myClientId]['dbId'];
                    $stmt2 = $this->db->prepare("UPDATE heirs SET parent_id = :pid WHERE id = :id");
                    $stmt2->execute([
                        ':pid' => $parentDbId,
                        ':id'  => $myDbId
                    ]);
                }
            }

            $this->db->commit();
        } catch (Exception $e) {
            $this->db->rollBack();
            die("Error al procesar datos: " . $e->getMessage());
        }
    }
}
