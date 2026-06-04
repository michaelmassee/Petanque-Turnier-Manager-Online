<?php

namespace App\Http\Controllers\Public;

use App\Enums\TournamentStatus;
use App\Http\Controllers\Controller;
use App\Models\Tournament;
use Illuminate\Http\Request;
use Illuminate\View\View;

class TournamentController extends Controller
{
    public function index(Request $request): View
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
            'mine' => $request->boolean('mine') && $request->user() !== null,
        ];

        $tournaments = Tournament::query()
            ->whereIn('status', $visibleStatuses)
            ->when($filters['q'] !== '', function ($query) use ($filters) {
                $query->where(function ($query) use ($filters) {
                    $query
                        ->where('name', 'like', '%' . $filters['q'] . '%')
                        ->orWhere('location', 'like', '%' . $filters['q'] . '%');
                });
            })
            ->when($filters['status'] !== '', fn ($query) => $query->where('status', $filters['status']))
            ->when($filters['period'] === 'upcoming', fn ($query) => $query->whereDate('date', '>=', now()->toDateString()))
            ->when($filters['period'] === 'past', fn ($query) => $query->whereDate('date', '<', now()->toDateString()))
            ->when($filters['formation'] !== '', fn ($query) => $query->where('formation', $filters['formation']))
            ->when($filters['location'] !== '', fn ($query) => $query->where('location', 'like', '%' . $filters['location'] . '%'))
            ->when($filters['mine'], function ($query) use ($request) {
                $user = $request->user();

                $query->where(function ($query) use ($user) {
                    $query
                        ->where('created_by', $user->id)
                        ->orWhereHas('registrations', fn ($query) => $query->where('email', $user->email));
                });
            })
            ->orderBy('date')
            ->paginate(20)
            ->withQueryString();

        return view('public.tournaments.index', compact('tournaments', 'filters'));
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
