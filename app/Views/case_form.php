<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Herencia Islámica – Nuevo caso</title>
    <link rel="stylesheet" href="<?php echo BASE_URL; ?>public/assets/css/styles.css">
</head>
<body>
    <h1>Crear Nuevo Caso de Herencia</h1>
    <form action="<?php echo BASE_URL; ?>public/index.php?page=store_case" method="POST">
        <label for="total_estate">Patrimonio Total:</label>
        <input type="number" name="total_estate" id="total_estate" step="0.01" required>
        <br>
        <label for="is_deceased_male">¿El fallecido es hombre?</label>
        <select name="is_deceased_male" id="is_deceased_male" required>
            <option value="1">Sí</option>
            <option value="0">No</option>
        </select>
        <br>
        <button type="submit">Guardar Caso</button>
    </form>
    
    <!-- Script para mantener la variable global y actualizarla según el select -->
    <script>
        // Declaramos la variable global; en esta página se utiliza solo para lectura.
        let deceasedIsMale = 1;
        // Al cargar la página, leemos el valor seleccionado.
        document.addEventListener("DOMContentLoaded", function() {
            deceasedIsMale = document.getElementById("is_deceased_male").value;
        });
        // Actualizamos la variable cuando el usuario cambie el select.
        document.getElementById("is_deceased_male").addEventListener("change", function() {
            deceasedIsMale = this.value;
        });
    </script>
</body>
</html>
