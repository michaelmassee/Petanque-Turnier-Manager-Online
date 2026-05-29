<?php

return [
    'received' => [
        'subject' => 'Inschrijving ontvangen – :tournament',
        'greeting' => 'Hallo :name,',
        'body' => 'We hebben je inschrijving voor het toernooi ":tournament" ontvangen.',
        'confirm_button' => 'Inschrijving bevestigen',
        'confirm_hint' => 'Klik op de knop om je inschrijving te bevestigen.',
        'expires' => 'De link is 48 uur geldig.',
    ],
    'confirmed' => [
        'subject' => 'Inschrijving bevestigd – :tournament',
        'greeting' => 'Hallo :name,',
        'body' => 'Je inschrijving voor het toernooi ":tournament" op :date in :location is bevestigd.',
        'cancel_button' => 'Inschrijving annuleren',
        'footer' => 'We kijken ernaar uit je te zien!',
    ],
    'waitlist_promoted' => [
        'subject' => 'Je doet mee – :tournament',
        'greeting' => 'Hallo :name,',
        'body' => 'Er is een plek vrijgekomen! Je bent van de wachtlijst af en bent nu bevestigd voor ":tournament".',
    ],
];
