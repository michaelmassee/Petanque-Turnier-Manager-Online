<?php

return [
    'provider_name' => env('LEGAL_PROVIDER_NAME', env('APP_NAME', 'Pétanque Turnier Manager Online')),
    'provider_street' => env('LEGAL_PROVIDER_STREET', ''),
    'provider_postal_code' => env('LEGAL_PROVIDER_POSTAL_CODE', ''),
    'provider_city' => env('LEGAL_PROVIDER_CITY', ''),
    'provider_country' => env('LEGAL_PROVIDER_COUNTRY', 'Deutschland'),
    'provider_email' => env('LEGAL_PROVIDER_EMAIL', env('MAIL_FROM_ADDRESS', '')),
    'provider_phone' => env('LEGAL_PROVIDER_PHONE', ''),
    'responsible_person' => env('LEGAL_RESPONSIBLE_PERSON', 'Michael Massee'),
    'responsible_street' => env('LEGAL_RESPONSIBLE_STREET', 'An der Ziegelei 21'),
    'responsible_postal_code' => env('LEGAL_RESPONSIBLE_POSTAL_CODE', '35440'),
    'responsible_city' => env('LEGAL_RESPONSIBLE_CITY', 'Linden'),
    'responsible_country' => env('LEGAL_RESPONSIBLE_COUNTRY', env('LEGAL_PROVIDER_COUNTRY', 'Deutschland')),
    'privacy_email' => env('LEGAL_PRIVACY_EMAIL', env('LEGAL_PROVIDER_EMAIL', env('MAIL_FROM_ADDRESS', ''))),
    'supervisory_authority' => env('LEGAL_SUPERVISORY_AUTHORITY', 'Zuständige Datenschutzaufsichtsbehörde'),
    'retention_registration_months' => (int) env('LEGAL_RETENTION_REGISTRATION_MONTHS', 24),
];
