<?php
/**
 * public/combined.php
 * Interfaz combinada para ingresar datos del caso y herederos, y para mostrar la distribución final.
 */

// Requerimos configuración, base de datos y nuestro orquestador final
require_once __DIR__ . '/../config/config.php';              // Ajusta si tu archivo config está en otra ruta
require_once __DIR__ . '/../app/Models/Database.php';
require_once __DIR__ . '/../app/Models/InheritanceCalculator.php';
require_once __DIR__ . '/../app/Domain/Math/Fraction.php';

use App\Domain\Math\Fraction;
use InvalidArgumentException;

// Configuración de errores (asegúrate de que la carpeta "logs" exista y tenga permisos)
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/php_errors.log');
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

/**
 * Mapa de tipos de heredero (texto -> ID en BD).
 * Ajusta según tus necesidades e idiomas.
 */
$heirTypeMap = [
    'esposo'              => 1,  'spouse'              => 1,
    'esposa'              => 2,  'spouse_female'       => 2,
    'hijo_varon'          => 3,  'son'                 => 3,
    'hija'                => 4,  'daughter'            => 4,
    'padre'               => 5,  'father'              => 5,
    'madre'               => 6,  'mother'              => 6,
    'paternal_grandfather'=> 7,
    'maternal_grandmother'=> 8,
    'paternal_grandmother'=> 15,
    'brother'             => 9,
    'sister'              => 10,
    'paternal_uncle'      => 11,
    'maternal_uncle'      => 12,
    'cousin'              => 13
];

/**
 * Función de PRESENTACIÓN para mostrar una fracción bonita:
 * - Si es float, la redondeamos y comprobamos si coincide con fracciones comunes.
 * - Si no coincide, usamos decimalToFraction como fallback.
 */
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

