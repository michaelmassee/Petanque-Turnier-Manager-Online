<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')->orderBy('id')->get(['id', 'roles'])->each(function (object $user): void {
            $roles = json_decode($user->roles ?? '[]', true) ?: [];

            DB::table('users')
                ->where('id', $user->id)
                ->update(['roles' => json_encode(User::normalizeRoles($roles), JSON_THROW_ON_ERROR)]);
        });
    }

    public function down(): void
    {
        DB::table('users')->orderBy('id')->get(['id', 'roles'])->each(function (object $user): void {
            $roles = json_decode($user->roles ?? '[]', true) ?: [];

            if (in_array(User::ROLE_ADMIN, $roles, true)) {
                $roles = [User::ROLE_ADMIN];
            }

            DB::table('users')
                ->where('id', $user->id)
                ->update(['roles' => json_encode($roles, JSON_THROW_ON_ERROR)]);
        });
    }
};
