<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Herencia Islámica – Resultados</title>
    <link rel="stylesheet" href="<?php echo BASE_URL; ?>public/assets/css/styles.css">
</head>
<body>
    <h1>Resultados de la Distribución de la Herencia</h1>
    <?php if (!empty($result)): ?>
        <table border="1" cellpadding="5" cellspacing="0">
            <thead>
                <tr>
                    <th>Nombre del Heredero</th>
                    <th>Tipo de Heredero</th>
                    <th>¿Está Vivo?</th>
                    <th>Fracción</th>
                    <th>Monto</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($result as $item): ?>
                    <tr>
                        <td><?php echo htmlspecialchars($item['nombre']); ?></td>
                        <td><?php echo htmlspecialchars($item['tipo_heredero']); ?></td>
                        <td><?php echo htmlspecialchars($item['vivo']); ?></td>
                        <td><?php echo htmlspecialchars($item['share_fraction']); ?></td>
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