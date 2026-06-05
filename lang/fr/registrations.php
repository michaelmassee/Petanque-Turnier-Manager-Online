<?php

return [
    'title' => 'Inscription',
    'subtitle' => 'Inscription pour :tournament',
    'submit' => 'S\'inscrire',
    'cancel_link' => 'Annuler l\'inscription',

    'fields' => [
        'first_name' => 'Prénom',
        'last_name' => 'Nom',
        'email' => 'Adresse e-mail',
        'club' => 'Club',
        'license_nr' => 'Numéro de licence',
        'team_name' => 'Nom d\'équipe',
        'partner' => 'Partenaire',
        'partner2' => 'Troisième joueur',
        'status' => 'Statut',
    ],

    'status' => [
        'pending' => 'En attente',
        'confirmed' => 'Confirmée',
        'cancelled' => 'Annulée',
        'waitlist' => 'Liste d\'attente',
    ],

    'success' => [
        'pending' => 'Votre inscription a été reçue. Le gestionnaire du tournoi la confirmera séparément.',
        'confirmed' => 'Votre inscription a été confirmée avec succès.',
        'confirmed_direct' => 'Votre inscription a été acceptée avec succès.',
        'cancelled' => 'Votre inscription a été annulée.',
    ],

    'errors' => [
        'duplicate_email' => 'Cette adresse e-mail est déjà inscrite pour ce tournoi.',
        'invalid_token' => 'Lien invalide ou expiré.',
        'already_confirmed' => 'Cette inscription a déjà été confirmée.',
        'already_cancelled' => 'Cette inscription a déjà été annulée.',
    ],

    'waitlist_notice' => 'Le tournoi est complet. Vous avez été ajouté à la liste d\'attente.',
    'privacy_notice' => 'Les données saisies sont traitées pour gérer l’inscription au tournoi et transmises aux gestionnaires autorisés. Voir la <a class="text-green-700 hover:underline" href=":privacy_url">politique de confidentialité</a>.',
    'confirm_cancel' => 'Voulez-vous vraiment annuler votre inscription ?',
    'yes_cancel' => 'Oui, annuler',
    'no_back' => 'Retour',
];
