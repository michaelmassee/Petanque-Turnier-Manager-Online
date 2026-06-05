<?php

return [
    'title' => 'Inschrijving',
    'subtitle' => 'Inschrijving voor :tournament',
    'submit' => 'Nu inschrijven',
    'cancel_link' => 'Inschrijving annuleren',

    'fields' => [
        'first_name' => 'Voornaam',
        'last_name' => 'Achternaam',
        'email' => 'E-mailadres',
        'club' => 'Club',
        'license_nr' => 'Licentienummer',
        'team_name' => 'Teamnaam',
        'partner' => 'Partner',
        'partner2' => 'Derde speler',
        'status' => 'Status',
    ],

    'status' => [
        'pending' => 'In behandeling',
        'confirmed' => 'Bevestigd',
        'cancelled' => 'Geannuleerd',
        'waitlist' => 'Wachtlijst',
    ],

    'success' => [
        'pending' => 'Je inschrijving is ontvangen. De toernooibeheerder bevestigt deze apart.',
        'confirmed' => 'Je inschrijving is succesvol bevestigd.',
        'confirmed_direct' => 'Je inschrijving is succesvol verwerkt.',
        'cancelled' => 'Je inschrijving is geannuleerd.',
    ],

    'errors' => [
        'duplicate_email' => 'Dit e-mailadres is al ingeschreven voor dit toernooi.',
        'invalid_token' => 'Ongeldige of verlopen link.',
        'already_confirmed' => 'Deze inschrijving is al bevestigd.',
        'already_cancelled' => 'Deze inschrijving is al geannuleerd.',
    ],

    'waitlist_notice' => 'Het toernooi is volgeboekt. Je bent op de wachtlijst geplaatst.',
    'privacy_notice' => 'De ingevoerde gegevens worden verwerkt voor de toernooi-inschrijving en gedeeld met bevoegde toernooibeheerders. Details staan in het <a class="text-green-700 hover:underline" href=":privacy_url">privacybeleid</a>.',
    'confirm_cancel' => 'Wil je je inschrijving echt annuleren?',
    'yes_cancel' => 'Ja, annuleren',
    'no_back' => 'Terug',
];
