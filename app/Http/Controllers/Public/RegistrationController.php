<?php

namespace App\Http\Controllers\Public;

use App\Enums\RegistrationStatus;
use App\Http\Controllers\Controller;
use App\Mail\RegistrationReceived;
use App\Models\Registration;
use App\Models\Tournament;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\View\View;

class RegistrationController extends Controller
{
    public function create(Tournament $tournament): View|RedirectResponse
    {
        if (! $tournament->isRegistrationOpen()) {
            return redirect()->route('public.tournaments.show', $tournament)
                ->with('error', __('tournaments.registration_closed'));
        }

        return view('public.registrations.create', compact('tournament'));
    }

    public function store(Request $request, Tournament $tournament): RedirectResponse
    {
        if (! $tournament->isRegistrationOpen()) {
            return back()->with('error', __('tournaments.registration_closed'));
        }

        $spielerAnzahl = $tournament->formation->spielerAnzahl();
        $validated = $this->validateRequest($request, $spielerAnzahl);

        $duplikat = Registration::where('tournament_id', $tournament->id)
            ->where('email', $validated['email'])
            ->whereNotIn('status', [RegistrationStatus::Cancelled->value])
            ->exists();

        if ($duplikat) {
            return back()->withErrors(['email' => __('registrations.errors.duplicate_email')])->withInput();
        }

        $vollAusgebucht = $tournament->max_registrations > 0
            && $tournament->registrations()->whereIn('status', ['confirmed', 'pending'])->count() >= $tournament->max_registrations;

        $registration = Registration::create([
            ...$validated,
            'tournament_id' => $tournament->id,
            'status' => $vollAusgebucht ? RegistrationStatus::Waitlist : RegistrationStatus::Pending,
            'registered_at' => now(),
            'token' => Registration::generateToken(),
        ]);

        Mail::to($registration->email)->send(new RegistrationReceived($registration));

        $meldung = $vollAusgebucht
            ? __('registrations.waitlist_notice')
            : __('registrations.success.pending');

        return redirect()->route('public.tournaments.show', $tournament)->with('success', $meldung);
    }

    public function confirm(string $token): RedirectResponse
    {
        $registration = Registration::where('token', $token)->firstOrFail();

        if ($registration->status === RegistrationStatus::Confirmed) {
            return redirect()->route('public.tournaments.show', $registration->tournament)
                ->with('info', __('registrations.errors.already_confirmed'));
        }

        if ($registration->status === RegistrationStatus::Cancelled) {
            return redirect()->route('public.tournaments.index')
                ->with('error', __('registrations.errors.already_cancelled'));
        }

        $registration->update([
            'status' => RegistrationStatus::Confirmed,
            'confirmed_at' => now(),
        ]);

        return redirect()->route('public.tournaments.show', $registration->tournament)
            ->with('success', __('registrations.success.confirmed'));
    }

    public function cancelForm(string $token): View
    {
        $registration = Registration::where('token', $token)->firstOrFail();
        return view('public.registrations.cancel', compact('registration'));
    }

    public function cancel(string $token): RedirectResponse
    {
        $registration = Registration::where('token', $token)->firstOrFail();

        if ($registration->status === RegistrationStatus::Cancelled) {
            return redirect()->route('public.tournaments.index')
                ->with('info', __('registrations.errors.already_cancelled'));
        }

        $registration->update(['status' => RegistrationStatus::Cancelled]);

        $this->nachruckerBestaetigen($registration->tournament_id);

        return redirect()->route('public.tournaments.index')
            ->with('success', __('registrations.success.cancelled'));
    }

    private function nachruckerBestaetigen(string $tournamentId): void
    {
        $naechster = Registration::where('tournament_id', $tournamentId)
            ->where('status', RegistrationStatus::Waitlist)
            ->orderBy('registered_at')
            ->first();

        if ($naechster === null) {
            return;
        }

        $naechster->update([
            'status' => RegistrationStatus::Confirmed,
            'confirmed_at' => now(),
        ]);

        Mail::to($naechster->email)->send(new \App\Mail\WaitlistPromoted($naechster));
    }

    private function validateRequest(Request $request, int $spielerAnzahl): array
    {
        $rules = [
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255'],
            'club' => ['nullable', 'string', 'max:150'],
            'license_nr' => ['nullable', 'string', 'max:50'],
            'team_name' => ['nullable', 'string', 'max:100'],
        ];

        if ($spielerAnzahl >= 2) {
            $rules['partner_first_name'] = ['required', 'string', 'max:100'];
            $rules['partner_last_name'] = ['required', 'string', 'max:100'];
            $rules['partner_email'] = ['nullable', 'email', 'max:255'];
        }

        if ($spielerAnzahl >= 3) {
            $rules['partner2_first_name'] = ['required', 'string', 'max:100'];
            $rules['partner2_last_name'] = ['required', 'string', 'max:100'];
            $rules['partner2_email'] = ['nullable', 'email', 'max:255'];
        }

        return $request->validate($rules);
    }
}
