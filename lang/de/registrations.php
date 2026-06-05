<?php

return [
    'title' => 'Anmeldung',
    'subtitle' => 'Anmeldung für :tournament',
    'submit' => 'Jetzt anmelden',
    'cancel_link' => 'Anmeldung stornieren',

    'fields' => [
        'first_name' => 'Vorname',
        'last_name' => 'Nachname',
        'email' => 'E-Mail-Adresse',
        'club' => 'Verein',
        'license_nr' => 'Lizenznummer',
        'team_name' => 'Teamname',
        'partner' => 'Partner',
        'partner2' => 'Dritter Spieler',
        'status' => 'Status',
    ],

    'status' => [
        'pending' => 'Ausstehend',
        'confirmed' => 'Bestätigt',
        'cancelled' => 'Storniert',
        'waitlist' => 'Warteliste',
    ],

    'success' => [
        'pending' => 'Deine Anmeldung wurde erhalten. Der Turnierverwalter bestätigt sie separat.',
        'confirmed' => 'Deine Anmeldung wurde erfolgreich bestätigt.',
        'confirmed_direct' => 'Deine Anmeldung wurde erfolgreich übernommen.',
        'cancelled' => 'Deine Anmeldung wurde storniert.',
    ],

    'errors' => [
        'duplicate_email' => 'Diese E-Mail-Adresse ist für dieses Turnier bereits angemeldet.',
        'invalid_token' => 'Ungültiger oder abgelaufener Link.',
        'already_confirmed' => 'Diese Anmeldung wurde bereits bestätigt.',
        'already_cancelled' => 'Diese Anmeldung wurde bereits storniert.',
    ],

    'waitlist_notice' => 'Das Turnier ist ausgebucht. Du wurdest auf die Warteliste gesetzt.',
    'privacy_notice' => 'Die eingegebenen Daten werden zur Durchführung der Turnieranmeldung verarbeitet und an berechtigte Turniermanager übermittelt. Details stehen in der <a class="text-green-700 hover:underline" href=":privacy_url">Datenschutzerklärung</a>.',
    'confirm_cancel' => 'Möchtest du deine Anmeldung wirklich stornieren?',
    'yes_cancel' => 'Ja, stornieren',
    'no_back' => 'Zurück',
];
