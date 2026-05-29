<?php

return [
    'title' => 'Registration',
    'subtitle' => 'Registration for :tournament',
    'submit' => 'Register Now',
    'cancel_link' => 'Cancel Registration',
    'confirm_link' => 'Confirm Registration',

    'fields' => [
        'first_name' => 'First Name',
        'last_name' => 'Last Name',
        'email' => 'Email Address',
        'club' => 'Club (optional)',
        'license_nr' => 'License Number (optional)',
        'team_name' => 'Team Name (optional)',
        'partner' => 'Partner',
        'partner2' => 'Third Player',
    ],

    'status' => [
        'pending' => 'Pending',
        'confirmed' => 'Confirmed',
        'cancelled' => 'Cancelled',
        'waitlist' => 'Waitlist',
    ],

    'success' => [
        'pending' => 'Your registration has been received. Please confirm it via the link in the email.',
        'confirmed' => 'Your registration has been successfully confirmed!',
        'cancelled' => 'Your registration has been cancelled.',
    ],

    'errors' => [
        'duplicate_email' => 'This email address is already registered for this tournament.',
        'invalid_token' => 'Invalid or expired link.',
        'already_confirmed' => 'This registration has already been confirmed.',
        'already_cancelled' => 'This registration has already been cancelled.',
    ],

    'waitlist_notice' => 'The tournament is fully booked. You have been added to the waitlist.',
    'confirm_cancel' => 'Do you really want to cancel your registration?',
    'yes_cancel' => 'Yes, cancel',
    'no_back' => 'Back',
];
