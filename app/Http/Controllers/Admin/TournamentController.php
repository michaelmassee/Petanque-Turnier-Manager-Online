<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Formation;
use App\Enums\TournamentStatus;
use App\Enums\TournamentType;
use App\Http\Controllers\Controller;
use App\Models\Tournament;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class TournamentController extends Controller
{
    public function index(): View
    {
        $tournaments = Tournament::where('created_by', Auth::id())
            ->orderByDesc('date')
            ->paginate(20);

        return view('admin.tournaments.index', compact('tournaments'));
    }

    public function create(): View
    {
        return view('admin.tournaments.create', [
            'types' => TournamentType::cases(),
            'formations' => Formation::cases(),
            'statuses' => TournamentStatus::cases(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateTournament($request);
        $validated['created_by'] = Auth::id();

        Tournament::create($validated);

        return redirect()->route('admin.tournaments.index')
            ->with('success', __('admin.save') . ' ✓');
    }

    public function edit(Tournament $tournament): View
    {
        return view('admin.tournaments.edit', [
            'tournament' => $tournament,
            'types' => TournamentType::cases(),
            'formations' => Formation::cases(),
            'statuses' => TournamentStatus::cases(),
        ]);
    }

    public function update(Request $request, Tournament $tournament): RedirectResponse
    {
        $tournament->update($this->validateTournament($request));

        return redirect()->route('admin.tournaments.index')
            ->with('success', __('admin.save') . ' ✓');
    }

    public function destroy(Tournament $tournament): RedirectResponse
    {
        $tournament->delete();

        return redirect()->route('admin.tournaments.index');
    }

    public function generateToken(Tournament $tournament): RedirectResponse
    {
        $token = $tournament->generateApiToken();

        return redirect()->route('admin.tournaments.edit', $tournament)
            ->with('api_token', $token);
    }

    private function validateTournament(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:200'],
            'date' => ['required', 'date'],
            'location' => ['required', 'string', 'max:200'],
            'type' => ['required', 'string', 'in:' . implode(',', array_column(TournamentType::cases(), 'value'))],
            'formation' => ['required', 'string', 'in:' . implode(',', array_column(Formation::cases(), 'value'))],
            'max_registrations' => ['required', 'integer', 'min:0'],
            'registration_open' => ['boolean'],
            'registration_deadline' => ['nullable', 'date'],
            'status' => ['required', 'string', 'in:' . implode(',', array_column(TournamentStatus::cases(), 'value'))],
            'description' => ['nullable', 'string'],
        ]);
    }
}
