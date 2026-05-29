<?php

return [
    'title' => 'Tournaments',
    'upcoming' => 'Upcoming Tournaments',
    'register' => 'Register',
    'ranking' => 'Ranking',
    'no_tournaments' => 'No tournaments found.',

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
