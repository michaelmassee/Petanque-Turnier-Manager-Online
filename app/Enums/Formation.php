<?php

namespace App\Enums;

enum Formation: string
{
    case Tete = 'tete';
    case Doublette = 'doublette';
    case Triplette = 'triplette';

    public function label(): string
    {
        return __('tournaments.formation.' . $this->value);
    }

    public function spielerAnzahl(): int
    {
        return match($this) {
            self::Tete => 1,
            self::Doublette => 2,
            self::Triplette => 3,
        };
    }
}
