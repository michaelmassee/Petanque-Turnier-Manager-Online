<?php

namespace App\Http\Controllers\Public;

use App\Enums\TournamentStatus;
use App\Http\Controllers\Controller;
use App\Models\Tournament;
use Illuminate\View\View;

class TournamentController extends Controller
{
    public function index(): View
    {
        $tournaments = Tournament::whereIn('status', [
            TournamentStatus::Registration->value,
            TournamentStatus::Running->value,
            TournamentStatus::Finished->value,
        ])
            ->orderBy('date')
            ->paginate(20);

        return view('public.tournaments.index', compact('tournaments'));
    }

    public function show(string $tournament): View
    {
        $t = Tournament::findOrFail($tournament);
        return view('public.tournaments.show', ['tournament' => $t]);
    }

    public function ranking(string $tournament): View
    {
        $t = Tournament::findOrFail($tournament);
        $latestResult = $t->latestResult;
        return view('public.tournaments.ranking', ['tournament' => $t, 'latestResult' => $latestResult]);
    }
}
