<?php

namespace App\Enums;

enum TournamentType: string
{
    case FormuleX = 'formule_x';
    case JederGegenJeden = 'jeder_gegen_jeden';
    case Ko = 'ko';
    case Kaskaden = 'kaskaden';
    case Liga = 'liga';
    case Maastrichter = 'maastrichter';
    case PouleAb = 'poule_ab';
    case Schweizer = 'schweizer';
    case Supermelee = 'supermelee';
    case TripTete = 'trip_tete';

    // Legacy Online-only values. Keep them castable for existing tournaments,
    // but do not offer them when creating new tournaments.
    case Daenisch = 'daenisch';
    case Monrad = 'monrad';
    case Arena = 'arena';
    case CrazyMelee = 'crazy_melee';
    case KoelnerSextet = 'koelner_sextet';
    case TeteSeries = 'tete_series';

    public static function availableCases(): array
    {
        return [
            self::FormuleX,
            self::JederGegenJeden,
            self::Ko,
            self::Kaskaden,
            self::Liga,
            self::Maastrichter,
            self::PouleAb,
            self::Schweizer,
            self::Supermelee,
            self::TripTete,
        ];
    }

    public function label(): string
    {
        return __('tournaments.type.' . $this->value);
    }

    public function defaultFormation(): Formation
    {
        return match($this) {
            self::Supermelee, self::Arena, self::CrazyMelee => Formation::Tete,
            self::JederGegenJeden, self::Liga => Formation::Doublette,
            self::FormuleX, self::TripTete, self::Daenisch,
            self::Monrad, self::KoelnerSextet, self::TeteSeries => Formation::Doublette,
            default => Formation::Triplette,
        };
    }
}
