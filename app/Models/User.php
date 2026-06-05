<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'club', 'license_nr', 'password', 'roles', 'approved_at'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    public const ROLE_ADMIN = 'admin';
    public const ROLE_TURNIERVERWALTER = 'turnierverwalter';
    public const ROLE_TEILNEHMER = 'teilnehmer';

    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'approved_at' => 'datetime',
            'roles' => 'array',
            'password' => 'hashed',
        ];
    }

    public function hasRole(string $role): bool
    {
        return in_array($role, $this->roles ?? [], true);
    }

    public function isAdmin(): bool
    {
        return $this->hasRole(self::ROLE_ADMIN);
    }

    public function isTurnierverwalter(): bool
    {
        return $this->hasRole(self::ROLE_TURNIERVERWALTER);
    }

    public function isTeilnehmer(): bool
    {
        return $this->hasRole(self::ROLE_TEILNEHMER);
    }

    /**
     * @return array<string, string>
     */
    public static function availableRoles(): array
    {
        return [
            self::ROLE_TEILNEHMER => __('admin.role_teilnehmer'),
            self::ROLE_TURNIERVERWALTER => __('admin.role_turnierverwalter'),
            self::ROLE_ADMIN => __('admin.role_admin'),
        ];
    }

    public function tournaments(): HasMany
    {
        return $this->hasMany(Tournament::class, 'created_by');
    }

    public function isApproved(): bool
    {
        return $this->isAdmin() || ($this->isTurnierverwalter() && $this->approved_at !== null);
    }

    public function canAccessAdmin(): bool
    {
        return $this->isAdmin() || $this->isApproved();
    }

    public function grantRole(string $role): void
    {
        $roles = $this->roles ?? [];
        if (! in_array($role, $roles, true)) {
            $roles[] = $role;
            $this->roles = array_values($roles);
        }
    }

    public function revokeRole(string $role): void
    {
        $this->roles = array_values(array_filter(
            $this->roles ?? [],
            fn (string $existing): bool => $existing !== $role
        ));
    }
}
