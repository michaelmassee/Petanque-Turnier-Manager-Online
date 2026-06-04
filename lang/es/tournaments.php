<?php

return [
    'title' => 'Torneos',
    'upcoming' => 'Próximos torneos',
    'register' => 'Inscribirse',
    'zur_rangliste' => 'Clasificación',
    'no_tournaments' => 'No se encontraron torneos.',

    'start_menu' => [
        'find_label' => 'Inicio',
        'find_title' => 'Buscar torneo',
        'manager_label' => 'Gestor de torneos',
        'manager_title' => 'Registrarse',
        'login_label' => 'Acceso',
        'login_title' => 'Login',
        'admin_label' => 'Admin',
        'admin_title' => 'Administración',
        'subtitle' => 'Encontrar torneos, inscribirse y ver resultados.',
    ],

    'filters' => [
        'search' => 'Buscar',
        'search_placeholder' => 'Nombre o lugar',
        'status' => 'Estado',
        'all_statuses' => 'Todos los estados',
        'period' => 'Periodo',
        'periods' => [
            'upcoming' => 'Próximos',
            'past' => 'Pasados',
            'all' => 'Todos',
        ],
        'formation' => 'Formación',
        'all_formations' => 'Todas las formaciones',
        'location' => 'Lugar',
        'location_placeholder' => 'Lugar de juego',
        'mine' => 'Mis torneos',
        'reset' => 'Restablecer',
        'apply' => 'Filtrar',
    ],

    'list_titles' => [
        'upcoming' => 'Próximos torneos',
        'past' => 'Torneos pasados',
        'all' => 'Todos los torneos',
    ],

    'fields' => [
        'name' => 'Nombre del torneo',
        'date' => 'Fecha',
        'location' => 'Lugar',
        'type' => 'Sistema de torneo',
        'formation' => 'Formación',
        'max_registrations' => 'Máx. participantes (0 = ilimitado)',
        'registration_open' => 'Inscripción abierta',
        'registration_deadline' => 'Fecha límite de inscripción',
        'status' => 'Estado',
        'description' => 'Descripción',
        'required_participant_fields' => 'Campos obligatorios para participantes',
        'manual_confirmation' => 'Los participantes deben ser confirmados por el gestor del torneo',
    ],

    'registration_requirements' => [
        'club' => 'Club',
        'license_nr' => 'Número de licencia',
        'team_name' => 'Nombre del equipo',
        'partner_email' => 'Correo del jugador 2',
        'partner2_email' => 'Correo del jugador 3',
    ],

    'type' => [
        'supermelee' => 'Supermêlée',
        'schweizer' => 'Sistema suizo',
        'maastrichter' => 'Sistema de Maastricht',
        'ko' => 'Eliminación directa',
        'poule_ab' => 'Poule A/B',
        'formule_x' => 'Fórmula X',
        'trip_tete' => 'Trip-Tête',
        'daenisch' => 'Sistema danés',
        'monrad' => 'Sistema Monrad',
        'arena' => 'Arena Pétanque',
        'crazy_melee' => 'Crazy Mêlée',
        'koelner_sextet' => 'Sexteto de Colonia',
        'tete_series' => 'Tête-Series',
        'kaskaden' => 'KO en cascada',
    ],

    'formation' => [
        'tete' => 'Tête (individual)',
        'doublette' => 'Doublette (equipo de 2)',
        'triplette' => 'Triplette (equipo de 3)',
    ],

    'status' => [
        'draft' => 'Borrador',
        'registration' => 'Inscripción abierta',
        'running' => 'En curso',
        'finished' => 'Finalizado',
    ],

    'registration_closed' => 'La inscripción para este torneo está cerrada.',
    'registration_full' => 'Este torneo está completo.',
    'deadline_passed' => 'El plazo de inscripción ha pasado.',

    'ranking' => [
        'title' => 'Clasificación — :name',
        'round' => 'Ronda :round',
        'no_results' => 'Aún no hay resultados disponibles.',
        'place' => 'Puesto',
        'player' => 'Jugador',
        'club' => 'Club',
        'wins' => 'Victorias',
        'points' => 'Puntos',
        'diff' => 'Diferencia',
    ],
];
