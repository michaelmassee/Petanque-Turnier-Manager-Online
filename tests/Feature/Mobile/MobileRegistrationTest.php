<?php

namespace Tests\Feature\Mobile;

use App\Mail\RegistrationConfirmed;
use App\Models\Registration;
use App\Models\Tournament;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class MobileRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_logged_in_registration_links_user_id_and_redirects_to_my_tournaments(): void
    {
        Mail::fake();
        $user = User::factory()->create([
            'email' => 'spieler@example.com',
        ]);
        $tournament = $this->createTournament();

        $response = $this->actingAs($user)->post("/de/app/tournaments/{$tournament->id}/register", [
            'first_name' => 'Max',
            'last_name' => 'Muster',
            'email' => 'spieler@example.com',
        ]);

        $response->assertRedirect('/de/app/my-tournaments');
        $this->assertDatabaseHas('registrations', [
            'tournament_id' => $tournament->id,
            'email' => 'spieler@example.com',
            'user_id' => $user->id,
            'status' => 'confirmed',
        ]);
        Mail::assertSent(RegistrationConfirmed::class);
    }

    public function test_guest_registration_leaves_user_id_null(): void
    {
        Mail::fake();
        $tournament = $this->createTournament();

        $this->post("/de/tournaments/{$tournament->id}/register", [
            'first_name' => 'Erika',
            'last_name' => 'Beispiel',
            'email' => 'erika@example.com',
        ]);

        $registration = Registration::where('email', 'erika@example.com')->firstOrFail();
        $this->assertNull($registration->user_id);
    }

    private function createTournament(array $overrides = []): Tournament
    {
        return Tournament::create(array_merge([
            'name' => 'Testturnier',
            'date' => now()->addDay()->toDateString(),
            'location' => 'Bouleplatz',
            'type' => 'supermelee',
            'formation' => 'tete',
            'max_registrations' => 16,
            'registration_open' => true,
            'registration_deadline' => null,
            'status' => 'registration',
            'description' => null,
            'config' => [
                'manual_confirmation' => false,
                'required_fields' => [],
                'allow_waitlist' => false,
            ],
            'created_by' => User::factory()->create()->id,
        ], $overrides));
    }
}
