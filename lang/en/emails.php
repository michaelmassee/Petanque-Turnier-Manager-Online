<?php

return [
    'received' => [
        'subject' => 'Registration received – :tournament',
        'greeting' => 'Hello :name,',
        'body' => 'We have received your registration for the tournament ":tournament".',
        'confirm_button' => 'Confirm Registration',
        'confirm_hint' => 'Please click the button to confirm your registration.',
        'expires' => 'The link is valid for 48 hours.',
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
