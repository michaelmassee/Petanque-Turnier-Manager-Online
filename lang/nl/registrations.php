<?php

return [
    'title' => 'Inschrijving',
    'subtitle' => 'Inschrijving voor :tournament',
    'submit' => 'Nu inschrijven',
    'cancel_link' => 'Inschrijving annuleren',
    'confirm_link' => 'Inschrijving bevestigen',

    'fields' => [
        'first_name' => 'Voornaam',
        'last_name' => 'Achternaam',
        'email' => 'E-mailadres',
        'club' => 'Club (optioneel)',
        'license_nr' => 'Licentienummer (optioneel)',
        'team_name' => 'Teamnaam (optioneel)',
        'partner' => 'Partner',
        'partner2' => 'Derde speler',
    ],

    'status' => [
        'pending' => 'In behandeling',
        'confirmed' => 'Bevestigd',
        'cancelled' => 'Geannuleerd',
        'waitlist' => 'Wachtlijst',
    ],

    'success' => [
        'pending' => 'Je inschrijving is ontvangen. Bevestig deze via de link in de e-mail.',
        'confirmed' => 'Je inschrijving is succesvol bevestigd!',
        'cancelled' => 'Je inschrijving is geannuleerd.',
    ],

    'errors' => [
        'duplicate_email' => 'Dit e-mailadres is al ingeschreven voor dit toernooi.',
        'invalid_token' => 'Ongeldige of verlopen link.',
        'already_confirmed' => 'Deze inschrijving is al bevestigd.',
        'already_cancelled' => 'Deze inschrijving is al geannuleerd.',
    ],

    'waitlist_notice' => 'Het toernooi is volgeboekt. Je bent op de wachtlijst geplaatst.',
    'confirm_cancel' => 'Wil je je inschrijving echt annuleren?',
    'yes_cancel' => 'Ja, annuleren',
    'no_back' => 'Terug',
];
