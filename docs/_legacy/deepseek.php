<?php
/**
 * public/combined.php
 * Interfaz de boxes para herederos.
 *
 * Tipos de cajas:
 *  - Box del fallecido: botón “+” que despliega un menú con 5 opciones (Cónyuge, Hijo, Hija, Padre y Madre).
 *  - Herederos de primer nivel: 2 inputs (nombre y ¿vivo?) y botones “+” y “❌”.
 *  - Herederos de 2º nivel o más: 3 inputs (nombre, ¿vivo? y sexo) y botones “+” y “❌”.
 *
 * Se usa un sistema de coordenadas lógico (almacenado en dataset.originalX/Y) para que al aplicar zoom y panning
 * tanto los boxes como el canvas (líneas de conexión) se actualicen de forma consistente.
 */

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../app/Models/Database.php';
require_once __DIR__ . '/../app/Models/InheritanceCalculator.php';
require_once __DIR__ . '/../app/Domain/Math/Fraction.php';

use App\Domain\Math\Fraction;
use InvalidArgumentException;

ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/php_errors.log');
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

/** Mapa de tipos de heredero */
$heirTypeMap = [
    'esposo' => 1,
    'esposa' => 2,
    'hijo_varon' => 3,
    'hija' => 4,
    'padre' => 5,
    'madre' => 6,
    'paternal_grandfather' => 7,
    'maternal_grandmother' => 8,
    'paternal_grandmother' => 15,
    'brother' => 9,
    'sister' => 10,
    'paternal_uncle' => 11,
    'maternal_uncle' => 12,
    'cousin' => 13
];

/** Función para formatear fracciones */
function fractionLabel($x) {
    if ($x instanceof Fraction) {
        return $x->asString();
    }

    if (is_string($x)) {
        try {
            return Fraction::fromString($x)->asString();
        } catch (InvalidArgumentException $exception) {
            unset($exception);
        }
    }

    if (is_numeric($x)) {
        $rounded = round((float) $x, 4);
        try {
            return Fraction::fromString((string) $rounded)->asString();
        } catch (InvalidArgumentException $exception) {
            unset($exception);
        }
    }

    return '0/1';
}


