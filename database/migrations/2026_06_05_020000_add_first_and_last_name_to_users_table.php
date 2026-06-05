<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('name');
            $table->string('last_name')->nullable()->after('first_name');
        });

        DB::table('users')->orderBy('id')->get(['id', 'name'])->each(function (object $user): void {
            [$firstName, $lastName] = $this->splitName($user->name);

            DB::table('users')
                ->where('id', $user->id)
                ->update([
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                ]);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('name');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('name')->nullable()->after('id');
        });

        DB::table('users')->orderBy('id')->get(['id', 'first_name', 'last_name'])->each(function (object $user): void {
            DB::table('users')
                ->where('id', $user->id)
                ->update([
                    'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: null,
                ]);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['first_name', 'last_name']);
        });
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function splitName(string $name): array
    {
        $parts = preg_split('/\s+/', trim($name), 2) ?: [];

        return [
            $parts[0] ?? $name,
            $parts[1] ?? '',
        ];
    }
};
