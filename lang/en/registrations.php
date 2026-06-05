<?php

return [
    'title' => 'Registration',
    'subtitle' => 'Registration for :tournament',
    'submit' => 'Register Now',
    'cancel_link' => 'Cancel Registration',

    'fields' => [
        'first_name' => 'First Name',
        'last_name' => 'Last Name',
        'email' => 'Email Address',
        'club' => 'Club',
        'license_nr' => 'License Number',
        'team_name' => 'Team Name',
        'partner' => 'Partner',
        'partner2' => 'Third Player',
        'status' => 'Status',
    ],

    'status' => [
        'pending' => 'Pending',
        'confirmed' => 'Confirmed',
        'cancelled' => 'Cancelled',
        'waitlist' => 'Waitlist',
    ],

    'success' => [
        'pending' => 'Your registration has been received. The tournament manager will confirm it separately.',
        'confirmed' => 'Your registration has been confirmed successfully.',
        'confirmed_direct' => 'Your registration has been accepted successfully.',
        'cancelled' => 'Your registration has been cancelled.',
    ],

    'errors' => [
        'duplicate_email' => 'This email address is already registered for this tournament.',
        'invalid_token' => 'Invalid or expired link.',
        'already_confirmed' => 'This registration has already been confirmed.',
        'already_cancelled' => 'This registration has already been cancelled.',
    ],

    'waitlist_notice' => 'The tournament is fully booked. You have been added to the waitlist.',
    'privacy_notice' => 'The entered data is processed to handle the tournament registration and shared with authorized tournament managers. Details are available in the <a class="text-green-700 hover:underline" href=":privacy_url">privacy policy</a>.',
    'confirm_cancel' => 'Do you really want to cancel your registration?',
    'yes_cancel' => 'Yes, cancel',
    'no_back' => 'Back',
];
