<?php

return [
    'title' => 'Inscripción',
    'subtitle' => 'Inscripción para :tournament',
    'submit' => 'Inscribirse ahora',
    'cancel_link' => 'Cancelar inscripción',

    'fields' => [
        'first_name' => 'Nombre',
        'last_name' => 'Apellido',
        'email' => 'Correo electrónico',
        'club' => 'Club',
        'license_nr' => 'Número de licencia',
        'team_name' => 'Nombre del equipo',
        'partner' => 'Compañero',
        'partner2' => 'Tercer jugador',
        'status' => 'Estado',
    ],

    'status' => [
        'pending' => 'Pendiente',
        'confirmed' => 'Confirmada',
        'cancelled' => 'Cancelada',
        'waitlist' => 'Lista de espera',
    ],

    'success' => [
        'pending' => 'Tu inscripción ha sido recibida. El organizador del torneo la confirmará por separado.',
        'confirmed' => 'Tu inscripción ha sido confirmada con éxito.',
        'confirmed_direct' => 'Tu inscripción ha sido aceptada con éxito.',
        'cancelled' => 'Tu inscripción ha sido cancelada.',
    ],

    'errors' => [
        'duplicate_email' => 'Este correo electrónico ya está inscrito en este torneo.',
        'invalid_token' => 'Enlace inválido o caducado.',
        'already_confirmed' => 'Esta inscripción ya ha sido confirmada.',
        'already_cancelled' => 'Esta inscripción ya ha sido cancelada.',
    ],

    'waitlist_notice' => 'El torneo está completo. Has sido añadido a la lista de espera.',
    'privacy_notice' => 'Los datos introducidos se procesan para gestionar la inscripción al torneo y se comparten con gestores autorizados. Más detalles en la <a class="text-green-700 hover:underline" href=":privacy_url">política de privacidad</a>.',
    'confirm_cancel' => '¿Realmente quieres cancelar tu inscripción?',
    'yes_cancel' => 'Sí, cancelar',
    'no_back' => 'Volver',
];
