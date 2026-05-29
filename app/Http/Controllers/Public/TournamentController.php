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

    public function show(Tournament $tournament): View
    {
        return view('public.tournaments.show', compact('tournament'));
    }

    public function ranking(Tournament $tournament): View
    {
        $latestResult = $tournament->latestResult;
        return view('public.tournaments.ranking', compact('tournament', 'latestResult'));
    }
}
