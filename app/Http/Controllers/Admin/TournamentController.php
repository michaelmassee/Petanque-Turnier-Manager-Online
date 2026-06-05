<?php

namespace App\Http\Controllers\Admin;

use App\Enums\Formation;
use App\Enums\TournamentStatus;
use App\Enums\TournamentType;
use App\Http\Controllers\Controller;
use App\Models\Tournament;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class TournamentController extends Controller
{
    private const REGISTRATION_OPTION_FIELDS = ['club', 'license_nr', 'team_name', 'partner_email', 'partner2_email'];

    public function index(): View
    {
        $tournaments = $this->manageableTournaments()
            ->with('creator')
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
            'owners' => $this->ownerOptions(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateTournament($request);
        $validated['created_by'] = Auth::user()?->isAdmin()
            ? (int) $validated['created_by']
            : Auth::id();

        Tournament::create($validated);

        return redirect()->route('admin.tournaments.index')
            ->with('success', __('admin.save') . ' ✓');
    }

    public function edit(string $tournament): View
    {
        $t = $this->findManageableTournament($tournament);

        return view('admin.tournaments.edit', [
            'tournament' => $t,
            'types' => TournamentType::cases(),
            'formations' => Formation::cases(),
            'statuses' => TournamentStatus::cases(),
            'owners' => $this->ownerOptions($t->created_by),
        ]);
    }

    public function update(Request $request, string $tournament): RedirectResponse
    {
        $t = $this->findManageableTournament($tournament);
        $validated = $this->validateTournament($request, $t);

        if (Auth::user()?->isAdmin()) {
            $validated['created_by'] = (int) $validated['created_by'];
        }

        $t->update($validated);

        return redirect()->route('admin.tournaments.index')
            ->with('success', __('admin.save') . ' ✓');
    }

    public function destroy(string $tournament): RedirectResponse
    {
        $this->findManageableTournament($tournament)->delete();

        return redirect()->route('admin.tournaments.index');
    }

    public function generateToken(string $tournament): RedirectResponse
    {
        $t = $this->findManageableTournament($tournament);
        $token = $t->generateApiToken();

        return redirect()->route('admin.tournaments.edit', $t->id)
            ->with('api_token', $token);
    }

    private function validateTournament(Request $request, ?Tournament $tournament = null): array
    {
        $validated = $request->validate([
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
            'required_fields' => ['array'],
            'required_fields.*' => ['string', 'in:' . implode(',', self::REGISTRATION_OPTION_FIELDS)],
            'manual_confirmation' => ['boolean'],
        ]);

        if (Auth::user()?->isAdmin()) {
            $validated += $request->validate([
                'created_by' => ['required', 'integer', 'in:' . $this->ownerOptions($tournament?->created_by)->pluck('id')->implode(',')],
            ]);
        }

        $validated['config'] = [
            'required_fields' => array_values($validated['required_fields'] ?? []),
            'manual_confirmation' => (bool) ($validated['manual_confirmation'] ?? false),
        ];

        unset($validated['required_fields'], $validated['manual_confirmation']);

        return $validated;
    }

    private function manageableTournaments()
    {
        $query = Tournament::query();

        if (! Auth::user()?->isAdmin()) {
            $query->where('created_by', Auth::id());
        }

        return $query;
    }

    private function findManageableTournament(string $id): Tournament
    {
        return $this->manageableTournaments()->findOrFail($id);
    }

    private function ownerOptions(?int $includeUserId = null)
    {
        return User::query()
            ->where(function ($query): void {
                $query->whereJsonContains('roles', User::ROLE_ADMIN)
                    ->orWhere(function ($query): void {
                        $query->whereJsonContains('roles', User::ROLE_TURNIERVERWALTER)
                            ->whereNotNull('approved_at');
                    });
            })
            ->when($includeUserId, function ($query) use ($includeUserId): void {
                $query->orWhere('id', $includeUserId);
            })
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'roles', 'approved_at']);
    }
}
