<?php
header("Cache-Control: no-cache, no-store, must-revalidate"); // Evitar cache en desarrollo
header("Pragma: no-cache");
header("Expires: 0");

require_once __DIR__ . '/../app/Models/Database.php';
require_once __DIR__ . '/../config/config.php';

$page = isset($_GET['page']) ? $_GET['page'] : 'home';

switch ($page) {
    case 'home':
         require_once __DIR__ . '/../app/Views/home.php';
         break;
    case 'case':
         require_once __DIR__ . '/../app/Controllers/CaseController.php';
         $controller = new CaseController();
         $controller->createCase();
         break;
    case 'store_case':
         require_once __DIR__ . '/../app/Controllers/CaseController.php';
         $controller = new CaseController();
         $controller->storeCase();
         break;
    case 'heirs':
         require_once __DIR__ . '/../app/Controllers/HeirController.php';
         $controller = new HeirController();
         $controller->createHeirs();
         break;
    case 'store_heirs':
         require_once __DIR__ . '/../app/Controllers/HeirController.php';
         $controller = new HeirController();
         $controller->storeHeirs();
         break;
    case 'calculate':
         require_once __DIR__ . '/../app/Controllers/CalculationController.php';
         $controller = new CalculationController();
         $controller->calculate();
         break;
    default:
         echo "Página no encontrada";
         break;
}
?>