// --------------------------------------------------------------------------------
// Manejo de la REQUEST
// --------------------------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // 1. Recolectar datos del caso
    $total_estate = isset($_POST['total_estate']) ? floatval($_POST['total_estate']) : 0;
    $is_deceased_male = isset($_POST['is_deceased_male']) ? intval($_POST['is_deceased_male']) : 1;

    // 2. Recolectar arrays de herederos
    $tipo_heredero = $_POST['tipo_heredero'] ?? [];
    $nombres       = $_POST['nombre']       ?? [];
    $vivo          = $_POST['vivo']         ?? [];
    $lineage_sides = $_POST['lineage_side'] ?? [];
    $parent_ids    = $_POST['parent_id']    ?? [];

    // Validaciones simples (opcional)
    $spouseCount = 0; $fatherCount = 0; $motherCount = 0;
    foreach ($tipo_heredero as $t) {
        if ($t === 'spouse' || $t === 'esposo' || $t === 'esposa' || $t === 'spouse_female') {
            $spouseCount++;
        }
        if ($t === 'father') { $fatherCount++; }
        if ($t === 'mother') { $motherCount++; }
    }
    // Ejemplos de validaciones:
    if ($is_deceased_male && $spouseCount > 4) {
        die("Error: Un hombre fallecido no puede tener más de 4 esposas.");
    }
    if (!$is_deceased_male && $spouseCount > 1) {
        die("Error: Una mujer fallecida no puede tener más de 1 esposo.");
    }
    if ($fatherCount > 1) {
        die("Error: Solo se permite un padre.");
    }
    if ($motherCount > 1) {
        die("Error: Solo se permite una madre.");
    }

    // 3. Inserción en la BD (caso + herederos), usando una transacción
    $db = Database::getInstance()->getConnection();
    $db->beginTransaction();
    try {
        // 3.a) Insertar el caso
        $stmt = $db->prepare("INSERT INTO cases (total_estate, is_deceased_male) 
                              VALUES (:total_estate, :is_deceased_male)");
        $stmt->execute([
            ':total_estate'      => $total_estate,
            ':is_deceased_male'  => $is_deceased_male
        ]);
        $caseId = $db->lastInsertId();

        // 3.b) Insertar cada heredero en la tabla heirs
        for ($i = 0; $i < count($tipo_heredero); $i++) {
            $type           = $tipo_heredero[$i];
            $nombre         = trim($nombres[$i] ?? '');
            $is_vivo        = isset($vivo[$i]) ? intval($vivo[$i]) : 1;
            $lineage_side   = $lineage_sides[$i] ?? 'paternal';
            $parentId       = !empty($parent_ids[$i]) ? intval($parent_ids[$i]) : null;

            if (!isset($heirTypeMap[$type])) {
                throw new Exception("Error: Tipo de heredero no válido: " . htmlspecialchars($type));
            }
            $tipo_heredero_id = $heirTypeMap[$type];

            $stmt = $db->prepare("
                INSERT INTO heirs (case_id, tipo_heredero, nombre, vivo, lineage_side, parent_id)
                VALUES (:case_id, :tipo_heredero, :nombre, :vivo, :lineage_side, :parent_id)
            ");
            $stmt->execute([
                ':case_id'       => $caseId,
                ':tipo_heredero' => $tipo_heredero_id,
                ':nombre'        => $nombre,
                ':vivo'          => $is_vivo,
                ':lineage_side'  => $lineage_side,
                ':parent_id'     => $parentId
            ]);
        }
        // Confirmar transacción
        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        die("Error al procesar datos: " . $e->getMessage());
    }

    // 4. Calcular distribución usando InheritanceCalculator
    $calculator = new InheritanceCalculator();
    $result = $calculator->calculateDistribution($caseId);

    // 5. Renderizar resultados (HTML)
    ?>
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Resultados del Cálculo de Herencia</title>
        <link rel="stylesheet" href="<?php echo BASE_URL; ?>public/assets/css/styles.css">
        <script src="https://d3js.org/d3.v7.min.js"></script>
    </head>
    <body>
        <h1>Resultados de la Distribución de la Herencia</h1>
        <?php if (!empty($result)): ?>
            <table border="1" cellpadding="5" cellspacing="0">
                <thead>
                    <tr>
                        <th>Heredero</th>
                        <th>Parentesco</th>
                        <th>¿Está Vivo?</th>
                        <th>Fracción</th>
                        <th>Herencia</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($result as $item):
                        // Llamamos a fractionLabel para formatear la fracción
                        $fracText = fractionLabel($item['share_fraction']);
                        // Decidimos si es fard mostrando algo adicional (ej. *fard)
                        // Ajustar si tu app lo requiere
                        $fixedTypes = ["esposo", "esposa", "padre", "madre"];
                        $fardText = (in_array($item['heir_type'], $fixedTypes)) ? " fard" : "";
                    ?>
                    <tr>
                        <td><?php echo htmlspecialchars($item['nombre']); ?></td>
                        <td><?php echo htmlspecialchars($item['heir_type']); ?></td>
                        <td><?php echo ($item['vivo'] == 1) ? 'Vivo' : 'Fallecido'; ?></td>
                        <td><?php echo $fracText . $fardText; ?></td>
                        <td><?php echo htmlspecialchars($item['monto']); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php else: ?>
            <p>No hay resultados para mostrar.</p>
        <?php endif; ?>
    </body>
    </html>
    <?php
    exit(); // Importante para no ejecutar el HTML de abajo
}
?>

<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cálculo Herencia Islámica</title>
  <link rel="stylesheet" href="<?php echo BASE_URL; ?>public/assets/css/styles.css">
  <style>
      .heir-row {
          margin-bottom: 10px;
      }
      .heir-row.level-1 { margin-left: 20px; }
      .heir-row.level-2 { margin-left: 40px; }
      .heir-row.level-3 { margin-left: 60px; }
  </style>
</head>
<body>
  <h1>Cálculo Herencia Islámica (Maliki)</h1>
  <form method="POST" action="<?php echo BASE_URL; ?>public/combined.php">
      <h2>Datos del Fallecido</h2>
      <label for="total_estate">Patrimonio Total:</label>
      <input type="number" name="total_estate" id="total_estate" step="0.01" required>
      <br>
      <label for="is_deceased_male">El fallecido es:</label>
      <select name="is_deceased_male" id="is_deceased_male" required>
          <option value="1">Hombre</option>
          <option value="0">Mujer</option>
      </select>
      <br>
      <h2>Datos de Herederos</h2>
      <div id="heirs_container"></div>
      <button type="button" onclick="addHeirRow()">Añadir heredero de primer nivel</button>
      <br><br>
      <button type="submit">Calcular Distribución</button>
  </form>

<script>
let heirCounter = 0;
let deceasedIsMale = 1;

document.addEventListener("DOMContentLoaded", function() {
    deceasedIsMale = document.getElementById("is_deceased_male").value;
    document.getElementById("heirs_container").innerHTML = "";
    addHeirRow(); // Agrega la primera fila (nivel 0)
});

document.getElementById("is_deceased_male").addEventListener("change", function() {
    deceasedIsMale = this.value;
    document.getElementById("heirs_container").innerHTML = "";
    heirCounter = 0;
    addHeirRow();
});

function insertRowAfterParent(newRow, parentRow) {
    const container = document.getElementById("heirs_container");
    const parentLevel = parseInt(parentRow.dataset.level || "0", 10);
    let sibling = parentRow.nextElementSibling;
    while (sibling) {
        const siblingLevel = parseInt(sibling.dataset.level || "0", 10);
        if (siblingLevel <= parentLevel) {
            container.insertBefore(newRow, sibling);
            return;
        }
        sibling = sibling.nextElementSibling;
    }
    container.appendChild(newRow);
}

function addHeirRow(parentId = '', level = 0, insertAfter = null) {
    const container = document.getElementById("heirs_container");
    const div = document.createElement("div");
    div.className = "heir-row";
    div.dataset.level = level;

    const ownId = "node_" + (++heirCounter);
    div.setAttribute("data-own-id", ownId);
    div.setAttribute("data-parent-id", parentId);

    let innerHTML = "";
    if (level === 0) {
        // Nivel 0: herederos directos; no se requiere selector de sexo, y se agregan opciones para abuelos.
        innerHTML = `
<input type="hidden" name="parent_id[]" value="${parentId}">
<input type="hidden" name="client_id[]" value="${ownId}">
<input type="hidden" name="nivel[]" value="0">
<input type="hidden" name="sexo[]" value=""> 
<div style="display:flex; align-items:center;">
    <div style="flex:1;">
        <label>Nombre:
            <input type="text" name="nombre[]" required>
        </label>
        <label>Tipo de Heredero:
            <select name="tipo_heredero[]" required>
                <option value="">Seleccionar...</option>
                ${ deceasedIsMale == 1 ?
                  `<option value="esposa">Esposa</option>
                   <option value="hijo_varon">Hijo</option>
                   <option value="hija">Hija</option>
                   <option value="father">Padre</option>
                   <option value="mother">Madre</option>
                   <option value="brother">Hermano</option>
                   <option value="sister">Hermana</option>
                   <option value="paternal_grandfather">Abuelo Paterno</option>
                   <option value="paternal_grandmother">Abuela Paterna</option>
                   <option value="maternal_grandmother">Abuela Materna</option>` :
                  `<option value="esposo">Esposo</option>
                   <option value="hijo_varon">Hijo</option>
                   <option value="hija">Hija</option>
                   <option value="father">Padre</option>
                   <option value="mother">Madre</option>
                   <option value="brother">Hermano</option>
                   <option value="sister">Hermana</option>
                   <option value="paternal_grandfather">Abuelo Paterno</option>
                   <option value="paternal_grandmother">Abuela Paterna</option>
                   <option value="maternal_grandmother">Abuela Materna</option>` }
            </select>
        </label>
        <label>¿Está Vivo?
            <select name="vivo[]">
                <option value="1">Sí</option>
                <option value="0">No</option>
            </select>
        </label>
    </div>
    <div style="margin-left:10px;">
        <button type="button" onclick="addDescendant(this)">+</button>
        <button type="button" onclick="removeHeirRow(this)">❌</button>
    </div>
</div>
        `;
    } else {
        // Nivel ≥1: descendientes. Se envía un campo fijo para indicar descendiente.
        innerHTML = `
<input type="hidden" name="parent_id[]" value="${parentId}">
<input type="hidden" name="client_id[]" value="${ownId}">
<input type="hidden" name="nivel[]" value="${level}">
<input type="hidden" name="tipo_descendiente[]" value="descendiente">
<div style="display:flex; align-items:center;">
    <div style="flex:1;">
        <label>Nombre:
            <input type="text" name="nombre[]" required>
        </label>
        <!-- Para descendientes no se muestra tipo; se determinará según el campo fijo -->
        <label>Sexo:
            <select name="sexo[]" required>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
            </select>
        </label>
        <label>¿Está Vivo?
            <select name="vivo[]">
                <option value="1">Sí</option>
                <option value="0">No</option>
            </select>
        </label>
    </div>
    <div style="margin-left:10px;">
        <button type="button" onclick="addDescendant(this)">+</button>
        <button type="button" onclick="removeHeirRow(this)">❌</button>
    </div>
</div>
        `;
    }

    div.innerHTML = innerHTML;
    div.style.marginLeft = (level * 20) + "px";
    if (insertAfter) {
        insertRowAfterParent(div, insertAfter);
    } else {
        container.appendChild(div);
    }
}

function addDescendant(button) {
    const parentRow = button.closest('.heir-row');
    if (!parentRow) return;
    const parentOwnId = parentRow.getAttribute("data-own-id");
    const currentLevel = parseInt(parentRow.dataset.level || "0", 10);
    addHeirRow(parentOwnId, currentLevel + 1, parentRow);
}

function removeDescendants(parentOwnId) {
    const container = document.getElementById("heirs_container");
    const descendants = container.querySelectorAll(`.heir-row[data-parent-id="${parentOwnId}"]`);
    descendants.forEach(child => {
        removeDescendants(child.getAttribute("data-own-id"));
        child.remove();
    });
}

function removeHeirRow(button) {
    const row = button.closest('.heir-row');
    if (!row) return;
    const ownId = row.getAttribute("data-own-id");
    removeDescendants(ownId);
    row.remove();
}
</script>
</body>
</html>
