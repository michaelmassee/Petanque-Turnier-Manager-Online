<?php

namespace Tests\Feature;

use App\Models\Registration;
use App\Models\Tournament;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicTournamentFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_start_page_contains_logo_and_small_login_link(): void
    {
        $this->get('/de')
            ->assertOk()
            ->assertSee(route('login', absolute: false))
            ->assertSee('Pétanque Turnier Manager')
            ->assertDontSee(route('register', absolute: false))
            ->assertDontSee(route('admin.dashboard', absolute: false));
    }

    public function test_default_list_shows_public_upcoming_tournaments_only(): void
    {
        $visible = $this->createTournament(['name' => 'Sommer Cup', 'date' => now()->addDay()->toDateString()]);
        $past = $this->createTournament(['name' => 'Alter Cup', 'date' => now()->subDay()->toDateString()]);
        $draft = $this->createTournament(['name' => 'Interner Entwurf', 'status' => 'draft', 'date' => now()->addDay()->toDateString()]);

        $this->get('/de')
            ->assertOk()
            ->assertSee($visible->name)
            ->assertDontSee($past->name)
            ->assertDontSee($draft->name);
    }

    public function test_search_filter_matches_name_or_location(): void
    {
        $nameMatch = $this->createTournament(['name' => 'Linden Masters', 'location' => 'Bochum']);
        $locationMatch = $this->createTournament(['name' => 'Stadtpokal', 'location' => 'BC Linden']);
        $other = $this->createTournament(['name' => 'Sommer Cup', 'location' => 'Essen']);

        $this->get('/de?q=linden')
            ->assertOk()
            ->assertSee($nameMatch->name)
            ->assertSee($locationMatch->name)
            ->assertDontSee($other->name);
    }

    public function test_status_period_formation_and_location_filters_can_be_combined(): void
    {
        $match = $this->createTournament([
            'name' => 'Doublette Bochum',
            'status' => 'registration',
            'date' => now()->addWeek()->toDateString(),
            'formation' => 'doublette',
            'location' => 'Bochum Linden',
        ]);
        $wrongStatus = $this->createTournament(['name' => 'Laufendes Doublette', 'status' => 'running', 'formation' => 'doublette', 'location' => 'Bochum Linden']);
        $wrongFormation = $this->createTournament(['name' => 'Triplette Bochum', 'status' => 'registration', 'formation' => 'triplette', 'location' => 'Bochum Linden']);
        $wrongLocation = $this->createTournament(['name' => 'Doublette Essen', 'status' => 'registration', 'formation' => 'doublette', 'location' => 'Essen']);

        $this->get('/de?status=registration&period=upcoming&formation=doublette&location=bochum')
            ->assertOk()
            ->assertSee($match->name)
            ->assertDontSee($wrongStatus->name)
            ->assertDontSee($wrongFormation->name)
            ->assertDontSee($wrongLocation->name);
    }

    public function test_past_filter_shows_past_public_tournaments(): void
    {
        $past = $this->createTournament(['name' => 'Archiv Cup', 'date' => now()->subDay()->toDateString()]);
        $upcoming = $this->createTournament(['name' => 'Zukunft Cup', 'date' => now()->addDay()->toDateString()]);

        $this->get('/de?period=past')
            ->assertOk()
            ->assertSee($past->name)
            ->assertDontSee($upcoming->name);
    }

    public function test_pagination_keeps_filter_query(): void
    {
        foreach (range(1, 21) as $index) {
            $this->createTournament([
                'name' => "Linden Cup {$index}",
                'location' => 'Linden',
                'date' => now()->addDays($index)->toDateString(),
            ]);
        }

        $this->get('/de?q=linden&formation=tete')
            ->assertOk()
            ->assertSee('q=linden')
            ->assertSee('formation=tete');
    }

    public function test_authenticated_users_can_filter_their_own_tournaments(): void
    {
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'roles' => [User::ROLE_TEILNEHMER],
            'approved_at' => null,
        ]);
        $created = $this->createTournament(['name' => 'Selbst erstellt', 'created_by' => $user->id]);
        $registered = $this->createTournament(['name' => 'Selbst angemeldet']);
        $other = $this->createTournament(['name' => 'Fremdes Turnier']);

        Registration::create([
            'tournament_id' => $registered->id,
            'first_name' => 'Max',
            'last_name' => 'Muster',
            'email' => 'user@example.com',
            'status' => 'confirmed',
            'registered_at' => now(),
            'confirmed_at' => now(),
            'token' => Registration::generateToken(),
        ]);

        $this->actingAs($user)
            ->get('/de?mine=1')
            ->assertOk()
            ->assertSee($created->name)
            ->assertSee($registered->name)
            ->assertDontSee($other->name);
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
            ],
            'created_by' => User::factory()->create()->id,
        ], $overrides));
    }
}
