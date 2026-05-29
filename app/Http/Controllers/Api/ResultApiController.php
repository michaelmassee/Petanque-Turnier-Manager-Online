<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Result;
use App\Models\Tournament;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ResultApiController extends Controller
{
    public function store(Request $request, string $tournamentId): JsonResponse
    {
        $tournament = $this->findTournamentByToken($request, $tournamentId);

        if ($tournament === null) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'round' => ['required', 'integer', 'min:1'],
            'data' => ['required', 'array'],
        ]);

        Result::updateOrCreate(
            ['tournament_id' => $tournament->id, 'round' => $validated['round']],
            ['data' => $validated['data']],
        );

        return response()->json(['status' => 'ok']);
    }

    public function updateStatus(Request $request, string $tournamentId): JsonResponse
    {
        $tournament = $this->findTournamentByToken($request, $tournamentId);

        if ($tournament === null) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'status' => ['required', 'string', 'in:running,finished'],
        ]);

        $tournament->update(['status' => $validated['status']]);

        return response()->json(['status' => 'ok']);
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
