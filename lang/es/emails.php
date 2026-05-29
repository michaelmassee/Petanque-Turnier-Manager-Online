<?php

return [
    'received' => [
        'subject' => 'Inscripción recibida – :tournament',
        'greeting' => 'Hola :name,',
        'body' => 'Hemos recibido tu inscripción para el torneo ":tournament".',
        'confirm_button' => 'Confirmar inscripción',
        'confirm_hint' => 'Por favor haz clic en el botón para confirmar tu inscripción.',
        'expires' => 'El enlace es válido durante 48 horas.',
    ],
    'confirmed' => [
        'subject' => 'Inscripción confirmada – :tournament',
        'greeting' => 'Hola :name,',
        'body' => 'Tu inscripción para el torneo ":tournament" el :date en :location ha sido confirmada.',
        'cancel_button' => 'Cancelar inscripción',
        'footer' => '¡Esperamos verte allí!',
    ],
    'waitlist_promoted' => [
        'subject' => 'Ya estás inscrito – :tournament',
        'greeting' => 'Hola :name,',
        'body' => '¡Se ha liberado un lugar! Has salido de la lista de espera y ahora estás confirmado para ":tournament".',
    ],
];
