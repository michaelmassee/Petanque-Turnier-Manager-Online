<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Volt\Volt;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_screen_can_be_rendered(): void
    {
        $response = $this->get('/register');

        $response
            ->assertOk()
            ->assertSeeVolt('pages.auth.register');
    }

    public function test_new_users_can_register(): void
    {
        $component = Volt::test('pages.auth.register')
            ->set('first_name', 'Test')
            ->set('last_name', 'User')
            ->set('email', 'test@example.com')
            ->set('club', 'BC Linden')
            ->set('license_nr', '12345678')
            ->set('password', 'password')
            ->set('password_confirmation', 'password');

        $component->call('register');

        $component->assertRedirect(route('home', absolute: false));

        $this->assertAuthenticated();
        $user = User::where('email', 'test@example.com')->firstOrFail();
        $this->assertTrue($user->isTeilnehmer());
        $this->assertSame('BC Linden', $user->club);
        $this->assertSame('12345678', $user->license_nr);
        $this->assertFalse($user->isTurnierverwalter());
        $this->assertFalse($user->isApproved());
    }

    public function test_new_tournament_managers_register_pending_approval(): void
    {
        $component = Volt::test('pages.auth.register')
            ->set('first_name', 'Test')
            ->set('last_name', 'Manager')
            ->set('email', 'manager@example.com')
            ->set('password', 'password')
            ->set('password_confirmation', 'password')
            ->set('as_tournament_manager', true);

        $component->call('register');

        $component->assertRedirect(route('dashboard', absolute: false));

        $this->assertAuthenticated();
        $user = User::where('email', 'manager@example.com')->firstOrFail();
        $this->assertTrue($user->isTeilnehmer());
        $this->assertTrue($user->isTurnierverwalter());
        $this->assertFalse($user->isApproved());
    }
}
