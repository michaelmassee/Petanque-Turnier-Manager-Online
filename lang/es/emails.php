<?php

return [
    'received' => [
        'subject' => 'Inscripción recibida – :tournament',
        'greeting' => 'Hola :name,',
        'body' => 'Hemos recibido tu inscripción para el torneo ":tournament".',
        'manual_confirmation' => 'El gestor del torneo revisará tu inscripción y la confirmará por separado.',
        'waitlist_hint' => 'Actualmente estás en la lista de espera. Si queda una plaza libre, recibirás otro correo.',
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
