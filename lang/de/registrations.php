<?php

return [
    'title' => 'Anmeldung',
    'subtitle' => 'Anmeldung für :tournament',
    'submit' => 'Jetzt anmelden',
    'cancel_link' => 'Anmeldung stornieren',
    'confirm_link' => 'Anmeldung bestätigen',

    'fields' => [
        'first_name' => 'Vorname',
        'last_name' => 'Nachname',
        'email' => 'E-Mail-Adresse',
        'club' => 'Verein (optional)',
        'license_nr' => 'Lizenznummer (optional)',
        'team_name' => 'Teamname (optional)',
        'partner' => 'Partner',
        'partner2' => 'Dritter Spieler',
    ],

    'status' => [
        'pending' => 'Ausstehend',
        'confirmed' => 'Bestätigt',
        'cancelled' => 'Storniert',
        'waitlist' => 'Warteliste',
    ],

    'success' => [
        'pending' => 'Deine Anmeldung wurde erhalten. Bitte bestätige sie über den Link in der E-Mail.',
        'confirmed' => 'Deine Anmeldung wurde erfolgreich bestätigt!',
        'cancelled' => 'Deine Anmeldung wurde storniert.',
    ],

    'errors' => [
        'duplicate_email' => 'Diese E-Mail-Adresse ist für dieses Turnier bereits angemeldet.',
        'invalid_token' => 'Ungültiger oder abgelaufener Link.',
        'already_confirmed' => 'Diese Anmeldung wurde bereits bestätigt.',
        'already_cancelled' => 'Diese Anmeldung wurde bereits storniert.',
    ],

    'waitlist_notice' => 'Das Turnier ist ausgebucht. Du wurdest auf die Warteliste gesetzt.',
    'confirm_cancel' => 'Möchtest du deine Anmeldung wirklich stornieren?',
    'yes_cancel' => 'Ja, stornieren',
    'no_back' => 'Zurück',
];
