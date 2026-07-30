<?php

namespace Tests\Feature\Mobile;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MobileAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get('/de/app')->assertRedirect('/login');
    }

    public function test_unapproved_teilnehmer_can_access_search(): void
    {
        $user = User::factory()->unapproved()->create();

        $this->actingAs($user)
            ->get('/de/app')
            ->assertOk();
    }

    public function test_unapproved_teilnehmer_can_access_my_tournaments(): void
    {
        $user = User::factory()->unapproved()->create();

        $this->actingAs($user)
            ->get('/de/app/my-tournaments')
            ->assertOk();
    }

    public function test_tournament_day_placeholder_is_reachable(): void
    {
        $user = User::factory()->unapproved()->create();

        $this->actingAs($user)
            ->get('/de/app/tournament-day')
            ->assertOk()
            ->assertSee(__('mobile.tournament_day.coming_soon'));
    }
}
