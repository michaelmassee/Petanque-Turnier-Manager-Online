<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Shared hosting note: some providers make tempnam() fall back to the system
// temp dir for files below the webspace path. Laravel's facade/view caches use
// tempnam(), so prepare a stable runtime area in /tmp before bootstrapping.
$runtimeBase = rtrim(sys_get_temp_dir(), '/\\') . '/ptmonline-' . substr(sha1(dirname(__DIR__)), 0, 12);
$runtimePaths = [
    'LARAVEL_STORAGE_PATH' => $runtimeBase . '/storage',
    'APP_SERVICES_CACHE' => $runtimeBase . '/cache/services.php',
    'APP_PACKAGES_CACHE' => $runtimeBase . '/cache/packages.php',
    'APP_CONFIG_CACHE' => $runtimeBase . '/cache/config.php',
    'APP_ROUTES_CACHE' => $runtimeBase . '/cache/routes-v7.php',
    'APP_EVENTS_CACHE' => $runtimeBase . '/cache/events.php',
    'VIEW_COMPILED_PATH' => $runtimeBase . '/views',
];

foreach ([
    $runtimeBase . '/storage/app',
    $runtimeBase . '/storage/framework/cache/data',
    $runtimeBase . '/storage/framework/sessions',
    $runtimeBase . '/storage/framework/views',
    $runtimeBase . '/storage/logs',
    $runtimeBase . '/cache',
    $runtimeBase . '/views',
] as $runtimeDirectory) {
    if (! is_dir($runtimeDirectory)) {
        @mkdir($runtimeDirectory, 0777, true);
    }
}

foreach ($runtimePaths as $key => $value) {
    $_ENV[$key] = $value;
    $_SERVER[$key] = $value;
    @putenv($key . '=' . $value);
}

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
