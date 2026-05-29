<?php

return [
    'title' => 'Torneos',
    'upcoming' => 'Próximos torneos',
    'register' => 'Inscribirse',
    'ranking' => 'Clasificación',
    'no_tournaments' => 'No se encontraron torneos.',

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
