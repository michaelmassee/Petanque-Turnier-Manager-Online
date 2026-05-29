<?php

return [
    'title' => 'Tournois',
    'upcoming' => 'Tournois à venir',
    'register' => 'S\'inscrire',
    'ranking' => 'Classement',
    'no_tournaments' => 'Aucun tournoi trouvé.',

    'fields' => [
        'name' => 'Nom du tournoi',
        'date' => 'Date',
        'location' => 'Lieu',
        'type' => 'Système de tournoi',
        'formation' => 'Formation',
        'max_registrations' => 'Max. participants (0 = illimité)',
        'registration_open' => 'Inscriptions ouvertes',
        'registration_deadline' => 'Date limite d\'inscription',
        'status' => 'Statut',
        'description' => 'Description',
    ],

    'type' => [
        'supermelee' => 'Supermêlée',
        'schweizer' => 'Système suisse',
        'maastrichter' => 'Système maastrichtois',
        'ko' => 'Élimination directe',
        'poule_ab' => 'Poule A/B',
        'formule_x' => 'Formule X',
        'trip_tete' => 'Trip-Tête',
        'daenisch' => 'Système danois',
        'monrad' => 'Système Monrad',
        'arena' => 'Arena Pétanque',
        'crazy_melee' => 'Crazy Mêlée',
        'koelner_sextet' => 'Sextet de Cologne',
        'tete_series' => 'Tête-Séries',
        'kaskaden' => 'KO en cascade',
    ],

    'formation' => [
        'tete' => 'Tête (individuel)',
        'doublette' => 'Doublette (équipe de 2)',
        'triplette' => 'Triplette (équipe de 3)',
    ],

    'status' => [
        'draft' => 'Brouillon',
        'registration' => 'Inscriptions ouvertes',
        'running' => 'En cours',
        'finished' => 'Terminé',
    ],

    'registration_closed' => 'Les inscriptions pour ce tournoi sont fermées.',
    'registration_full' => 'Ce tournoi est complet.',
    'deadline_passed' => 'La date limite d\'inscription est dépassée.',

    'ranking' => [
        'title' => 'Classement — :name',
        'round' => 'Ronde :round',
        'no_results' => 'Aucun résultat disponible pour l\'instant.',
        'place' => 'Place',
        'player' => 'Joueur',
        'club' => 'Club',
        'wins' => 'Victoires',
        'points' => 'Points',
        'diff' => 'Différence',
    ],
];
