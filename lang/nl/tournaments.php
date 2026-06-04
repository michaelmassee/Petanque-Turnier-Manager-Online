<?php

return [
    'title' => 'Toernooien',
    'upcoming' => 'Komende toernooien',
    'register' => 'Inschrijven',
    'zur_rangliste' => 'Ranglijst',
    'no_tournaments' => 'Geen toernooien gevonden.',

    'start_menu' => [
        'find_label' => 'Start',
        'find_title' => 'Toernooi zoeken',
        'manager_label' => 'Toernooibeheerder',
        'manager_title' => 'Registreren',
        'login_label' => 'Toegang',
        'login_title' => 'Login',
        'admin_label' => 'Admin',
        'admin_title' => 'Adminomgeving',
        'subtitle' => 'Toernooien vinden, inschrijven en resultaten bekijken.',
    ],

    'filters' => [
        'search' => 'Zoeken',
        'search_placeholder' => 'Naam of locatie',
        'status' => 'Status',
        'all_statuses' => 'Alle statussen',
        'period' => 'Periode',
        'periods' => [
            'upcoming' => 'Komend',
            'past' => 'Verleden',
            'all' => 'Alle',
        ],
        'formation' => 'Formatie',
        'all_formations' => 'Alle formaties',
        'location' => 'Locatie',
        'location_placeholder' => 'Speellocatie',
        'mine' => 'Mijn toernooien',
        'reset' => 'Resetten',
        'apply' => 'Filteren',
    ],

    'list_titles' => [
        'upcoming' => 'Komende toernooien',
        'past' => 'Afgelopen toernooien',
        'all' => 'Alle toernooien',
    ],

    'fields' => [
        'name' => 'Toernooinama',
        'date' => 'Datum',
        'location' => 'Locatie',
        'type' => 'Toernooisysteem',
        'formation' => 'Formatie',
        'max_registrations' => 'Max. deelnemers (0 = onbeperkt)',
        'registration_open' => 'Inschrijving open',
        'registration_deadline' => 'Inschrijvingsdeadline',
        'status' => 'Status',
        'description' => 'Beschrijving',
        'required_participant_fields' => 'Verplichte velden voor deelnemers',
        'manual_confirmation' => 'Deelnemers moeten door de toernooibeheerder worden bevestigd',
    ],

    'registration_requirements' => [
        'club' => 'Club',
        'license_nr' => 'Licentienummer',
        'team_name' => 'Teamnaam',
        'partner_email' => 'E-mail van speler 2',
        'partner2_email' => 'E-mail van speler 3',
    ],

    'type' => [
        'supermelee' => 'Supermêlée',
        'schweizer' => 'Zwitsers systeem',
        'maastrichter' => 'Maastrichts systeem',
        'ko' => 'Knock-out',
        'poule_ab' => 'Poule A/B',
        'formule_x' => 'Formule X',
        'trip_tete' => 'Trip-Tête',
        'daenisch' => 'Deens systeem',
        'monrad' => 'Monrad-systeem',
        'arena' => 'Arena Pétanque',
        'crazy_melee' => 'Crazy Mêlée',
        'koelner_sextet' => 'Kölner Sextet',
        'tete_series' => 'Tête-Series',
        'kaskaden' => 'Cascade KO',
    ],

    'formation' => [
        'tete' => 'Tête (individueel)',
        'doublette' => 'Doublette (2-spelersteam)',
        'triplette' => 'Triplette (3-spelersteam)',
    ],

    'status' => [
        'draft' => 'Concept',
        'registration' => 'Inschrijving open',
        'running' => 'Bezig',
        'finished' => 'Afgelopen',
    ],

    'registration_closed' => 'De inschrijving voor dit toernooi is gesloten.',
    'registration_full' => 'Dit toernooi is volgeboekt.',
    'deadline_passed' => 'De inschrijvingsdeadline is verstreken.',

    'ranking' => [
        'title' => 'Ranglijst — :name',
        'round' => 'Ronde :round',
        'no_results' => 'Nog geen resultaten beschikbaar.',
        'place' => 'Plaats',
        'player' => 'Speler',
        'club' => 'Club',
        'wins' => 'Overwinningen',
        'points' => 'Punten',
        'diff' => 'Verschil',
    ],
];
