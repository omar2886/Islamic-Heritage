<?php
/**
 * config/config.php
 * Configuración básica de la aplicación.
 */

if (!function_exists('heritage_env')) {
    /**
     * Lee variables de entorno sin exponer secretos por defecto.
     */
    function heritage_env(string $key, $default)
    {
        $value = getenv($key);
        return ($value === false || $value === '') ? $default : $value;
    }
}

define('DB_HOST', heritage_env('HERITAGE_DB_HOST', heritage_env('DB_HOST', 'localhost')));
define('DB_NAME', heritage_env('HERITAGE_DB_NAME', heritage_env('DB_NAME', 'heritage')));
define('DB_USER', heritage_env('HERITAGE_DB_USER', heritage_env('DB_USER', 'root')));
define('DB_PASS', heritage_env('HERITAGE_DB_PASS', heritage_env('DB_PASS', '')));

// La BASE_URL debe apuntar al directorio que contiene "public"
define('BASE_URL', heritage_env('HERITAGE_BASE_URL', heritage_env('BASE_URL', '')));

// Representación disponible para la UI.
if (!defined('FEATURE_REPRESENTATION')) {
    define('FEATURE_REPRESENTATION', false);
}
?>
