<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tournaments', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->date('date');
            $table->string('location');
            $table->enum('type', [
                'formule_x', 'jeder_gegen_jeden', 'ko', 'kaskaden', 'liga',
                'maastrichter', 'poule_ab', 'schweizer', 'supermelee', 'trip_tete',
                'daenisch', 'monrad', 'arena',
                'crazy_melee', 'koelner_sextet', 'tete_series',
            ]);
            $table->enum('formation', ['tete', 'doublette', 'triplette']);
            $table->unsignedInteger('max_registrations')->default(0);
            $table->boolean('registration_open')->default(false);
            $table->dateTime('registration_deadline')->nullable();
            $table->enum('status', ['draft', 'registration', 'running', 'finished'])->default('draft');
            $table->string('api_token', 64)->unique()->nullable();
            $table->json('config')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tournaments');
    }
};
