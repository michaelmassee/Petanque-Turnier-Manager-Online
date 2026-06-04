<?php

return [
    'title' => 'Tournaments',
    'upcoming' => 'Upcoming Tournaments',
    'register' => 'Register',
    'zur_rangliste' => 'Ranking',
    'no_tournaments' => 'No tournaments found.',

    'start_menu' => [
        'find_label' => 'Start',
        'find_title' => 'Find tournament',
        'manager_label' => 'Tournament manager',
        'manager_title' => 'Register',
        'login_label' => 'Access',
        'login_title' => 'Login',
        'admin_label' => 'Admin',
        'admin_title' => 'Admin area',
        'subtitle' => 'Find tournaments, register and view results.',
    ],

    'filters' => [
        'search' => 'Search',
        'search_placeholder' => 'Name or location',
        'status' => 'Status',
        'all_statuses' => 'All statuses',
        'period' => 'Period',
        'periods' => [
            'upcoming' => 'Upcoming',
            'past' => 'Past',
            'all' => 'All',
        ],
        'formation' => 'Formation',
        'all_formations' => 'All formations',
        'location' => 'Location',
        'location_placeholder' => 'Venue',
        'mine' => 'My tournaments',
        'reset' => 'Reset',
        'apply' => 'Filter',
    ],

    'list_titles' => [
        'upcoming' => 'Upcoming Tournaments',
        'past' => 'Past Tournaments',
        'all' => 'All Tournaments',
    ],

    'fields' => [
        'name' => 'Tournament Name',
        'date' => 'Date',
        'location' => 'Location',
        'type' => 'Tournament System',
        'formation' => 'Formation',
        'max_registrations' => 'Max. Participants (0 = unlimited)',
        'registration_open' => 'Registration Open',
        'registration_deadline' => 'Registration Deadline',
        'status' => 'Status',
        'description' => 'Description',
        'required_participant_fields' => 'Required participant fields',
        'manual_confirmation' => 'Participants must be confirmed by the tournament manager',
    ],

    'registration_requirements' => [
        'club' => 'Club',
        'license_nr' => 'License number',
        'team_name' => 'Team name',
        'partner_email' => 'Email for player 2',
        'partner2_email' => 'Email for player 3',
    ],

    'type' => [
        'supermelee' => 'Supermêlée',
        'schweizer' => 'Swiss System',
        'maastrichter' => 'Maastricht System',
        'ko' => 'Knock-out',
        'poule_ab' => 'Poule A/B',
        'formule_x' => 'Formule X',
        'trip_tete' => 'Trip-Tête',
        'daenisch' => 'Danish System',
        'monrad' => 'Monrad System',
        'arena' => 'Arena Pétanque',
        'crazy_melee' => 'Crazy Mêlée',
        'koelner_sextet' => 'Cologne Sextet',
        'tete_series' => 'Tête Series',
        'kaskaden' => 'Cascade KO',
    ],

    'formation' => [
        'tete' => 'Tête (Singles)',
        'doublette' => 'Doublette (2-player team)',
        'triplette' => 'Triplette (3-player team)',
    ],

    'status' => [
        'draft' => 'Draft',
        'registration' => 'Registration Open',
        'running' => 'Running',
        'finished' => 'Finished',
    ],

    'registration_closed' => 'Registration for this tournament is closed.',
    'registration_full' => 'This tournament is fully booked.',
    'deadline_passed' => 'The registration deadline has passed.',

    'ranking' => [
        'title' => 'Ranking — :name',
        'round' => 'Round :round',
        'no_results' => 'No results available yet.',
        'place' => 'Place',
        'player' => 'Player',
        'club' => 'Club',
        'wins' => 'Wins',
        'points' => 'Points',
        'diff' => 'Difference',
    ],
];
