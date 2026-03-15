<?php declare(strict_types=1);

/**
 * STRANGLER ROUTER (Heritage)
 * Este index.php decide de dónde servir la experiencia de usuario.
 */

// 1. Beta Opt-in
$wantsBeta = isset($_GET['beta']) && $_GET['beta'] === '1';
if (isset($_GET['beta']) && $_GET['beta'] === '0') {
    $wantsBeta = false;
    setcookie('heritage_beta', '0', time() - 3600, '/');
} elseif ($wantsBeta) {
    setcookie('heritage_beta', '1', time() + (86400 * 30), '/');
}

$isBeta = $wantsBeta || (isset($_COOKIE['heritage_beta']) && $_COOKIE['heritage_beta'] === '1');

// 2. Si el usuario está en el anillo Beta, servir la Single Page Application compilada de React
// (asumiendo que vite build tira el output a public/ui-next/)
if ($isBeta) {
    $uiNextIndex = __DIR__ . '/ui-next/index.html';
    if (file_exists($uiNextIndex)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($uiNextIndex);
        exit;
    } else {
        // Si no hay build válido, salimos del anillo beta para evitar dejar al usuario atrapado.
        setcookie('heritage_beta', '', time() - 3600, '/');
        http_response_code(503);
        echo "<h1>Beta UI-Next no está compilado. Corre npm run build en /frontend/.</h1>";
        echo "<a href='?beta=0'>Volver a la versión normal</a>";
        exit;
    }
}

// 3. Si no hay beta, redirigir al entrypoint real funcional de la versión vieja/estable (SPA vanilla JS)
header('Location: ui/', true, 302);
exit;
