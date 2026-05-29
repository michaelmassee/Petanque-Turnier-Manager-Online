<?php

namespace App\Enums;

enum TournamentStatus: string
{
    case Draft = 'draft';
    case Registration = 'registration';
    case Running = 'running';
    case Finished = 'finished';

    public function label(): string
    {
        return __('tournaments.status.' . $this->value);
    }

    public function color(): string
    {
        return match($this) {
            self::Draft => 'gray',
            self::Registration => 'green',
            self::Running => 'blue',
            self::Finished => 'red',
        };
    }
}
