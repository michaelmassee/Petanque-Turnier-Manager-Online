<?php

namespace App\Enums;

enum RegistrationStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Cancelled = 'cancelled';
    case Waitlist = 'waitlist';

    public function label(): string
    {
        return __('registrations.status.' . $this->value);
    }

    public function color(): string
    {
        return match($this) {
            self::Pending => 'yellow',
            self::Confirmed => 'green',
            self::Cancelled => 'red',
            self::Waitlist => 'orange',
        };
    }
}
