<?php

return [
    'received' => [
        'subject' => 'Anmeldung erhalten – :tournament',
        'greeting' => 'Hallo :name,',
        'body' => 'Wir haben deine Anmeldung für das Turnier ":tournament" erhalten.',
        'manual_confirmation' => 'Der Turnierverwalter prüft deine Anmeldung und bestätigt sie separat.',
        'waitlist_hint' => 'Du stehst aktuell auf der Warteliste. Sobald ein Platz frei wird, erhältst du eine weitere E-Mail.',
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