// ---------------------
// PROCESAR POST
// ---------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $total_estate     = isset($_POST['total_estate']) ? floatval($_POST['total_estate']) : 0;
    $is_deceased_male = isset($_POST['is_deceased_male']) ? intval($_POST['is_deceased_male']) : 1;

    // Se reciben los campos clave
    $tipo_heredero       = $_POST['tipo_heredero'] ?? [];
    $tipo_descendiente   = $_POST['tipo_descendiente'] ?? [];
    $nombres             = $_POST['nombre'] ?? [];
    $vivos               = $_POST['vivo'] ?? [];
    $parent_ids          = $_POST['parent_id'] ?? [];
    $lineage_sides       = $_POST['lineage_side'] ?? [];

    $spouseCount = 0; $fatherCount = 0; $motherCount = 0;
    foreach ($tipo_heredero as $t) {
        if ($t === 'esposo' || $t === 'esposa') $spouseCount++;
        if ($t === 'padre') $fatherCount++;
        if ($t === 'madre') $motherCount++;
    }
    if ($is_deceased_male && $spouseCount > 4) {
        die("Error: Un hombre fallecido no puede tener más de 4 esposas.");
    }
    if (!$is_deceased_male && $spouseCount > 1) {
        die("Error: Una mujer fallecida no puede tener más de 1 esposo.");
    }
    if ($fatherCount > 1) die("Error: Solo se permite un padre.");
    if ($motherCount > 1) die("Error: Solo se permite una madre.");

    $db = Database::getInstance()->getConnection();
    $db->beginTransaction();
    try {
        $stmt = $db->prepare("INSERT INTO cases (total_estate, is_deceased_male)
                              VALUES (:estate, :male)");
        $stmt->execute([':estate' => $total_estate, ':male' => $is_deceased_male]);
        $caseId = $db->lastInsertId();

        // Log para depuración
        error_log("POST Data: " . print_r([
            'tipo_heredero' => $tipo_heredero,
            'tipo_descendiente' => $tipo_descendiente,
            'nombres' => $nombres,
            'parent_ids' => $parent_ids,
            'lineage_side' => $lineage_sides
        ], true));

        for ($i = 0; $i < count($tipo_heredero); $i++) {
            // Se combinan los dos arrays de tipo (nivel 0 y descendientes)
            $tipo = !empty($tipo_heredero[$i]) ? trim($tipo_heredero[$i]) : (trim($tipo_descendiente[$i]) ?: '');
            $nom  = trim($nombres[$i] ?? '');
            $v    = intval($vivos[$i] ?? 1);
            $pid  = !empty($parent_ids[$i]) ? intval(preg_replace('/[^0-9]/', '', $parent_ids[$i])) : null;

            if (!isset($heirTypeMap[$tipo]) && $tipo !== 'descendiente') {
                throw new Exception("Error: Tipo de heredero no válido: " . $tipo);
            }
            $typeId = isset($heirTypeMap[$tipo]) ? $heirTypeMap[$tipo] : 0;
            $stmt2 = $db->prepare("INSERT INTO heirs (case_id, tipo_heredero, nombre, vivo, parent_id)
                                  VALUES (:cid, :t, :n, :v, :p)");
            $stmt2->execute([
                ':cid' => $caseId,
                ':t'   => $typeId,
                ':n'   => $nom,
                ':v'   => $v,
                ':p'   => $pid
            ]);
        }
        $db->commit();
    } catch (Exception $ex) {
        $db->rollBack();
        die("Error al procesar datos: " . $ex->getMessage());
    }

    $calc = new InheritanceCalculator();
    $result = $calc->calculateDistribution($caseId);
    ?>
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Resultados de la Herencia</title>
    </head>
    <body>
    <h1>Resultados de la Distribución</h1>
    <?php if (!empty($result)): ?>
    <table class="results-table">
      <thead>
        <tr>
          <th>Heredero</th>
          <th>Tipo</th>
          <th>¿Vivo?</th>
          <th>Fracción</th>
          <th>Herencia</th>
        </tr>
      </thead>
      <tbody>
        <?php foreach ($result as $item):
          $frac = fractionLabel($item['share_fraction']);
        ?>
        <tr>
          <td><?php echo htmlspecialchars($item['nombre']); ?></td>
          <td><?php echo htmlspecialchars($item['heir_type']); ?></td>
          <td><?php echo $item['vivo'] == 1 ? 'Si' : 'No'; ?></td>
          <td><?php echo $frac; ?></td>
          <td><?php echo $item['monto']; ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
    <?php else: ?>
    <p>No hay resultados</p>
    <?php endif; ?>
    </body>
    </html>
    <?php
    exit();
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Herencia Islámica - Interfaz de Boxes</title>
  <link rel="stylesheet" type="text/css" href="<?php echo BASE_URL; ?>public/assets/css/styles.css">
</head>
<body>

<div class="navbar">
  <button onclick="document.querySelector('form').submit()">Calcular Herencia</button>
</div>

<form method="POST" action="<?php echo BASE_URL; ?>public/deepseek.php">
  <div class="main-container" id="mainContainer">
    <div id="contentWrapper">
      <canvas id="linksCanvas"></canvas>
      <!-- Box del Fallecido -->
      <div id="fallecidoBox">
        <label for="estate-amount">Monto total de la herencia</label>
        <input type="number" step="0.01" name="total_estate" id="estate-amount" inputmode="decimal" aria-required="true" required>
        <select name="is_deceased_male">
          <option value="1">Hombre</option>
          <option value="0">Mujer</option>
        </select>
        <br>
        <!-- Menú contextual: 5 opciones -->
        <button type="button" onclick="showContextMenu('deceased','deceased',0,event)">+</button>
      </div>
      <div id="heirsContainer"></div>
    </div>
	  <button type="button" onclick="resetZoom()">Reset Zoom</button>
    <div class="zoom-controls">
      <button type="button" onclick="zoomIn()">+</button>
      <button type="button" onclick="zoomOut()">-</button>
    </div>
  </div>
</form>

<script src="<?php echo BASE_URL; ?>public/assets/js/app.js"></script>
</body>
</html>
