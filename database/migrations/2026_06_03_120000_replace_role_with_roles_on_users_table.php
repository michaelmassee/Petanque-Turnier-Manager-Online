<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('roles')->nullable()->after('approved_at');
        });

        DB::table('users')->orderBy('id')->get()->each(function (object $user): void {
            $roles = match ($user->role) {
                User::ROLE_ADMIN => User::normalizeRoles([User::ROLE_ADMIN]),
                User::ROLE_TURNIERVERWALTER => User::normalizeRoles([User::ROLE_TURNIERVERWALTER]),
                default => [User::ROLE_TEILNEHMER],
            };

            DB::table('users')
                ->where('id', $user->id)
                ->update(['roles' => json_encode($roles, JSON_THROW_ON_ERROR)]);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->default(User::ROLE_TURNIERVERWALTER)->after('password');
        });

        DB::table('users')->orderBy('id')->get()->each(function (object $user): void {
            $roles = json_decode($user->roles ?? '[]', true) ?: [];
            $role = in_array(User::ROLE_ADMIN, $roles, true)
                ? User::ROLE_ADMIN
                : User::ROLE_TURNIERVERWALTER;

            DB::table('users')
                ->where('id', $user->id)
                ->update(['role' => $role]);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('roles');
        });
    }
};
