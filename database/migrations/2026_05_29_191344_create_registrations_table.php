<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('registrations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('tournament_id')->constrained()->cascadeOnDelete();

            // Spieler 1
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email');
            $table->string('club')->nullable();
            $table->string('license_nr')->nullable();

            // Spieler 2 (Doublette/Triplette)
            $table->string('partner_first_name')->nullable();
            $table->string('partner_last_name')->nullable();
            $table->string('partner_email')->nullable();

            // Spieler 3 (Triplette)
            $table->string('partner2_first_name')->nullable();
            $table->string('partner2_last_name')->nullable();
            $table->string('partner2_email')->nullable();

            $table->string('team_name')->nullable();
            $table->unsignedSmallInteger('seeding_position')->nullable();
            $table->enum('status', ['pending', 'confirmed', 'cancelled', 'waitlist'])->default('pending');
            $table->dateTime('registered_at');
            $table->dateTime('confirmed_at')->nullable();
            $table->string('token', 64)->unique();
            $table->unsignedInteger('ptm_player_nr')->nullable();

            $table->timestamps();

            $table->index(['tournament_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('registrations');
    }
};
