<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

class UserApprovalController extends Controller
{
    public function index(Request $request): View
    {
        $this->ensureAdmin();

        $users = User::query()
            ->when($request->string('search')->trim()->isNotEmpty(), function ($query) use ($request): void {
                $search = $request->string('search')->trim()->toString();
                $query->where(function ($query) use ($search): void {
                    $query->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%")
                        ->orWhere('club', 'like', "%{$search}%")
                        ->orWhere('license_nr', 'like', "%{$search}%");
                });
            })
            ->when($request->filled('role'), fn ($query) => $query->whereJsonContains('roles', $request->string('role')->toString()))
            ->when($request->string('approval')->toString() === 'pending', function ($query): void {
                $query->whereJsonContains('roles', User::ROLE_TURNIERVERWALTER)
                    ->whereNull('approved_at');
            })
            ->when($request->string('approval')->toString() === 'approved', function ($query): void {
                $query->where(function ($query): void {
                    $query->whereJsonContains('roles', User::ROLE_ADMIN)
                        ->orWhere(function ($query): void {
                            $query->whereJsonContains('roles', User::ROLE_TURNIERVERWALTER)
                                ->whereNotNull('approved_at');
                        });
                });
            })
            ->withCount('tournaments')
            ->orderByRaw('approved_at is null desc')
            ->orderBy('name')
            ->paginate(30)
            ->withQueryString();

        return view('admin.users.index', [
            'users' => $users,
            'roles' => User::availableRoles(),
            'filters' => $request->only(['search', 'role', 'approval']),
        ]);
    }

    public function create(): View
    {
        $this->ensureAdmin();

        return view('admin.users.create', [
            'roles' => User::availableRoles(),
            'user' => new User(['roles' => [User::ROLE_TEILNEHMER]]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->ensureAdmin();

        $data = $this->validatedData($request);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'club' => $data['club'] ?? null,
            'license_nr' => $data['license_nr'] ?? null,
            'password' => $data['password'],
            'roles' => $this->normalizedRoles($data['roles']),
            'approved_at' => $this->approvedAt($data),
        ]);

        $user->forceFill([
            'email_verified_at' => $request->boolean('email_verified') ? now() : null,
        ])->save();

        return redirect()->route('admin.users.index')->with('success', __('admin.user_created'));
    }

    public function edit(User $user): View
    {
        $this->ensureAdmin();

        return view('admin.users.edit', [
            'roles' => User::availableRoles(),
            'user' => $user,
        ]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $this->ensureAdmin();

        $data = $this->validatedData($request, $user);
        $roles = $this->normalizedRoles($data['roles']);

        if ($user->is(Auth::user()) && ! in_array(User::ROLE_ADMIN, $roles, true)) {
            return back()->withInput()->withErrors(['roles' => __('admin.cannot_remove_own_admin_role')]);
        }

        if ($user->isAdmin() && ! in_array(User::ROLE_ADMIN, $roles, true) && $this->adminCount() <= 1) {
            return back()->withInput()->withErrors(['roles' => __('admin.cannot_remove_last_admin')]);
        }

        $user->forceFill([
            'name' => $data['name'],
            'email' => $data['email'],
            'club' => $data['club'] ?? null,
            'license_nr' => $data['license_nr'] ?? null,
            'roles' => $roles,
            'approved_at' => $this->approvedAt($data),
            'email_verified_at' => $request->boolean('email_verified') ? ($user->email_verified_at ?? now()) : null,
        ]);

        if (! empty($data['password'])) {
            $user->password = $data['password'];
        }

        $user->save();

        return redirect()->route('admin.users.index')->with('success', __('admin.user_updated'));
    }

    public function destroy(User $user): RedirectResponse
    {
        $this->ensureAdmin();

        if ($user->is(Auth::user())) {
            return back()->with('error', __('admin.cannot_delete_self'));
        }

        if ($user->isAdmin() && $this->adminCount() <= 1) {
            return back()->with('error', __('admin.cannot_delete_last_admin'));
        }

        if ($user->tournaments()->exists()) {
            return back()->with('error', __('admin.cannot_delete_user_with_tournaments'));
        }

        $user->delete();

        return redirect()->route('admin.users.index')->with('success', __('admin.user_deleted'));
    }

    public function approve(User $user): RedirectResponse
    {
        $this->ensureAdmin();
        $this->ensureTurnierverwalter($user);

        $user->grantRole(User::ROLE_TEILNEHMER);
        $user->grantRole(User::ROLE_TURNIERVERWALTER);
        $user->forceFill(['approved_at' => now()])->save();

        return back()->with('success', __('admin.user_approved'));
    }

    public function revoke(User $user): RedirectResponse
    {
        $this->ensureAdmin();
        $this->ensureTurnierverwalter($user);

        $user->forceFill(['approved_at' => null])->save();

        return back()->with('success', __('admin.user_revoked'));
    }

    private function ensureAdmin(): void
    {
        abort_unless(Auth::user()?->isAdmin(), 403);
    }

    private function ensureTurnierverwalter(User $user): void
    {
        abort_unless($user->isTurnierverwalter(), 404);
    }

    /**
     * @return array{name: string, email: string, club?: ?string, license_nr?: ?string, password?: string, roles: array<int, string>, approved: bool}
     */
    private function validatedData(Request $request, ?User $user = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'string',
                'lowercase',
                'email',
                'max:255',
                Rule::unique(User::class)->ignore($user?->id),
            ],
            'club' => ['nullable', 'string', 'max:150'],
            'license_nr' => [
                'nullable',
                'string',
                'max:50',
                Rule::unique(User::class)->ignore($user?->id),
            ],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8', 'confirmed'],
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['string', Rule::in(array_keys(User::availableRoles()))],
            'approved' => ['boolean'],
            'email_verified' => ['boolean'],
        ]);
    }

    /**
     * @param  array<int, string>  $roles
     * @return array<int, string>
     */
    private function normalizedRoles(array $roles): array
    {
        $roles = array_values(array_unique($roles));

        if (in_array(User::ROLE_TURNIERVERWALTER, $roles, true) && ! in_array(User::ROLE_TEILNEHMER, $roles, true)) {
            $roles[] = User::ROLE_TEILNEHMER;
        }

        return array_values(array_intersect(array_keys(User::availableRoles()), $roles));
    }

    /**
     * @param  array{roles: array<int, string>, approved: bool}  $data
     */
    private function approvedAt(array $data): mixed
    {
        $roles = $this->normalizedRoles($data['roles']);

        if (in_array(User::ROLE_ADMIN, $roles, true)) {
            return now();
        }

        if (in_array(User::ROLE_TURNIERVERWALTER, $roles, true) && ($data['approved'] ?? false)) {
            return now();
        }

        return null;
    }

    private function adminCount(): int
    {
        return User::whereJsonContains('roles', User::ROLE_ADMIN)->count();
    }
}
