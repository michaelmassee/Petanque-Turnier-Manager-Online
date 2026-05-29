<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('results', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('tournament_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('round');
            $table->json('data');
            $table->timestamps();

            $table->unique(['tournament_id', 'round']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('results');
    }
};
