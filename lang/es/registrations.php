<?php

return [
    'title' => 'Inscripción',
    'subtitle' => 'Inscripción para :tournament',
    'submit' => 'Inscribirse ahora',
    'cancel_link' => 'Cancelar inscripción',
    'confirm_link' => 'Confirmar inscripción',

    'fields' => [
        'first_name' => 'Nombre',
        'last_name' => 'Apellido',
        'email' => 'Correo electrónico',
        'club' => 'Club (opcional)',
        'license_nr' => 'Número de licencia (opcional)',
        'team_name' => 'Nombre del equipo (opcional)',
        'partner' => 'Compañero',
        'partner2' => 'Tercer jugador',
    ],

    'status' => [
        'pending' => 'Pendiente',
        'confirmed' => 'Confirmada',
        'cancelled' => 'Cancelada',
        'waitlist' => 'Lista de espera',
    ],

    'success' => [
        'pending' => 'Tu inscripción ha sido recibida. Por favor confírmala mediante el enlace en el correo.',
        'confirmed' => '¡Tu inscripción ha sido confirmada con éxito!',
        'cancelled' => 'Tu inscripción ha sido cancelada.',
    ],

    'errors' => [
        'duplicate_email' => 'Este correo electrónico ya está inscrito en este torneo.',
        'invalid_token' => 'Enlace inválido o caducado.',
        'already_confirmed' => 'Esta inscripción ya ha sido confirmada.',
        'already_cancelled' => 'Esta inscripción ya ha sido cancelada.',
    ],

    'waitlist_notice' => 'El torneo está completo. Has sido añadido a la lista de espera.',
    'confirm_cancel' => '¿Realmente quieres cancelar tu inscripción?',
    'yes_cancel' => 'Sí, cancelar',
    'no_back' => 'Volver',
];
