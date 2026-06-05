<?php

return [
    'received' => [
        'subject' => 'Inschrijving ontvangen – :tournament',
        'greeting' => 'Hallo :name,',
        'body' => 'We hebben je inschrijving voor het toernooi ":tournament" ontvangen.',
        'manual_confirmation' => 'De toernooibeheerder beoordeelt je inschrijving en bevestigt die apart.',
        'waitlist_hint' => 'Je staat momenteel op de wachtlijst. Als er een plek vrijkomt, ontvang je nog een e-mail.',
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
