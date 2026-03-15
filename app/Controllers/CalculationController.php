<?php
/**
 * app/Controllers/CalculationController.php
 * Controlador para ejecutar el cálculo de distribución de la herencia.
 */
require_once __DIR__ . '/../Models/InheritanceCalculator.php';

class CalculationController {
    public function calculate() {
        if (!isset($_GET['case_id'])) {
            echo "No se proporcionó 'case_id' en la URL.";
            return;
        }
        $caseId = intval($_GET['case_id']);
        $calculator = new InheritanceCalculator();
        $result = $calculator->calculateDistribution($caseId);
        if ($result === null) {
            echo "Caso no encontrado.";
            return;
        }
        require_once __DIR__ . '/../Views/results.php';
    }
}
?>
