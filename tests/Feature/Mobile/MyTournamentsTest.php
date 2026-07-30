<?php

namespace Tests\Feature\Mobile;

use App\Models\Registration;
use App\Models\Tournament;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MyTournamentsTest extends TestCase
{
    use RefreshDatabase;

    public function test_shows_only_own_registrations(): void
    {
        $me = User::factory()->create();
        $otherUser = User::factory()->create();
        $tournamentMine = $this->createTournament(['name' => 'Mein Turnier']);
        $tournamentOther = $this->createTournament(['name' => 'Fremdes Turnier']);

        Registration::create($this->registrationData($tournamentMine, $me, 'Mein Turnier'));
        Registration::create($this->registrationData($tournamentOther, $otherUser, 'Fremdes Turnier'));

        $response = $this->actingAs($me)->get('/de/app/my-tournaments');

        $response->assertOk()
            ->assertSee('Mein Turnier')
            ->assertDontSee('Fremdes Turnier');
    }

    public function test_turnierverwalter_sees_own_created_tournaments(): void
    {
        $verwalter = User::factory()->turnierverwalter()->create();
        $this->createTournament(['name' => 'Verwaltetes Turnier', 'created_by' => $verwalter->id]);

        $response = $this->actingAs($verwalter)->get('/de/app/my-tournaments');

        $response->assertOk()->assertSee('Verwaltetes Turnier');
    }

    private function registrationData(Tournament $tournament, User $user, string $suffix): array
    {
        return [
            'tournament_id' => $tournament->id,
            'user_id' => $user->id,
            'first_name' => 'Max',
            'last_name' => 'Muster',
            'email' => "max-{$suffix}@example.com",
            'status' => 'confirmed',
            'registered_at' => now(),
            'confirmed_at' => now(),
            'token' => Registration::generateToken(),
        ];
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
