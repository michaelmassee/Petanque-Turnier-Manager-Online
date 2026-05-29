<?php

namespace App\Enums;

enum TournamentType: string
{
    case Supermelee = 'supermelee';
    case Schweizer = 'schweizer';
    case Maastrichter = 'maastrichter';
    case Ko = 'ko';
    case PouleAb = 'poule_ab';
    case FormuleX = 'formule_x';
    case TripTete = 'trip_tete';
    case Daenisch = 'daenisch';
    case Monrad = 'monrad';
    case Arena = 'arena';
    case CrazyMelee = 'crazy_melee';
    case KoelnerSextet = 'koelner_sextet';
    case TeteSeries = 'tete_series';
    case Kaskaden = 'kaskaden';

    public function label(): string
    {
        return __('tournaments.type.' . $this->value);
    }

    public function defaultFormation(): Formation
    {
        return match($this) {
            self::Supermelee, self::Arena, self::CrazyMelee => Formation::Tete,
            self::FormuleX, self::TripTete, self::Daenisch,
            self::Monrad, self::KoelnerSextet, self::TeteSeries => Formation::Doublette,
            default => Formation::Triplette,
        };
    }
}
