<?php
/**
 * app/Helpers/Logger.php
 *
 * Clase Logger para acumular mensajes de depuración durante el cálculo.
 */
class Logger {
    private static array $messages = [];

    /**
     * Agrega un mensaje al log.
     */
    public static function log(string $message): void {
        // Se agrega marca de tiempo
        self::$messages[] = date('[Y-m-d H:i:s] ') . $message;
    }

    /**
     * Devuelve todos los mensajes acumulados.
     */
    public static function getLogs(): array {
        return self::$messages;
    }

    /**
     * Reinicia el log.
     */
    public static function reset(): void {
        self::$messages = [];
    }
}
