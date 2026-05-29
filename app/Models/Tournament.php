<?php

namespace App\Models;

use App\Enums\Formation;
use App\Enums\TournamentStatus;
use App\Enums\TournamentType;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Tournament extends Model
{
    use HasUlids;

    protected $fillable = [
        'name', 'date', 'location', 'type', 'formation',
        'max_registrations', 'registration_open', 'registration_deadline',
        'status', 'config', 'description', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'type' => TournamentType::class,
            'formation' => Formation::class,
            'status' => TournamentStatus::class,
            'date' => 'date',
            'registration_deadline' => 'datetime',
            'registration_open' => 'boolean',
            'config' => 'array',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function registrations(): HasMany
    {
        return $this->hasMany(Registration::class);
    }

    public function results(): HasMany
    {
        return $this->hasMany(Result::class);
    }

    public function latestResult(): HasOne
    {
        return $this->hasOne(Result::class)->latestOfMany('round');
    }

    public function isRegistrationOpen(): bool
    {
        if (! $this->registration_open || $this->status !== TournamentStatus::Registration) {
            return false;
        }
        if ($this->registration_deadline && $this->registration_deadline->isPast()) {
            return false;
        }
        if ($this->max_registrations > 0) {
            return $this->registrations()->whereIn('status', ['confirmed', 'pending'])->count() < $this->max_registrations;
        }
        return true;
    }

    public function confirmedCount(): int
    {
        return $this->registrations()->where('status', 'confirmed')->count();
    }

    public function generateApiToken(): string
    {
        $token = Str::random(64);
        $this->update(['api_token' => $token]);
        return $token;
    }
}
