<?php

namespace App\Http\Controllers\Public\Mobile;

use App\Enums\RegistrationStatus;
use App\Http\Controllers\Public\RegistrationController as PublicRegistrationController;
use App\Mail\RegistrationConfirmed;
use App\Mail\RegistrationReceived;
use App\Models\Registration;
use App\Models\Tournament;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\View\View;

class RegistrationController extends PublicRegistrationController
{
    public function create(string $tournament): View|RedirectResponse
    {
        $t = Tournament::findOrFail($tournament);

        if (! $t->isRegistrationOpen()) {
            return redirect(mroute('tournaments.search'))
                ->with('error', __('tournaments.registration_closed'));
        }

        return view('public.mobile.registrations.create', ['tournament' => $t]);
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
            'user_id' => $request->user()->id,
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

        return redirect(mroute('tournaments.my'))->with('success', $meldung);
    }
}
