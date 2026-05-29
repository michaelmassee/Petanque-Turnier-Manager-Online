<?php

namespace App\Http\Controllers\Api;

use App\Enums\RegistrationStatus;
use App\Http\Controllers\Controller;
use App\Models\Tournament;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RegistrationApiController extends Controller
{
    public function index(Request $request, string $tournamentId): JsonResponse
    {
        $tournament = $this->findTournamentByToken($request, $tournamentId);

        if ($tournament === null) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $registrations = $tournament->registrations()
            ->where('status', RegistrationStatus::Confirmed)
            ->orderBy('seeding_position')
            ->orderBy('registered_at')
            ->get()
            ->map(fn($r) => [
                'id' => $r->id,
                'ptm_player_nr' => $r->ptm_player_nr,
                'first_name' => $r->first_name,
                'last_name' => $r->last_name,
                'email' => $r->email,
                'club' => $r->club,
                'license_nr' => $r->license_nr,
                'partner_first_name' => $r->partner_first_name,
                'partner_last_name' => $r->partner_last_name,
                'partner2_first_name' => $r->partner2_first_name,
                'partner2_last_name' => $r->partner2_last_name,
                'team_name' => $r->team_name,
                'seeding_position' => $r->seeding_position,
                'registered_at' => $r->registered_at?->toIso8601String(),
            ]);

        return response()->json([
            'tournament' => [
                'id' => $tournament->id,
                'name' => $tournament->name,
                'type' => $tournament->type->value,
                'formation' => $tournament->formation->value,
            ],
            'registrations' => $registrations,
        ]);
    }

    private function findTournamentByToken(Request $request, string $tournamentId): ?Tournament
    {
        $token = $request->bearerToken();
        if ($token === null) {
            return null;
        }

        return Tournament::where('id', $tournamentId)
            ->where('api_token', $token)
            ->first();
    }
}
