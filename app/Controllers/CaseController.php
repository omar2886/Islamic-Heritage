<?php
/**
 * app/Controllers/CaseController.php
 * Controlador para la gestión de casos.
 */
require_once __DIR__ . '/../Models/Database.php';

class CaseController {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Muestra el formulario para crear un nuevo caso.
     */
    public function createCase() {
        require_once __DIR__ . '/../Views/case_form.php';
    }

    /**
     * Procesa el formulario y guarda un nuevo caso.
     */
    public function storeCase() {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $total_estate = filter_var($_POST['total_estate'], FILTER_VALIDATE_FLOAT);
        $is_deceased_male = filter_var($_POST['is_deceased_male'], FILTER_VALIDATE_INT, [
            "options" => ["min_range" => 0, "max_range" => 1]
        ]);

        if ($total_estate === false || $total_estate <= 0) {
            echo "Error: El monto de la herencia no es válido.";
            return;
        }

        try {
            $stmt = $this->db->prepare("INSERT INTO cases (total_estate, is_deceased_male) VALUES (:total_estate, :is_deceased_male)");
            $stmt->bindParam(':total_estate', $total_estate);
            $stmt->bindParam(':is_deceased_male', $is_deceased_male, PDO::PARAM_INT);

            if ($stmt->execute()) {
                echo "Caso creado correctamente. ID: " . $this->db->lastInsertId();
            } else {
                echo "Error al guardar el caso.";
            }
        } catch (Exception $e) {
            echo "Error en la base de datos: " . $e->getMessage();
        }
    } else {
        echo "Método no permitido.";
    }
}
}
?>
