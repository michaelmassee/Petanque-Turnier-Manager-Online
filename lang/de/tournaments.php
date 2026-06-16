<?php

return [
    'title' => 'Turniere',
    'upcoming' => 'Kommende Turniere',
    'register' => 'Anmelden',
    'zur_rangliste' => 'Rangliste',
    'no_tournaments' => 'Keine Turniere gefunden.',

    'start_menu' => [
        'find_label' => 'Start',
        'find_title' => 'Turnier suchen',
        'manager_label' => 'Turniermanager',
        'manager_title' => 'Registrieren',
        'login_label' => 'Zugang',
        'login_title' => 'Login',
        'admin_label' => 'Admin',
        'admin_title' => 'Adminbereich',
        'subtitle' => 'Turniere finden, anmelden und Ergebnisse einsehen.',
    ],

    'filters' => [
        'search' => 'Suche',
        'search_placeholder' => 'Name oder Ort',
        'status' => 'Status',
        'all_statuses' => 'Alle Status',
        'period' => 'Zeitraum',
        'periods' => [
            'upcoming' => 'Kommend',
            'past' => 'Vergangen',
            'all' => 'Alle',
        ],
        'formation' => 'Formation',
        'all_formations' => 'Alle Formationen',
        'location' => 'Ort',
        'location_placeholder' => 'Spielort',
        'mine' => 'Meine Turniere',
        'reset' => 'Zurücksetzen',
        'apply' => 'Filtern',
    ],

    'list_titles' => [
        'upcoming' => 'Kommende Turniere',
        'past' => 'Vergangene Turniere',
        'all' => 'Alle Turniere',
    ],

    'fields' => [
        'name' => 'Turniername',
        'date' => 'Datum',
        'location' => 'Spielort',
        'type' => 'Turniersystem',
        'formation' => 'Formation',
        'max_registrations' => 'Max. Teilnehmer (0 = unbegrenzt)',
        'registration_open' => 'Anmeldung offen',
        'registration_deadline' => 'Anmeldeschluss',
        'status' => 'Status',
        'description' => 'Beschreibung',
        'required_participant_fields' => 'Pflichtfelder für Teilnehmer',
        'manual_confirmation' => 'Teilnehmer müssen vom Turnierverwalter bestätigt werden',
        'allow_waitlist' => 'Warteliste aktivieren',
    ],

    'registration_requirements' => [
        'club' => 'Verein',
        'license_nr' => 'Lizenznummer',
        'team_name' => 'Teamname',
        'partner_email' => 'E-Mail von Spieler 2',
        'partner2_email' => 'E-Mail von Spieler 3',
    ],

    'type' => [
        'supermelee' => 'Supermêlée',
        'schweizer' => 'Schweizer',
        'maastrichter' => 'Maastrichter',
        'ko' => 'K.-O.',
        'poule_ab' => 'Poule A/B',
        'formule_x' => 'Formule X',
        'trip_tete' => 'Trip-Tête',
        'daenisch' => 'Dänisches System',
        'monrad' => 'Monrad-System',
        'arena' => 'Arena-Pétanque',
        'crazy_melee' => 'Crazy-Mêlée',
        'koelner_sextet' => 'Kölner Sextet',
        'tete_series' => 'Tête-Series',
        'kaskaden' => 'Kaskaden-KO',
        'jeder_gegen_jeden' => 'Jeder gegen Jeden',
        'liga' => 'Liga',
    ],

    'formation' => [
        'tete' => 'Tête (Einzeln)',
        'doublette' => 'Doublette (2er-Team)',
        'triplette' => 'Triplette (3er-Team)',
    ],

    'status' => [
        'draft' => 'Entwurf',
        'registration' => 'Anmeldung offen',
        'running' => 'Laufend',
        'finished' => 'Beendet',
    ],

    'registration_closed' => 'Die Anmeldung für dieses Turnier ist geschlossen.',
    'registration_full' => 'Dieses Turnier ist bereits ausgebucht.',
    'deadline_passed' => 'Der Anmeldeschluss ist überschritten.',

    'ranking' => [
        'title' => 'Rangliste — :name',
        'round' => 'Runde :round',
        'no_results' => 'Noch keine Ergebnisse verfügbar.',
        'place' => 'Platz',
        'player' => 'Spieler',
        'club' => 'Verein',
        'wins' => 'Siege',
        'points' => 'Punkte',
        'diff' => 'Differenz',
    ],
];
