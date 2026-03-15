<?php
/**
 * Views/heirs_form.php
 * Formulario para añadir herederos de manera dinámica.
 */

// Validar que case_id esté presente en la URL
if (!isset($_GET['case_id']) || !is_numeric($_GET['case_id'])) {
    die("Error: case_id inválido o no proporcionado.");
}

$case_id = intval($_GET['case_id']);
?>

<form method="POST" action="combined.php">
    <h3>Añadir Herederos</h3>
    <div id="heirs-container">
        <!-- Aquí se añadirán los herederos dinámicamente -->
    </div>

    <button type="button" onclick="addHeir()">Añadir Heredero</button>
    <br><br>
    
    <!-- Se pasa el case_id de forma segura -->
    <input type="hidden" id="case_id" name="case_id" value="<?php echo $case_id; ?>">
    <input type="submit" value="Guardar Herederos">
</form>

<script>
function addHeir(parentId = null) {
    let container = document.getElementById("heirs-container");
    let heirCount = document.querySelectorAll(".heir-entry").length + 1;
    let newHeir = document.createElement("div");
    newHeir.classList.add("heir-entry");
    newHeir.innerHTML = `
        <input type="text" name="nombre[]" required placeholder="Nombre del heredero">
        <select name="tipo_heredero[]" required>
            <option value="">Seleccionar...</option>
            <option value="spouse">Esposa</option>
            <option value="son">Hijo</option>
            <option value="daughter">Hija</option>
            <option value="father">Padre</option>
            <option value="mother">Madre</option>
        </select>
        <select name="vivo[]">
            <option value="1">Sí</option>
            <option value="0">No</option>
        </select>
        <input type="hidden" name="parent_id[]" value="${parentId !== null ? parentId : ''}">
        <button type="button" onclick="addHeir(${heirCount})">+</button>
        <button type="button" onclick="this.parentNode.remove()">Eliminar</button>
    `;
    container.appendChild(newHeir);
}

// Asegurar que al menos un heredero está presente al cargar
document.addEventListener("DOMContentLoaded", function() {
    addHeir();
});
</script>
