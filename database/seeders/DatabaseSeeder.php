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

        User::updateOrCreate(
            ['email' => env('LOCAL_ADMIN_EMAIL', 'admin@ptm.de')],
            [
                'name' => env('LOCAL_ADMIN_NAME', 'Admin'),
                'password' => Hash::make(env('LOCAL_ADMIN_PASSWORD', 'password')),
                'roles' => [User::ROLE_ADMIN],
                'approved_at' => now(),
                'email_verified_at' => now(),
            ],
        );
    }
}
