<?php

namespace App\Models;

use App\Enums\Formation;
use App\Enums\TournamentStatus;
use App\Enums\TournamentType;
use Illuminate\Database\Eloquent\Builder;
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
        'name', 'date', 'location', 'type', 'formation', 'api_token',
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
        if ($this->status !== TournamentStatus::Registration) {
            return false;
        }
        if ($this->registration_deadline && $this->registration_deadline->isPast()) {
            return false;
        }
        if ($this->max_registrations > 0) {
            return $this->registrations()->whereIn('status', ['confirmed', 'pending'])->count() < $this->max_registrations
                || $this->allowsWaitlist();
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

    public function requiredRegistrationFields(): array
    {
        return data_get($this->config ?? [], 'required_fields', []);
    }

    public function requiresRegistrationField(string $field): bool
    {
        return in_array($field, $this->requiredRegistrationFields(), true);
    }

    public function requiresManualConfirmation(): bool
    {
        return (bool) data_get($this->config ?? [], 'manual_confirmation', false);
    }

    public function allowsWaitlist(): bool
    {
        return (bool) data_get($this->config ?? [], 'allow_waitlist', false);
    }

    /**
     * @param  array{q: string, status: string, period: string, formation: string, location: string, mine: bool}  $filters
     */
    public static function visibleQuery(array $filters, ?User $user = null): Builder
    {
        $visibleStatuses = [
            TournamentStatus::Registration->value,
            TournamentStatus::Running->value,
            TournamentStatus::Finished->value,
        ];

        return static::query()
            ->whereIn('status', $visibleStatuses)
            ->when($filters['q'] !== '', function (Builder $query) use ($filters) {
                $query->where(function (Builder $query) use ($filters) {
                    $query
                        ->where('name', 'like', '%'.$filters['q'].'%')
                        ->orWhere('location', 'like', '%'.$filters['q'].'%');
                });
            })
            ->when($filters['status'] !== '', fn (Builder $query) => $query->where('status', $filters['status']))
            ->when($filters['period'] === 'upcoming', fn (Builder $query) => $query->whereDate('date', '>=', now()->toDateString()))
            ->when($filters['period'] === 'past', fn (Builder $query) => $query->whereDate('date', '<', now()->toDateString()))
            ->when($filters['formation'] !== '', fn (Builder $query) => $query->where('formation', $filters['formation']))
            ->when($filters['location'] !== '', fn (Builder $query) => $query->where('location', 'like', '%'.$filters['location'].'%'))
            ->when($filters['mine'] && $user !== null, function (Builder $query) use ($user) {
                $query->where(function (Builder $query) use ($user) {
                    $query
                        ->where('created_by', $user->id)
                        ->orWhereHas('registrations', function (Builder $query) use ($user) {
                            $query->where('user_id', $user->id)->orWhere('email', $user->email);
                        });
                });
            })
            ->orderBy('date');
    }
}
