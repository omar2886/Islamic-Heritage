<?php
/**
 * config/config.php
 * Configuración básica de la aplicación.
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'islamic_inheritance'); // Actualiza con el nombre de tu BD
define('DB_USER', 'heritage_db');          // Actualiza con tu usuario
define('DB_PASS', '0_8myp3M3');       // Actualiza con tu contraseña

// La BASE_URL debe apuntar al directorio que contiene "public"
define('BASE_URL', 'https://tafsir.es/Heritage/');

// Representación disponible para la UI.
if (!defined('FEATURE_REPRESENTATION')) {
    define('FEATURE_REPRESENTATION', false);
}
?>
