<?php

return [
    'received' => [
        'subject' => 'Registration received – :tournament',
        'greeting' => 'Hello :name,',
        'body' => 'We have received your registration for the tournament ":tournament".',
        'manual_confirmation' => 'The tournament manager will review your registration and confirm it separately.',
        'waitlist_hint' => 'You are currently on the waitlist. If a spot opens up, you will receive another email.',
    ],
    'confirmed' => [
        'subject' => 'Registration confirmed – :tournament',
        'greeting' => 'Hello :name,',
        'body' => 'Your registration for the tournament ":tournament" on :date in :location has been confirmed.',
        'cancel_button' => 'Cancel Registration',
        'footer' => 'We look forward to seeing you!',
    ],
    'waitlist_promoted' => [
        'subject' => 'You\'re in – :tournament',
        'greeting' => 'Hello :name,',
        'body' => 'A spot opened up! You have moved from the waitlist and are now confirmed for ":tournament".',
    ],
];
