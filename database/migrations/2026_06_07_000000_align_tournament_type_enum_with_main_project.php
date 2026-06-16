<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const TYPES = [
        'formule_x',
        'jeder_gegen_jeden',
        'ko',
        'kaskaden',
        'liga',
        'maastrichter',
        'poule_ab',
        'schweizer',
        'supermelee',
        'trip_tete',
        'daenisch',
        'monrad',
        'arena',
        'crazy_melee',
        'koelner_sextet',
        'tete_series',
    ];

    public function up(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        $values = implode(',', array_map(fn (string $type) => "'" . $type . "'", self::TYPES));

        DB::statement("ALTER TABLE tournaments MODIFY type ENUM({$values}) NOT NULL");
    }

    public function down(): void
    {
        // Intentionally left unchanged: existing rows may already use the added types.
    }
};
