<?php
/**
 * app/Models/ResidualPool.php
 *
 * Clase auxiliar para acumular las fracciones residuales de nodos muertos
 * que no tienen descendientes vivos, para luego integrarlas en el cálculo de Asabah.
 */

require_once __DIR__ . '/../Domain/Math/Fraction.php';

use App\Domain\Math\Fraction;

class ResidualPool {
    private static ?Fraction $fraction = null;

    public static function add(Fraction $fraction): void {
        $current = self::get();
        self::$fraction = $current->add($fraction);
        error_log('ResidualPool actualizado: ' . self::$fraction->asString());
    }

    public static function get(): Fraction {
        if (self::$fraction === null) {
            self::$fraction = Fraction::zero();
        }

        return self::$fraction;
    }

    public static function reset(): void {
        self::$fraction = Fraction::zero();
    }
}
