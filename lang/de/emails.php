<?php

return [
    'received' => [
        'subject' => 'Anmeldung erhalten – :tournament',
        'greeting' => 'Hallo :name,',
        'body' => 'Wir haben deine Anmeldung für das Turnier ":tournament" erhalten.',
        'confirm_button' => 'Anmeldung bestätigen',
        'confirm_hint' => 'Bitte klicke auf den Button, um deine Anmeldung zu bestätigen.',
        'expires' => 'Der Link ist 48 Stunden gültig.',
    ],
    'confirmed' => [
        'subject' => 'Anmeldung bestätigt – :tournament',
        'greeting' => 'Hallo :name,',
        'body' => 'Deine Anmeldung für das Turnier ":tournament" am :date in :location wurde bestätigt.',
        'cancel_button' => 'Anmeldung stornieren',
        'footer' => 'Wir freuen uns auf dich!',
    ],
    'waitlist_promoted' => [
        'subject' => 'Du bist jetzt dabei – :tournament',
        'greeting' => 'Hallo :name,',
        'body' => 'Ein Platz wurde frei! Du rückst vom Warteliste-Platz nach und bist jetzt für ":tournament" bestätigt.',
    ],
];
