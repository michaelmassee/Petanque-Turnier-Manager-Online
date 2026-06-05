<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('club', 150)->nullable()->after('email');
            $table->string('license_nr', 50)->nullable()->unique()->after('club');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['license_nr']);
            $table->dropColumn(['club', 'license_nr']);
        });
    }
};
