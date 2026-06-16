<?php

namespace Tests\Feature;

use App\Mail\RegistrationConfirmed;
use App\Mail\RegistrationReceived;
use App\Models\Registration;
use App\Models\Tournament;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PublicRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_stays_pending_when_manual_confirmation_is_enabled(): void
    {
        Mail::fake();
        $tournament = $this->createTournament([
            'formation' => 'doublette',
            'config' => [
                'manual_confirmation' => true,
                'required_fields' => ['club', 'partner_email'],
            ],
        ]);

        $response = $this->post("/de/tournaments/{$tournament->id}/register", [
            'first_name' => 'Max',
            'last_name' => 'Muster',
            'email' => 'max@example.com',
            'club' => 'BC Linden',
            'partner_first_name' => 'Eva',
            'partner_last_name' => 'Beispiel',
            'partner_email' => 'eva@example.com',
            'team_name' => 'Die Kugeln',
        ]);

        $response->assertRedirect('/de');
        $this->assertDatabaseHas('registrations', [
            'tournament_id' => $tournament->id,
            'email' => 'max@example.com',
            'status' => 'pending',
        ]);

        $registration = Registration::where('email', 'max@example.com')->firstOrFail();
        $this->assertNull($registration->confirmed_at);
        Mail::assertSent(RegistrationReceived::class);
        Mail::assertNotSent(RegistrationConfirmed::class);
    }

    public function test_registration_is_confirmed_directly_when_manual_confirmation_is_disabled(): void
    {
        Mail::fake();
        $tournament = $this->createTournament([
            'config' => [
                'manual_confirmation' => false,
                'required_fields' => [],
            ],
        ]);

        $response = $this->post("/de/tournaments/{$tournament->id}/register", [
            'first_name' => 'Max',
            'last_name' => 'Muster',
            'email' => 'max@example.com',
        ]);

        $response->assertRedirect('/de');
        $this->assertDatabaseHas('registrations', [
            'tournament_id' => $tournament->id,
            'email' => 'max@example.com',
            'status' => 'confirmed',
        ]);

        $registration = Registration::where('email', 'max@example.com')->firstOrFail();
        $this->assertNotNull($registration->confirmed_at);
        Mail::assertSent(RegistrationConfirmed::class);
        Mail::assertNotSent(RegistrationReceived::class);
    }

    public function test_registration_validates_tournament_specific_required_fields(): void
    {
        $tournament = $this->createTournament([
            'config' => [
                'manual_confirmation' => true,
                'required_fields' => ['club'],
            ],
        ]);

        $response = $this->from("/de/tournaments/{$tournament->id}/register")
            ->post("/de/tournaments/{$tournament->id}/register", [
                'first_name' => 'Max',
                'last_name' => 'Muster',
                'email' => 'max@example.com',
            ]);

        $response
            ->assertRedirect("/de/tournaments/{$tournament->id}/register")
            ->assertSessionHasErrors('club');
    }

    public function test_registration_form_prefills_authenticated_user_club_and_license(): void
    {
        $user = User::factory()->create([
            'email' => 'spieler@example.com',
            'club' => 'BC Linden',
            'license_nr' => '12345678',
        ]);
        $tournament = $this->createTournament();

        $this->actingAs($user)
            ->get("/de/tournaments/{$tournament->id}/register")
            ->assertOk()
            ->assertSee('value="spieler@example.com"', false)
            ->assertSee('value="BC Linden"', false)
            ->assertSee('value="12345678"', false);
    }

    public function test_full_tournament_accepts_waitlist_registration_when_enabled(): void
    {
        Mail::fake();
        $tournament = $this->createTournament([
            'max_registrations' => 1,
            'config' => [
                'manual_confirmation' => false,
                'required_fields' => [],
                'allow_waitlist' => true,
            ],
        ]);
        Registration::create([
            'tournament_id' => $tournament->id,
            'first_name' => 'Erika',
            'last_name' => 'Beispiel',
            'email' => 'erika@example.com',
            'status' => 'confirmed',
            'registered_at' => now(),
            'confirmed_at' => now(),
            'token' => Registration::generateToken(),
        ]);

        $response = $this->post("/de/tournaments/{$tournament->id}/register", [
            'first_name' => 'Max',
            'last_name' => 'Muster',
            'email' => 'max@example.com',
        ]);

        $response->assertRedirect('/de');
        $this->assertDatabaseHas('registrations', [
            'tournament_id' => $tournament->id,
            'email' => 'max@example.com',
            'status' => 'waitlist',
        ]);
        Mail::assertSent(RegistrationReceived::class);
    }

    public function test_full_tournament_rejects_registration_when_waitlist_is_disabled(): void
    {
        Mail::fake();
        $tournament = $this->createTournament([
            'max_registrations' => 1,
            'config' => [
                'manual_confirmation' => false,
                'required_fields' => [],
                'allow_waitlist' => false,
            ],
        ]);
        Registration::create([
            'tournament_id' => $tournament->id,
            'first_name' => 'Erika',
            'last_name' => 'Beispiel',
            'email' => 'erika@example.com',
            'status' => 'confirmed',
            'registered_at' => now(),
            'confirmed_at' => now(),
            'token' => Registration::generateToken(),
        ]);

        $response = $this->from("/de/tournaments/{$tournament->id}/register")
            ->post("/de/tournaments/{$tournament->id}/register", [
                'first_name' => 'Max',
                'last_name' => 'Muster',
                'email' => 'max@example.com',
            ]);

        $response
            ->assertRedirect("/de/tournaments/{$tournament->id}/register")
            ->assertSessionHas('error', __('tournaments.registration_closed'));
        $this->assertDatabaseMissing('registrations', [
            'tournament_id' => $tournament->id,
            'email' => 'max@example.com',
        ]);
        Mail::assertNothingSent();
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
