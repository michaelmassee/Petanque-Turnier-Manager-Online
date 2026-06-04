<?php

return [
    'title' => 'Tournois',
    'upcoming' => 'Tournois à venir',
    'register' => 'S\'inscrire',
    'zur_rangliste' => 'Classement',
    'no_tournaments' => 'Aucun tournoi trouvé.',

    'start_menu' => [
        'find_label' => 'Accueil',
        'find_title' => 'Trouver un tournoi',
        'manager_label' => 'Gestionnaire',
        'manager_title' => 'S\'inscrire',
        'login_label' => 'Accès',
        'login_title' => 'Connexion',
        'admin_label' => 'Admin',
        'admin_title' => 'Administration',
        'subtitle' => 'Trouver des tournois, s\'inscrire et consulter les résultats.',
    ],

    'filters' => [
        'search' => 'Recherche',
        'search_placeholder' => 'Nom ou lieu',
        'status' => 'Statut',
        'all_statuses' => 'Tous les statuts',
        'period' => 'Période',
        'periods' => [
            'upcoming' => 'À venir',
            'past' => 'Passés',
            'all' => 'Tous',
        ],
        'formation' => 'Formation',
        'all_formations' => 'Toutes les formations',
        'location' => 'Lieu',
        'location_placeholder' => 'Lieu de jeu',
        'mine' => 'Mes tournois',
        'reset' => 'Réinitialiser',
        'apply' => 'Filtrer',
    ],

    'list_titles' => [
        'upcoming' => 'Tournois à venir',
        'past' => 'Tournois passés',
        'all' => 'Tous les tournois',
    ],

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
        'required_participant_fields' => 'Champs obligatoires pour les participants',
        'manual_confirmation' => 'Les participants doivent être validés par le gestionnaire du tournoi',
    ],

    'registration_requirements' => [
        'club' => 'Club',
        'license_nr' => 'Numéro de licence',
        'team_name' => 'Nom d\'équipe',
        'partner_email' => 'E-mail du joueur 2',
        'partner2_email' => 'E-mail du joueur 3',
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
