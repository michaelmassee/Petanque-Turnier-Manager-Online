<?php

return [
    'received' => [
        'subject' => 'Inscription reçue – :tournament',
        'greeting' => 'Bonjour :name,',
        'body' => 'Nous avons bien reçu votre inscription pour le tournoi « :tournament ».',
        'manual_confirmation' => 'Le gestionnaire du tournoi examinera votre inscription et la confirmera séparément.',
        'waitlist_hint' => 'Vous êtes actuellement sur la liste d\'attente. Si une place se libère, vous recevrez un autre e-mail.',
    ],
    'confirmed' => [
        'subject' => 'Inscription confirmée – :tournament',
        'greeting' => 'Bonjour :name,',
        'body' => 'Votre inscription pour le tournoi « :tournament » le :date à :location a été confirmée.',
        'cancel_button' => 'Annuler l\'inscription',
        'footer' => 'Nous vous attendons avec impatience !',
    ],
    'waitlist_promoted' => [
        'subject' => 'Vous êtes inscrit – :tournament',
        'greeting' => 'Bonjour :name,',
        'body' => 'Une place s\'est libérée ! Vous avez quitté la liste d\'attente et êtes maintenant confirmé pour « :tournament ».',
    ],
];
