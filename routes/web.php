<?php

use App\Http\Controllers\Admin;
use App\Http\Controllers\Public;
use Illuminate\Support\Facades\Route;

// Startseite ohne Sprachpräfix → Weiterleitung auf Browser-Sprache
Route::get('/', function () {
    $supported = ['de', 'en', 'fr', 'nl', 'es'];
    $browserLang = substr(request()->getPreferredLanguage($supported) ?? '', 0, 2);
    $locale = in_array($browserLang, $supported) ? $browserLang : 'de';

    return redirect()->route("public.{$locale}.tournaments.index");
})->name('home');

// Öffentliche Routen — alle mit explizitem Sprach-Prefix (KEIN optional!)
foreach (['de', 'en', 'fr', 'nl', 'es'] as $locale) {
    Route::prefix($locale)->name("public.{$locale}.")->group(function () {
        Route::get('/', [Public\TournamentController::class, 'index'])->name('tournaments.index');
        Route::view('impressum', 'legal.imprint')->name('legal.imprint');
        Route::view('datenschutz', 'legal.privacy')->name('legal.privacy');

        Route::prefix('tournaments')->name('tournaments.')->group(function () {
            Route::get('{tournament}', [Public\TournamentController::class, 'show'])->name('show');
            Route::get('{tournament}/ranking', [Public\TournamentController::class, 'ranking'])->name('ranking');
            Route::get('{tournament}/register', [Public\RegistrationController::class, 'create'])->name('register');
            Route::post('{tournament}/register', [Public\RegistrationController::class, 'store'])->name('store');
        });

        Route::prefix('registration')->name('registration.')->group(function () {
            Route::get('{token}/cancel', [Public\RegistrationController::class, 'cancelForm'])->name('cancel.form');
            Route::post('{token}/cancel', [Public\RegistrationController::class, 'cancel'])->name('cancel');
        });

        // Mobiler Teilnehmer-Bereich ("PTM Handy") — eingeloggte Teilnehmer, kein Admin-Freigabe-Gate
        Route::prefix('app')->name('app.')->middleware('auth')->group(function () {
            Route::get('/', [Public\Mobile\TournamentController::class, 'search'])->name('tournaments.search');
            Route::get('tournaments/{tournament}', [Public\Mobile\TournamentController::class, 'show'])->name('tournaments.show');
            Route::get('tournaments/{tournament}/register', [Public\Mobile\RegistrationController::class, 'create'])->name('registrations.create');
            Route::post('tournaments/{tournament}/register', [Public\Mobile\RegistrationController::class, 'store'])->name('registrations.store');
            Route::get('my-tournaments', [Public\Mobile\TournamentController::class, 'mine'])->name('tournaments.my');
            Route::get('tournament-day', fn () => view('public.mobile.tournament-day'))->name('tournament-day');
        });
    });
}

// Breeze-kompatibler dashboard-Alias
Route::get('dashboard', fn () => redirect()->route('admin.tournaments.index'))
    ->middleware(['auth', 'verified', 'approved'])
    ->name('dashboard');

Route::get('approval-pending', fn () => view('auth.approval-pending'))
    ->middleware(['auth', 'verified'])
    ->name('approval.pending');

Route::view('profile', 'profile')
    ->middleware(['auth'])
    ->name('profile');

// Admin-Bereich (ohne Sprachpräfix)
Route::prefix('admin')->name('admin.')->middleware(['auth', 'verified', 'approved'])->group(function () {
    Route::get('/', fn () => redirect()->route('admin.tournaments.index'))->name('dashboard');

    Route::get('users', [Admin\UserApprovalController::class, 'index'])->name('users.index');
    Route::get('users/create', [Admin\UserApprovalController::class, 'create'])->name('users.create');
    Route::post('users', [Admin\UserApprovalController::class, 'store'])->name('users.store');
    Route::get('users/{user}/edit', [Admin\UserApprovalController::class, 'edit'])->name('users.edit');
    Route::put('users/{user}', [Admin\UserApprovalController::class, 'update'])->name('users.update');
    Route::delete('users/{user}', [Admin\UserApprovalController::class, 'destroy'])->name('users.destroy');
    Route::patch('users/{user}/approve', [Admin\UserApprovalController::class, 'approve'])->name('users.approve');
    Route::patch('users/{user}/revoke', [Admin\UserApprovalController::class, 'revoke'])->name('users.revoke');

    Route::prefix('tournaments')->name('tournaments.')->group(function () {
        Route::get('/', [Admin\TournamentController::class, 'index'])->name('index');
        Route::get('/create', [Admin\TournamentController::class, 'create'])->name('create');
        Route::post('/', [Admin\TournamentController::class, 'store'])->name('store');
        Route::get('{tournament}/edit', [Admin\TournamentController::class, 'edit'])->name('edit');
        Route::put('{tournament}', [Admin\TournamentController::class, 'update'])->name('update');
        Route::delete('{tournament}', [Admin\TournamentController::class, 'destroy'])->name('destroy');
        Route::post('{tournament}/generate-token', [Admin\TournamentController::class, 'generateToken'])->name('generate-token');

        Route::get('{tournament}/registrations', [Admin\RegistrationController::class, 'index'])->name('registrations');
        Route::get('{tournament}/registrations/export', [Admin\RegistrationController::class, 'exportCsv'])->name('registrations.export');
    });

    Route::prefix('registrations')->name('registrations.')->group(function () {
        Route::patch('{registration}/status', [Admin\RegistrationController::class, 'updateStatus'])->name('status');
        Route::patch('{registration}/seeding', [Admin\RegistrationController::class, 'updateSeeding'])->name('seeding');
    });
});

require __DIR__.'/auth.php';
