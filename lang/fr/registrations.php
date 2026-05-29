<?php

return [
    'title' => 'Inscription',
    'subtitle' => 'Inscription pour :tournament',
    'submit' => 'S\'inscrire',
    'cancel_link' => 'Annuler l\'inscription',
    'confirm_link' => 'Confirmer l\'inscription',

    'fields' => [
        'first_name' => 'Prénom',
        'last_name' => 'Nom',
        'email' => 'Adresse e-mail',
        'club' => 'Club (optionnel)',
        'license_nr' => 'Numéro de licence (optionnel)',
        'team_name' => 'Nom d\'équipe (optionnel)',
        'partner' => 'Partenaire',
        'partner2' => 'Troisième joueur',
    ],

    'status' => [
        'pending' => 'En attente',
        'confirmed' => 'Confirmée',
        'cancelled' => 'Annulée',
        'waitlist' => 'Liste d\'attente',
    ],

    'success' => [
        'pending' => 'Votre inscription a été reçue. Veuillez la confirmer via le lien dans l\'e-mail.',
        'confirmed' => 'Votre inscription a été confirmée avec succès !',
        'cancelled' => 'Votre inscription a été annulée.',
    ],

    'errors' => [
        'duplicate_email' => 'Cette adresse e-mail est déjà inscrite pour ce tournoi.',
        'invalid_token' => 'Lien invalide ou expiré.',
        'already_confirmed' => 'Cette inscription a déjà été confirmée.',
        'already_cancelled' => 'Cette inscription a déjà été annulée.',
    ],

    'waitlist_notice' => 'Le tournoi est complet. Vous avez été ajouté à la liste d\'attente.',
    'confirm_cancel' => 'Voulez-vous vraiment annuler votre inscription ?',
    'yes_cancel' => 'Oui, annuler',
    'no_back' => 'Retour',
];
