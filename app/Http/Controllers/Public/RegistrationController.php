<?php

namespace App\Http\Controllers\Public;

use App\Enums\RegistrationStatus;
use App\Http\Controllers\Controller;
use App\Mail\RegistrationConfirmed;
use App\Mail\RegistrationReceived;
use App\Mail\WaitlistPromoted;
use App\Models\Registration;
use App\Models\Tournament;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\View\View;

class RegistrationController extends Controller
{
    public function create(string $tournament): View|RedirectResponse
    {
        $t = Tournament::findOrFail($tournament);

        if (! $t->isRegistrationOpen()) {
            return redirect(lroute('tournaments.index'))
                ->with('error', __('tournaments.registration_closed'));
        }

        return view('public.registrations.create', ['tournament' => $t]);
    }

    public function store(Request $request, string $tournament): RedirectResponse
    {
        $t = Tournament::findOrFail($tournament);

        if (! $t->isRegistrationOpen()) {
            return back()->with('error', __('tournaments.registration_closed'));
        }

        $spielerAnzahl = $t->formation->spielerAnzahl();
        $validated = $this->validateRequest($request, $t, $spielerAnzahl);

        $duplikat = Registration::where('tournament_id', $t->id)
            ->where('email', $validated['email'])
            ->whereNotIn('status', [RegistrationStatus::Cancelled->value])
            ->exists();

        if ($duplikat) {
            return back()->withErrors(['email' => __('registrations.errors.duplicate_email')])->withInput();
        }

        $vollAusgebucht = $t->max_registrations > 0
            && $t->registrations()->whereIn('status', [RegistrationStatus::Confirmed->value, RegistrationStatus::Pending->value])->count() >= $t->max_registrations;

        if ($vollAusgebucht && ! $t->allowsWaitlist()) {
            return back()->with('error', __('tournaments.registration_full'));
        }

        $requiresManualConfirmation = $t->requiresManualConfirmation();
        $status = $vollAusgebucht
            ? RegistrationStatus::Waitlist
            : ($requiresManualConfirmation ? RegistrationStatus::Pending : RegistrationStatus::Confirmed);

        $registration = Registration::create([
            ...$validated,
            'tournament_id' => $t->id,
            'status' => $status,
            'registered_at' => now(),
            'confirmed_at' => $status === RegistrationStatus::Confirmed ? now() : null,
            'token' => Registration::generateToken(),
        ]);

        if ($status === RegistrationStatus::Confirmed) {
            Mail::to($registration->email)->send(new RegistrationConfirmed($registration));
        } else {
            Mail::to($registration->email)->send(new RegistrationReceived($registration));
        }

        $meldung = $vollAusgebucht
            ? __('registrations.waitlist_notice')
            : ($requiresManualConfirmation
                ? __('registrations.success.pending')
                : __('registrations.success.confirmed_direct'));

        return redirect(lroute('tournaments.index'))->with('success', $meldung);
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
            return redirect(lroute('tournaments.index'))
                ->with('info', __('registrations.errors.already_cancelled'));
        }

        $registration->update(['status' => RegistrationStatus::Cancelled]);

        $this->nachruckerBestaetigen($registration->tournament_id);

        return redirect(lroute('tournaments.index'))
            ->with('success', __('registrations.success.cancelled'));
    }

    protected function nachruckerBestaetigen(string $tournamentId): void
    {
        $tournament = Tournament::findOrFail($tournamentId);
        $naechster = Registration::where('tournament_id', $tournamentId)
            ->where('status', RegistrationStatus::Waitlist)
            ->orderBy('registered_at')
            ->first();

        if ($naechster === null) {
            return;
        }

        if ($tournament->requiresManualConfirmation()) {
            $naechster->update([
                'status' => RegistrationStatus::Pending,
                'confirmed_at' => null,
            ]);

            Mail::to($naechster->email)->send(new RegistrationReceived($naechster));

            return;
        }

        $naechster->update([
            'status' => RegistrationStatus::Confirmed,
            'confirmed_at' => now(),
        ]);

        Mail::to($naechster->email)->send(new WaitlistPromoted($naechster));
    }

    protected function validateRequest(Request $request, Tournament $tournament, int $spielerAnzahl): array
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

        foreach ($tournament->requiredRegistrationFields() as $field) {
            if (! array_key_exists($field, $rules)) {
                continue;
            }

            $rules[$field][0] = 'required';
            if ($field === 'team_name' && $spielerAnzahl === 1) {
                $rules[$field] = ['nullable', 'string', 'max:100'];
            }
            if ($field === 'partner_email' && $spielerAnzahl < 2) {
                $rules[$field] = ['nullable', 'email', 'max:255'];
            }
            if ($field === 'partner2_email' && $spielerAnzahl < 3) {
                $rules[$field] = ['nullable', 'email', 'max:255'];
            }
        }

        return $request->validate($rules);
    }
}
