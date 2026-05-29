<?php

use App\Http\Controllers\Admin;
use App\Http\Controllers\Public;
use Illuminate\Support\Facades\Route;

// Startseite ohne Sprachpräfix → Weiterleitung auf Browser-Sprache
Route::get('/', function () {
    $supported = ['de', 'en', 'fr', 'nl', 'es'];
    $browserLang = substr(request()->getPreferredLanguage($supported) ?? '', 0, 2);
    $locale = in_array($browserLang, $supported) ? $browserLang : 'de';
    return redirect('/' . $locale);
})->name('home');

// Öffentliche Routen — alle mit explizitem Sprach-Prefix (KEIN optional!)
foreach (['de', 'en', 'fr', 'nl', 'es'] as $locale) {
    Route::prefix($locale)->name("public.{$locale}.")->group(function () use ($locale) {
        Route::get('/', [Public\TournamentController::class, 'index'])->name('tournaments.index');

        Route::prefix('tournaments')->name('tournaments.')->group(function () {
            Route::get('{tournament}', [Public\TournamentController::class, 'show'])->name('show');
            Route::get('{tournament}/ranking', [Public\TournamentController::class, 'ranking'])->name('ranking');
            Route::get('{tournament}/register', [Public\RegistrationController::class, 'create'])->name('register');
            Route::post('{tournament}/register', [Public\RegistrationController::class, 'store'])->name('store');
        });

        Route::prefix('registration')->name('registration.')->group(function () {
            Route::get('{token}/confirm', [Public\RegistrationController::class, 'confirm'])->name('confirm');
            Route::get('{token}/cancel', [Public\RegistrationController::class, 'cancelForm'])->name('cancel.form');
            Route::post('{token}/cancel', [Public\RegistrationController::class, 'cancel'])->name('cancel');
        });
    });
}

// Breeze-kompatibler dashboard-Alias
Route::get('dashboard', fn() => redirect()->route('admin.tournaments.index'))
    ->middleware(['auth', 'verified'])
    ->name('dashboard');

Route::get('profile', fn() => redirect()->route('admin.tournaments.index'))
    ->middleware(['auth'])
    ->name('profile');

// Admin-Bereich (ohne Sprachpräfix)
Route::prefix('admin')->name('admin.')->middleware(['auth', 'verified'])->group(function () {
    Route::get('/', fn() => redirect()->route('admin.tournaments.index'))->name('dashboard');

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
