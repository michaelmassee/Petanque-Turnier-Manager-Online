<?php

namespace Tests\Feature;

use App\Models\Registration;
use App\Models\Tournament;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_unapproved_turnierverwalter_sees_pending_page(): void
    {
        $user = User::factory()->unapproved()->create();

        $this->actingAs($user)
            ->get('/admin/tournaments')
            ->assertRedirect(route('approval.pending'));
    }

    public function test_admin_can_approve_and_revoke_turnierverwalter(): void
    {
        $admin = User::factory()->create();
        $user = User::factory()->unapproved()->create();

        $this->actingAs($admin)
            ->patch(route('admin.users.approve', $user))
            ->assertSessionHas('success');

        $this->assertTrue($user->fresh()->isApproved());

        $this->actingAs($admin)
            ->patch(route('admin.users.revoke', $user))
            ->assertSessionHas('success');

        $this->assertFalse($user->fresh()->isApproved());
    }

    public function test_turnierverwalter_can_only_see_own_tournaments(): void
    {
        $owner = User::factory()->turnierverwalter()->create();
        $other = User::factory()->turnierverwalter()->create();
        $ownTournament = $this->createTournament($owner, ['name' => 'Eigenes Turnier']);
        $foreignTournament = $this->createTournament($other, ['name' => 'Fremdes Turnier']);

        $this->actingAs($owner)
            ->get(route('admin.tournaments.index'))
            ->assertOk()
            ->assertSee($ownTournament->name)
            ->assertDontSee($foreignTournament->name);
    }

    public function test_turnierverwalter_cannot_manage_foreign_tournament(): void
    {
        $owner = User::factory()->turnierverwalter()->create();
        $other = User::factory()->turnierverwalter()->create();
        $foreignTournament = $this->createTournament($other);

        $this->actingAs($owner)
            ->get(route('admin.tournaments.edit', $foreignTournament))
            ->assertNotFound();

        $this->actingAs($owner)
            ->put(route('admin.tournaments.update', $foreignTournament), $this->validTournamentData(['name' => 'Hack']))
            ->assertNotFound();

        $this->assertNotSame('Hack', $foreignTournament->fresh()->name);
    }

    public function test_turnierverwalter_cannot_manage_foreign_registrations(): void
    {
        $owner = User::factory()->turnierverwalter()->create();
        $other = User::factory()->turnierverwalter()->create();
        $foreignTournament = $this->createTournament($other);
        $registration = Registration::create([
            'tournament_id' => $foreignTournament->id,
            'first_name' => 'Max',
            'last_name' => 'Muster',
            'email' => 'max@example.com',
            'status' => 'pending',
            'registered_at' => now(),
            'token' => Registration::generateToken(),
        ]);

        $this->actingAs($owner)
            ->get(route('admin.tournaments.registrations', $foreignTournament))
            ->assertNotFound();

        $this->actingAs($owner)
            ->patch(route('admin.registrations.status', $registration), ['status' => 'confirmed'])
            ->assertNotFound();
    }

    public function test_admin_can_manage_all_tournaments(): void
    {
        $admin = User::factory()->create();
        $owner = User::factory()->turnierverwalter()->create();
        $tournament = $this->createTournament($owner, ['name' => 'Vereinspokal']);

        $this->actingAs($admin)
            ->get(route('admin.tournaments.index'))
            ->assertOk()
            ->assertSee($tournament->name);

        $this->actingAs($admin)
            ->get(route('admin.tournaments.edit', $tournament))
            ->assertOk();
    }

    public function test_admin_can_create_user(): void
    {
        $admin = User::factory()->create();

        $this->actingAs($admin)
            ->post(route('admin.users.store'), [
                'name' => 'Neue Verwaltung',
                'email' => 'verwaltung@example.com',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
                'roles' => [User::ROLE_TURNIERVERWALTER],
                'approved' => '1',
                'email_verified' => '1',
            ])
            ->assertRedirect(route('admin.users.index'));

        $user = User::where('email', 'verwaltung@example.com')->firstOrFail();

        $this->assertTrue($user->isTurnierverwalter());
        $this->assertTrue($user->isTeilnehmer());
        $this->assertTrue($user->isApproved());
        $this->assertTrue($user->hasVerifiedEmail());
        $this->assertTrue(Hash::check('new-password', $user->password));
    }

    public function test_admin_can_update_user_roles_and_password(): void
    {
        $admin = User::factory()->create();
        $user = User::factory()->turnierverwalter()->create();

        $this->actingAs($admin)
            ->put(route('admin.users.update', $user), [
                'name' => 'Nur Teilnehmer',
                'email' => 'teilnehmer@example.com',
                'password' => 'changed-password',
                'password_confirmation' => 'changed-password',
                'roles' => [User::ROLE_TEILNEHMER],
                'email_verified' => '1',
            ])
            ->assertRedirect(route('admin.users.index'));

        $user->refresh();

        $this->assertSame('Nur Teilnehmer', $user->name);
        $this->assertSame('teilnehmer@example.com', $user->email);
        $this->assertTrue($user->isTeilnehmer());
        $this->assertFalse($user->isTurnierverwalter());
        $this->assertNull($user->approved_at);
        $this->assertTrue(Hash::check('changed-password', $user->password));
    }

    public function test_admin_cannot_remove_own_admin_role(): void
    {
        $admin = User::factory()->create();

        $this->actingAs($admin)
            ->put(route('admin.users.update', $admin), [
                'name' => $admin->name,
                'email' => $admin->email,
                'roles' => [User::ROLE_TEILNEHMER],
                'email_verified' => '1',
            ])
            ->assertSessionHasErrors('roles');

        $this->assertTrue($admin->fresh()->isAdmin());
    }

    public function test_admin_cannot_delete_self_or_user_with_tournaments(): void
    {
        $admin = User::factory()->create();
        $owner = User::factory()->turnierverwalter()->create();
        $this->createTournament($owner);

        $this->actingAs($admin)
            ->delete(route('admin.users.destroy', $admin))
            ->assertSessionHas('error');

        $this->assertModelExists($admin);

        $this->actingAs($admin)
            ->delete(route('admin.users.destroy', $owner))
            ->assertSessionHas('error');

        $this->assertModelExists($owner);
    }

    private function createTournament(User $user, array $overrides = []): Tournament
    {
        return Tournament::create(array_merge($this->validTournamentData(), $overrides, [
            'created_by' => $user->id,
        ]));
    }

    private function validTournamentData(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Testturnier',
            'date' => now()->addDay()->toDateString(),
            'location' => 'Bouleplatz',
            'type' => 'supermelee',
            'formation' => 'tete',
            'max_registrations' => 16,
            'registration_open' => true,
            'registration_deadline' => null,
            'status' => 'draft',
            'description' => null,
        ], $overrides);
    }
}
