<?php

namespace App\Models;

use App\Enums\RegistrationStatus;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Registration extends Model
{
    use HasUlids;

    protected $fillable = [
        'tournament_id',
        'first_name', 'last_name', 'email', 'club', 'license_nr',
        'partner_first_name', 'partner_last_name', 'partner_email',
        'partner2_first_name', 'partner2_last_name', 'partner2_email',
        'team_name', 'seeding_position', 'status',
        'registered_at', 'confirmed_at', 'token', 'ptm_player_nr',
    ];

    protected function casts(): array
    {
        return [
            'status' => RegistrationStatus::class,
            'registered_at' => 'datetime',
            'confirmed_at' => 'datetime',
        ];
    }

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    public function vollstaendigerName(): string
    {
        return $this->first_name . ' ' . $this->last_name;
    }

    public static function generateToken(): string
    {
        return Str::random(64);
    }
}
