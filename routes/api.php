<?php

use App\Http\Controllers\Api\RegistrationApiController;
use App\Http\Controllers\Api\ResultApiController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1/tournaments/{tournamentId}')->group(function () {
    Route::get('registrations', [RegistrationApiController::class, 'index']);
    Route::post('results', [ResultApiController::class, 'store']);
    Route::patch('status', [ResultApiController::class, 'updateStatus']);
});
