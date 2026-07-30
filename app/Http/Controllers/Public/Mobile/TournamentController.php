<?php

namespace App\Http\Controllers\Public\Mobile;

use App\Enums\TournamentStatus;
use App\Http\Controllers\Controller;
use App\Models\Tournament;
use Illuminate\Http\Request;
use Illuminate\View\View;

class TournamentController extends Controller
{
    public function search(Request $request): View
    {
        $visibleStatuses = [
            TournamentStatus::Registration->value,
            TournamentStatus::Running->value,
            TournamentStatus::Finished->value,
        ];

        $filters = [
            'q' => trim((string) $request->query('q', '')),
            'status' => in_array($request->query('status'), $visibleStatuses, true)
                ? $request->query('status')
                : '',
            'period' => in_array($request->query('period'), ['upcoming', 'past', 'all'], true)
                ? $request->query('period')
                : 'upcoming',
            'formation' => in_array($request->query('formation'), ['tete', 'doublette', 'triplette'], true)
                ? $request->query('formation')
                : '',
            'location' => trim((string) $request->query('location', '')),
            'mine' => $request->boolean('mine'),
        ];

        $tournaments = Tournament::visibleQuery($filters, $request->user())
            ->paginate(15)
            ->withQueryString();

        return view('public.mobile.tournaments.search', compact('tournaments', 'filters'));
    }

    public function show(string $tournament): View
    {
        $t = Tournament::findOrFail($tournament);

        return view('public.mobile.tournaments.show', ['tournament' => $t]);
    }

    public function mine(Request $request): View
    {
        $user = $request->user();

        $registrations = $user->registrations()->with('tournament')->latest('registered_at')->get();

        $ownedTournaments = $user->isTurnierverwalter()
            ? $user->tournaments()->orderBy('date')->get()
            : collect();

        return view('public.mobile.tournaments.my', compact('registrations', 'ownedTournaments'));
    }
}
