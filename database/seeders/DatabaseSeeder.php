<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            return;
        }

        [$firstName, $lastName] = $this->adminName();

        User::updateOrCreate(
            ['email' => env('LOCAL_ADMIN_EMAIL', 'admin@ptm.de')],
            [
                'first_name' => $firstName,
                'last_name' => $lastName,
                'password' => Hash::make(env('LOCAL_ADMIN_PASSWORD', 'password')),
                'roles' => User::normalizeRoles([User::ROLE_ADMIN]),
                'approved_at' => now(),
                'email_verified_at' => now(),
            ],
        );
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function adminName(): array
    {
        if (env('LOCAL_ADMIN_FIRST_NAME') || env('LOCAL_ADMIN_LAST_NAME')) {
            return [
                env('LOCAL_ADMIN_FIRST_NAME', 'Admin'),
                env('LOCAL_ADMIN_LAST_NAME', ''),
            ];
        }

        $parts = preg_split('/\s+/', trim(env('LOCAL_ADMIN_NAME', 'Admin')), 2) ?: [];

        return [
            $parts[0] ?? 'Admin',
            $parts[1] ?? '',
        ];
    }
}
