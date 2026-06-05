<?php
/**
 * Petanque Turnier Manager – Web-Installer
 *
 * Dieses Skript per FTP hochladen, im Browser aufrufen, nach erfolgreicher
 * Installation sofort löschen (oder Zugriff per .htaccess sperren).
 *
 * URL: https://deine-domain.de/install.php
 */

// ─── Installer-Passwort ───────────────────────────────────────────────────────
// Wird beim Gradle-Deploy aus gradle.properties eingesetzt. Nach der Installation Datei löschen!
define('INSTALL_PASSWORD', '@installerPassword@');

// ─── Pfade ────────────────────────────────────────────────────────────────────
define('BASE_DIR',  dirname(__DIR__));
define('ENV_FILE',  BASE_DIR . '/.env');
define('ARTISAN',   BASE_DIR . '/artisan');
define('AUTOLOAD_FILE', BASE_DIR . '/vendor/autoload.php');
define('VENDOR_HEALTH_FILE', BASE_DIR . '/vendor/laravel/framework/src/Illuminate/Reflection/helpers.php');
define('BOOTSTRAP_CACHE_DIR', BASE_DIR . '/bootstrap/cache');
define('INSTALL_CACHE_DIR', BASE_DIR . '/storage/framework/cache');
define('PROGRESS_DIR', BASE_DIR . '/storage/framework/cache/installer-progress');
define('INSTALLER_LOG', BASE_DIR . '/storage/logs/installer.log');

define('INSTALL_TEMP_BASE', rtrim(sys_get_temp_dir(), '/\\') . '/ptmonline-' . substr(sha1(BASE_DIR), 0, 12));
define('INSTALL_TEMP_STORAGE_DIR', INSTALL_TEMP_BASE . '/storage');
define('INSTALL_TEMP_CACHE_DIR', INSTALL_TEMP_BASE . '/cache');
define('INSTALL_TEMP_VIEW_DIR', INSTALL_TEMP_BASE . '/views');

// ─── Feste Installationswerte ─────────────────────────────────────────────────
define('INSTALL_APP_NAME', 'Pétanque Turnier Manager Online');
define('INSTALL_APP_ENV', 'production');
define('INSTALL_APP_DEBUG', 'false');
define('INSTALL_LOG_LEVEL', 'error');
define('INSTALL_COMPOSER_BIN', 'composer');
define('INSTALL_PHP_BIN', 'php');

// ─── Formular-Defaults aus gradle.properties ─────────────────────────────────
define('DEFAULT_APP_URL', '@installerAppUrl@');
define('DEFAULT_DB_CONNECTION', '@installerDbConnection@');
define('DEFAULT_DB_HOST', '@installerDbHost@');
define('DEFAULT_DB_PORT', '@installerDbPort@');
define('DEFAULT_DB_DATABASE', '@installerDbDatabase@');
define('DEFAULT_DB_USERNAME', '@installerDbUsername@');
define('DEFAULT_DB_PASSWORD', '@installerDbPassword@');
define('DEFAULT_ADMIN_NAME', '@installerAdminName@');
define('DEFAULT_ADMIN_EMAIL', '@installerAdminEmail@');
define('DEFAULT_ADMIN_PASSWORD', '@installerAdminPassword@');
define('DEFAULT_MAIL_MAILER', '@installerMailMailer@');
define('DEFAULT_MAIL_FROM_ADDRESS', '@installerMailFromAddress@');
define('DEFAULT_MAIL_HOST', '@installerMailHost@');
define('DEFAULT_MAIL_PORT', '@installerMailPort@');
define('DEFAULT_MAIL_USERNAME', '@installerMailUsername@');
define('DEFAULT_MAIL_PASSWORD', '@installerMailPassword@');

if (isset($_GET['progress'])) {
    $progressId = (string) $_GET['progress'];
    $progressFile = PROGRESS_DIR . '/' . $progressId . '.json';

    header('Content-Type: application/json; charset=utf-8');

    if (preg_match('/^[a-f0-9]{32}$/', $progressId) !== 1 || !is_file($progressFile)) {
        echo json_encode(['label' => 'Warte auf Start ...', 'percent' => 0, 'status' => 'idle'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    readfile($progressFile);
    exit;
}

session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Strict',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
]);
session_start();

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function isAuthenticated(): bool {
    return ($_SESSION['installer_auth'] ?? false) === true;
}

function redirectToInstaller(): void {
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
    exit;
}

function csrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function verifyCsrf(): bool {
    return hash_equals($_SESSION['csrf_token'] ?? '', $_POST['csrf_token'] ?? '');
}

function installerReady(): bool {
    return INSTALL_PASSWORD !== '' && INSTALL_PASSWORD !== ('@' . 'installerPassword' . '@');
}

function runCommand(string $cmd, int $timeoutSeconds = 45): array {
    installerLog('START ' . $cmd);

    if (!function_exists('proc_open')) {
        return ['output' => 'proc_open ist auf dem Server deaktiviert; Artisan-Befehl kann nicht mit Timeout ausgeführt werden.', 'ok' => false];
    }

    $descriptors = [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open($cmd, $descriptors, $pipes, BASE_DIR);

    if (!is_resource($process)) {
        return ['output' => 'Prozess konnte nicht gestartet werden.', 'ok' => false];
    }

    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $output = '';
    $started = time();

    $exitCode = 1;

    do {
        $output .= stream_get_contents($pipes[1]);
        $output .= stream_get_contents($pipes[2]);
        $status = proc_get_status($process);

        if (!$status['running']) {
            $exitCode = $status['exitcode'];
            break;
        }

        if (time() - $started >= $timeoutSeconds) {
            proc_terminate($process);
            foreach ($pipes as $pipe) {
                fclose($pipe);
            }
            proc_close($process);
            installerLog('TIMEOUT after ' . $timeoutSeconds . 's' . ($output !== '' ? "\n" . $output : ''));
            return ['output' => "Befehl nach {$timeoutSeconds}s abgebrochen:\n{$cmd}\n\n{$output}", 'ok' => false];
        }

        usleep(100000);
    } while (true);

    foreach ($pipes as $pipe) {
        $output .= stream_get_contents($pipe);
        fclose($pipe);
    }

    proc_close($process);
    installerLog('END exit=' . $exitCode . ($output !== '' ? "\n" . $output : ''));
    return ['output' => trim($output), 'ok' => $exitCode === 0];
}

function installerLog(string $message): void {
    $dir = dirname(INSTALLER_LOG);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    @file_put_contents(INSTALLER_LOG, '[' . date('Y-m-d H:i:s') . '] ' . $message . "\n", FILE_APPEND);
}

function jsonResponse(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function validProgressId(string $id): bool {
    return preg_match('/^[a-f0-9]{32}$/', $id) === 1;
}

function progressPath(string $id): string {
    return PROGRESS_DIR . '/' . $id . '.json';
}

function writeProgress(string $id, string $label, int $percent, string $status = 'running'): void {
    installerLog("PROGRESS {$status} {$percent}% {$label}");

    if (!validProgressId($id)) {
        return;
    }

    if (!is_dir(PROGRESS_DIR)) {
        @mkdir(PROGRESS_DIR, 0775, true);
    }

    @file_put_contents(progressPath($id), json_encode([
        'label' => $label,
        'percent' => max(0, min(100, $percent)),
        'status' => $status,
        'time' => time(),
    ], JSON_UNESCAPED_UNICODE));
}

function readProgress(string $id): array {
    if (!validProgressId($id) || !file_exists(progressPath($id))) {
        return ['label' => 'Warte auf Start …', 'percent' => 0, 'status' => 'idle'];
    }

    $data = json_decode((string) file_get_contents(progressPath($id)), true);
    return is_array($data) ? $data : ['label' => 'Fortschritt konnte nicht gelesen werden.', 'percent' => 0, 'status' => 'error'];
}

function prepareVendor(): array {
    if (vendorReady()) {
        return ['label' => 'Composer install übersprungen', 'ok' => true, 'output' => 'vendor/ ist vollständig vorhanden.'];
    }

    $archives = vendorArchives();
    $missing = array_filter($archives, fn ($archive) => !file_exists($archive));

    if (!$missing) {
        $messages = [];
        foreach ($archives as $archive) {
            $result = extractArchive($archive);
            $messages[] = basename($archive) . ': ' . ($result['ok'] ? 'entpackt' : 'fehlgeschlagen');

            if (!$result['ok']) {
                return ['label' => basename($archive) . ' entpacken', 'ok' => false, 'output' => implode("\n", $messages) . "\n" . $result['output']];
            }
        }

        if (vendorReady()) {
            return ['label' => 'Vendor-Archive entpackt', 'ok' => true, 'output' => implode("\n", $messages) . "\nVendor-Prüfung erfolgreich."];
        }

        return ['label' => 'Vendor-Archive entpacken', 'ok' => false, 'output' => implode("\n", $messages) . "\nvendor/ ist nach dem Entpacken weiterhin unvollständig. Fehlende Prüffile: " . VENDOR_HEALTH_FILE];
    }

    $res = runCommand('cd ' . escapeshellarg(BASE_DIR) . ' && ' . escapeshellarg(INSTALL_COMPOSER_BIN) . ' install --no-dev --optimize-autoloader --no-interaction');
    return ['label' => 'Composer install', 'ok' => $res['ok'], 'output' => $res['output']];
}

function vendorArchives(): array {
    return [
        BASE_DIR . '/vendor-01-composer.zip',
        BASE_DIR . '/vendor-02-laravel.zip',
        BASE_DIR . '/vendor-03-livewire.zip',
        BASE_DIR . '/vendor-04-other.zip',
    ];
}

function vendorReady(): bool {
    return file_exists(AUTOLOAD_FILE) && file_exists(VENDOR_HEALTH_FILE);
}

function extractArchive(string $archive): array {
    if (class_exists('ZipArchive')) {
        $zip = new ZipArchive();
        $opened = $zip->open($archive);
        if ($opened !== true) {
            return ['ok' => false, 'output' => basename($archive) . ' konnte nicht geöffnet werden. Fehlercode: ' . $opened];
        }

        $ok = $zip->extractTo(BASE_DIR);
        $zip->close();
        return ['ok' => $ok, 'output' => $ok ? '' : basename($archive) . ' konnte nicht vollständig entpackt werden.'];
    }

    return runCommand('unzip -oq ' . escapeshellarg($archive) . ' -d ' . escapeshellarg(BASE_DIR));
}

function envQuote(string $value): string {
    $escaped = strtr($value, [
        "\\" => "\\\\",
        "\"" => "\\\"",
        "\r" => "\\r",
        "\n" => "\\n",
    ]);

    return '"' . $escaped . '"';
}

function choice(array $values, string $key, array $allowed, string $default): string {
    $value = $values[$key] ?? $default;
    return in_array($value, $allowed, true) ? $value : $default;
}

function cleanPort(array $values, string $key, string $default): string {
    $value = $values[$key] ?? $default;
    return preg_match('/^\d{1,5}$/', $value) ? $value : $default;
}

function dbConnection(array $values): string {
    return choice($values, 'DB_CONNECTION', ['mysql', 'sqlite', 'pgsql'], 'mysql');
}

function sqliteDatabasePath(array $values): string {
    $database = trim((string) ($values['DB_DATABASE'] ?? ''));

    if ($database === '') {
        return BASE_DIR . '/database/database.sqlite';
    }

    if ($database[0] === '/') {
        return $database;
    }

    return BASE_DIR . '/' . ltrim($database, '/');
}

function normalizedDbDatabase(array $values): string {
    if (dbConnection($values) === 'sqlite') {
        return sqliteDatabasePath($values);
    }

    return $values['DB_DATABASE'] ?? '';
}

function selected(string $actual, string $expected): string {
    return $actual === $expected ? ' selected' : '';
}

function inputValue(string $value, string $fallback = ''): string {
    return htmlspecialchars($value !== '' ? $value : $fallback);
}

function validateInstallValues(array $values): array {
    $errors = [];
    $connection = dbConnection($values);

    $requiredFields = $connection === 'sqlite'
        ? ['APP_URL', 'ADMIN_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']
        : ['APP_URL', 'DB_DATABASE', 'DB_USERNAME', 'ADMIN_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];

    foreach ($requiredFields as $field) {
        if (trim($values[$field] ?? '') === '') {
            $errors[] = "{$field} darf nicht leer sein.";
        }
    }

    if (!filter_var($values['APP_URL'] ?? '', FILTER_VALIDATE_URL)) {
        $errors[] = 'APP_URL muss eine gültige URL sein.';
    }

    if (!filter_var($values['ADMIN_EMAIL'] ?? '', FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'ADMIN_EMAIL muss eine gültige E-Mail-Adresse sein.';
    }

    if (strlen((string) ($values['ADMIN_PASSWORD'] ?? '')) < 8) {
        $errors[] = 'ADMIN_PASSWORD muss mindestens 8 Zeichen lang sein.';
    }

    if ($connection !== 'sqlite' && !preg_match('/^\d{1,5}$/', $values['DB_PORT'] ?? '')) {
        $errors[] = 'DB_PORT muss numerisch sein.';
    }

    if (freshInstallRequested($values) && ($values['FRESH_INSTALL_CONFIRM'] ?? '') !== 'TABELLEN LOESCHEN') {
        $errors[] = 'Für Neuinstallation / Tabellen leeren muss die Bestätigung exakt "TABELLEN LOESCHEN" lauten.';
    }

    return $errors;
}

function freshInstallRequested(array $values): bool {
    return isset($values['FRESH_INSTALL']) && (string) $values['FRESH_INSTALL'] === '1';
}

function writeEnv(array $values): void {
    $lines = [];
    $lines[] = '# Generiert von install.php – ' . date('Y-m-d H:i:s');
    $lines[] = '';
    $lines[] = 'APP_NAME=' . envQuote(INSTALL_APP_NAME);
    $lines[] = 'APP_ENV=' . INSTALL_APP_ENV;
    $lines[] = 'APP_KEY=';
    $lines[] = 'APP_DEBUG=' . INSTALL_APP_DEBUG;
    $lines[] = 'APP_URL=' . envQuote($values['APP_URL'] ?? 'http://localhost');
    $lines[] = '';
    $lines[] = 'APP_LOCALE=de';
    $lines[] = 'APP_FALLBACK_LOCALE=de';
    $lines[] = 'APP_FAKER_LOCALE=de_DE';
    $lines[] = '';
    $lines[] = 'APP_MAINTENANCE_DRIVER=file';
    $lines[] = '';
    $lines[] = 'BCRYPT_ROUNDS=12';
    $lines[] = '';
    $lines[] = 'LOG_CHANNEL=stack';
    $lines[] = 'LOG_STACK=single';
    $lines[] = 'LOG_DEPRECATIONS_CHANNEL=null';
    $lines[] = 'LOG_LEVEL=' . INSTALL_LOG_LEVEL;
    $lines[] = '';
    $lines[] = 'DB_CONNECTION=' . dbConnection($values);
    $lines[] = 'DB_HOST=' . envQuote($values['DB_HOST'] ?? '127.0.0.1');
    $lines[] = 'DB_PORT=' . cleanPort($values, 'DB_PORT', '3306');
    $lines[] = 'DB_DATABASE=' . envQuote(normalizedDbDatabase($values));
    $lines[] = 'DB_USERNAME=' . envQuote($values['DB_USERNAME'] ?? '');
    $lines[] = 'DB_PASSWORD=' . envQuote($values['DB_PASSWORD'] ?? '');
    $lines[] = '';
    $lines[] = 'SESSION_DRIVER=database';
    $lines[] = 'SESSION_LIFETIME=120';
    $lines[] = 'SESSION_ENCRYPT=false';
    $lines[] = 'SESSION_PATH=/';
    $lines[] = 'SESSION_DOMAIN=null';
    $lines[] = '';
    $lines[] = 'BROADCAST_CONNECTION=log';
    $lines[] = 'FILESYSTEM_DISK=local';
    $lines[] = 'QUEUE_CONNECTION=database';
    $lines[] = '';
    $lines[] = 'CACHE_STORE=database';
    $lines[] = '';
    $lines[] = 'MAIL_MAILER=' . choice($values, 'MAIL_MAILER', ['log', 'smtp', 'sendmail'], 'log');
    $lines[] = 'MAIL_SCHEME=null';
    $lines[] = 'MAIL_HOST=' . envQuote($values['MAIL_HOST'] ?? '127.0.0.1');
    $lines[] = 'MAIL_PORT=' . cleanPort($values, 'MAIL_PORT', '2525');
    $lines[] = 'MAIL_USERNAME=' . envQuote($values['MAIL_USERNAME'] ?? 'null');
    $lines[] = 'MAIL_PASSWORD=' . envQuote($values['MAIL_PASSWORD'] ?? 'null');
    $lines[] = 'MAIL_FROM_ADDRESS=' . envQuote($values['MAIL_FROM_ADDRESS'] ?? 'hello@example.com');
    $lines[] = 'MAIL_FROM_NAME="${APP_NAME}"';
    $lines[] = '';
    $lines[] = 'VITE_APP_NAME="${APP_NAME}"';

    file_put_contents(ENV_FILE, implode("\n", $lines) . "\n");
}

function applyInstallerRuntimePaths(): void {
    $paths = [
        'LARAVEL_STORAGE_PATH' => INSTALL_TEMP_STORAGE_DIR,
        'APP_SERVICES_CACHE' => INSTALL_TEMP_CACHE_DIR . '/services.php',
        'APP_PACKAGES_CACHE' => INSTALL_TEMP_CACHE_DIR . '/packages.php',
        'APP_CONFIG_CACHE' => INSTALL_TEMP_CACHE_DIR . '/config.php',
        'APP_ROUTES_CACHE' => INSTALL_TEMP_CACHE_DIR . '/routes-v7.php',
        'APP_EVENTS_CACHE' => INSTALL_TEMP_CACHE_DIR . '/events.php',
        'VIEW_COMPILED_PATH' => INSTALL_TEMP_VIEW_DIR,
    ];

    foreach ($paths as $key => $value) {
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
        @putenv($key . '=' . $value);
    }
}

function prepareWritableDirectories(): array {
    $messages = [];
    $directories = [
        BASE_DIR . '/storage',
        BASE_DIR . '/storage/app',
        BASE_DIR . '/storage/framework',
        INSTALL_CACHE_DIR,
        BASE_DIR . '/storage/framework/cache/data',
        BASE_DIR . '/storage/framework/sessions',
        BASE_DIR . '/storage/framework/views',
        BASE_DIR . '/storage/logs',
        BOOTSTRAP_CACHE_DIR,
        INSTALL_TEMP_BASE,
        INSTALL_TEMP_STORAGE_DIR,
        INSTALL_TEMP_STORAGE_DIR . '/app',
        INSTALL_TEMP_STORAGE_DIR . '/framework',
        INSTALL_TEMP_STORAGE_DIR . '/framework/cache',
        INSTALL_TEMP_STORAGE_DIR . '/framework/cache/data',
        INSTALL_TEMP_STORAGE_DIR . '/framework/sessions',
        INSTALL_TEMP_STORAGE_DIR . '/framework/views',
        INSTALL_TEMP_STORAGE_DIR . '/logs',
        INSTALL_TEMP_CACHE_DIR,
        INSTALL_TEMP_VIEW_DIR,
    ];

    foreach ($directories as $directory) {
        if (!is_dir($directory) && !@mkdir($directory, 0775, true)) {
            return ['ok' => false, 'messages' => ["Verzeichnis konnte nicht erstellt werden: {$directory}"]];
        }

        @chmod($directory, 0777);

        if (!is_writable($directory)) {
            return ['ok' => false, 'messages' => ["Verzeichnis ist fuer PHP nicht beschreibbar: {$directory}"]];
        }
    }

    $messages[] = 'Laravel-Schreibverzeichnisse sind vorbereitet.';

    return ['ok' => true, 'messages' => $messages];
}

function tempnamWritable(string $directory, string $prefix): array {
    $warnings = [];
    set_error_handler(function (int $severity, string $message) use (&$warnings): bool {
        $warnings[] = $message;
        return true;
    });

    $tempFile = tempnam($directory, $prefix);
    restore_error_handler();

    if ($tempFile !== false && is_file($tempFile)) {
        @unlink($tempFile);
    }

    return ['ok' => $tempFile !== false && !$warnings, 'warnings' => $warnings];
}

function prepareTempnamDirectories(): array {
    $messages = [];
    $directories = [
        INSTALL_TEMP_CACHE_DIR => 'installer-cache-',
        INSTALL_TEMP_VIEW_DIR => 'installer-view-',
        INSTALL_TEMP_STORAGE_DIR . '/framework/cache' => 'installer-facade-',
        INSTALL_TEMP_STORAGE_DIR . '/framework/views' => 'installer-storage-view-',
    ];

    foreach ($directories as $directory => $prefix) {
        $probe = tempnamWritable($directory, $prefix);

        if (!$probe['ok']) {
            $messages[] = "tempnam-Test fehlgeschlagen fuer {$directory}: " . implode(' | ', $probe['warnings']);
        }
    }

    return ['ok' => $messages === [], 'messages' => $messages];
}

function writeAppKey(): string {
    $key = 'base64:' . base64_encode(random_bytes(32));
    $env = file_exists(ENV_FILE) ? (string) file_get_contents(ENV_FILE) : '';

    if (preg_match('/^APP_KEY=.*$/m', $env)) {
        $env = preg_replace('/^APP_KEY=.*$/m', 'APP_KEY=' . $key, $env);
    } else {
        $env .= "\nAPP_KEY=" . $key . "\n";
    }

    file_put_contents(ENV_FILE, $env);
    return $key;
}

function clearBootstrapCacheFiles(): array {
    $removed = [];
    $remaining = [];
    $cacheDirectories = [BOOTSTRAP_CACHE_DIR, INSTALL_CACHE_DIR];

    foreach ($cacheDirectories as $cacheDirectory) {
        if (!is_dir($cacheDirectory)) {
            @mkdir($cacheDirectory, 0775, true);
        }

        @chmod($cacheDirectory, 0777);

        foreach (glob($cacheDirectory . '/*.php') ?: [] as $path) {
            if (!is_file($path)) {
                continue;
            }

            $cacheFile = str_replace(BASE_DIR . '/', '', $path);
            @chmod($path, 0666);

            if (@unlink($path)) {
                $removed[] = $cacheFile;
                continue;
            }

            clearstatcache(true, $path);

            if (is_file($path)) {
                $remaining[] = $cacheFile;
            }
        }
    }

    return ['removed' => $removed, 'remaining' => $remaining];
}

function prepareSqliteDatabase(array $values): array {
    if (dbConnection($values) !== 'sqlite') {
        return ['ok' => true, 'output' => ''];
    }

    $path = sqliteDatabasePath($values);
    $dir = dirname($path);

    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
        return ['ok' => false, 'output' => "SQLite-Verzeichnis konnte nicht erstellt werden: {$dir}"];
    }

    @chmod($dir, 0777);

    if (!is_file($path) && @file_put_contents($path, '') === false) {
        return ['ok' => false, 'output' => "SQLite-Datei konnte nicht erstellt werden: {$path}"];
    }

    @chmod($path, 0666);

    if (!is_writable($path)) {
        return ['ok' => false, 'output' => "SQLite-Datei ist nicht beschreibbar: {$path}\nBitte Schreibrechte fuer den PHP/Webserver-Benutzer setzen oder MySQL verwenden."];
    }

    if (!is_writable($dir)) {
        return ['ok' => false, 'output' => "SQLite-Verzeichnis ist nicht beschreibbar: {$dir}\nSQLite muss auch im Verzeichnis schreiben koennen."];
    }

    return ['ok' => true, 'output' => "SQLite-Datei ist beschreibbar: {$path}"];
}

function runArtisanInProcess(string $command, array $arguments = [], ?string $expectedConnection = null): array {
    installerLog('ARTISAN ' . $command);

    if (!vendorReady()) {
        return ['output' => 'vendor/ ist unvollständig. Bitte Vendor-Archive im Installer-Schritt erneut entpacken lassen.', 'ok' => false];
    }

    $bootstrap = BASE_DIR . '/bootstrap/app.php';
    if (!file_exists($bootstrap)) {
        return ['output' => 'bootstrap/app.php fehlt.', 'ok' => false];
    }

    try {
        applyInstallerRuntimePaths();
        require_once AUTOLOAD_FILE;
        $app = require $bootstrap;

        if (method_exists($app, 'useStoragePath')) {
            $app->useStoragePath(INSTALL_TEMP_STORAGE_DIR);
        }

        $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);

        $previousReporting = error_reporting();
        error_reporting($previousReporting & ~E_WARNING & ~E_NOTICE);

        try {
            $kernel->bootstrap();
        } finally {
            error_reporting($previousReporting);
        }

        if ($expectedConnection !== null) {
            $actualConnection = (string) $app['config']->get('database.default');

            if ($actualConnection !== $expectedConnection) {
                return [
                    'output' => "Laravel lädt DB_CONNECTION={$actualConnection}, erwartet wurde {$expectedConnection}.\nBitte bootstrap/cache/config.php auf dem Server löschen und den Installer erneut starten.",
                    'ok' => false,
                ];
            }
        }

        $previousErrorHandler = set_error_handler(function (int $severity, string $message, string $file = '', int $line = 0) use (&$previousErrorHandler): bool {
            if (str_contains($message, 'tempnam(): file created in the system') || str_contains($message, "tempnam(): file created in the system's temporary directory")) {
                installerLog('IGNORED TEMPNAM WARNING ' . $message);
                return true;
            }

            if (is_callable($previousErrorHandler)) {
                return (bool) $previousErrorHandler($severity, $message, $file, $line);
            }

            return false;
        });

        try {
            $exitCode = $kernel->call($command, $arguments);
            $output = trim($kernel->output());
        } finally {
            restore_error_handler();
        }

        installerLog('ARTISAN END exit=' . $exitCode . ($output !== '' ? "\n" . $output : ''));

        return ['output' => $output, 'ok' => $exitCode === 0];
    } catch (Throwable $e) {
        installerLog('ARTISAN ERROR ' . $e->getMessage());
        return ['output' => $e->getMessage(), 'ok' => false];
    }
}

function createAdminUser(array $values): array {
    installerLog('ADMIN USER SETUP');

    if (!vendorReady()) {
        return ['output' => 'vendor/ ist unvollständig. Admin-User konnte nicht angelegt werden.', 'ok' => false];
    }

    $bootstrap = BASE_DIR . '/bootstrap/app.php';
    if (!file_exists($bootstrap)) {
        return ['output' => 'bootstrap/app.php fehlt. Admin-User konnte nicht angelegt werden.', 'ok' => false];
    }

    try {
        applyInstallerRuntimePaths();
        require_once AUTOLOAD_FILE;
        $app = require $bootstrap;

        if (method_exists($app, 'useStoragePath')) {
            $app->useStoragePath(INSTALL_TEMP_STORAGE_DIR);
        }

        $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
        $previousReporting = error_reporting();
        error_reporting($previousReporting & ~E_WARNING & ~E_NOTICE);

        try {
            $kernel->bootstrap();
        } finally {
            error_reporting($previousReporting);
        }

        $email = trim((string) ($values['ADMIN_EMAIL'] ?? ''));
        $name = trim((string) ($values['ADMIN_NAME'] ?? ''));
        $password = (string) ($values['ADMIN_PASSWORD'] ?? '');

        $user = App\Models\User::updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Illuminate\Support\Facades\Hash::make($password),
                'roles' => [App\Models\User::ROLE_ADMIN],
            ]
        );
        $user->forceFill([
            'approved_at' => now(),
            'email_verified_at' => now(),
        ])->save();

        installerLog('ADMIN USER OK ' . $email);
        return ['output' => "Admin-User angelegt/aktualisiert: {$email}", 'ok' => true];
    } catch (Throwable $e) {
        installerLog('ADMIN USER ERROR ' . $e->getMessage());
        return ['output' => 'Admin-User konnte nicht angelegt werden: ' . $e->getMessage(), 'ok' => false];
    }
}

function runInstallation(array $values, string $progressId = ''): array {
    $results = [];

    foreach (['env', 'vendor', 'key', 'cache', 'migrate'] as $stepName) {
        $result = runInstallStep($stepName, $values, $progressId);
        $results[] = $result;

        if (!$result['ok']) {
            return $results;
        }
    }

    writeProgress($progressId, 'Installation abgeschlossen', 100, 'done');
    return $results;
}

function runInstallStep(string $stepName, array $values, string $progressId = ''): array {
    installerLog('STEP ' . $stepName);

    if ($stepName === 'env') {
        writeProgress($progressId, '.env schreiben', 5);
        writeEnv($values);
        $writableDirs = prepareWritableDirectories();
        $tempnamDirs = prepareTempnamDirectories();
        $cacheFiles = clearBootstrapCacheFiles();
        $sqliteResult = prepareSqliteDatabase($values);
        $output = ENV_FILE . "\nDB_CONNECTION=" . dbConnection($values) . "\nDB_DATABASE=" . normalizedDbDatabase($values);
        $output .= "\nLARAVEL_STORAGE_PATH=" . INSTALL_TEMP_STORAGE_DIR;
        $output .= "\nAPP_CONFIG_CACHE=" . INSTALL_TEMP_CACHE_DIR . '/config.php';
        $output .= "\nAPP_SERVICES_CACHE=" . INSTALL_TEMP_CACHE_DIR . '/services.php';
        $output .= "\nAPP_PACKAGES_CACHE=" . INSTALL_TEMP_CACHE_DIR . '/packages.php';
        $output .= "\nVIEW_COMPILED_PATH=" . INSTALL_TEMP_VIEW_DIR;

        foreach ($writableDirs['messages'] as $message) {
            $output .= "\n" . $message;
        }

        foreach ($tempnamDirs['messages'] as $message) {
            $output .= "\n" . $message;
        }

        if ($cacheFiles['removed']) {
            $output .= "\nAlte Laravel-Cache-Dateien entfernt: " . implode(', ', $cacheFiles['removed']);
        }

        if ($cacheFiles['remaining']) {
            $output .= "\nLaravel-Cache-Dateien konnten nicht entfernt werden: " . implode(', ', $cacheFiles['remaining']);
            $output .= "\nDiese Dateien werden ignoriert, solange Laravel die neu geschriebenen Cache-Pfade aus .env lädt.";
        }

        if ($sqliteResult['output'] !== '') {
            $output .= "\n" . $sqliteResult['output'];
        }

        if (!$writableDirs['ok']) {
            writeProgress($progressId, 'Laravel-Schreibverzeichnisse vorbereiten fehlgeschlagen', 5, 'error');
            return ['label' => '.env geschrieben / Schreibverzeichnisse vorbereiten', 'ok' => false, 'output' => $output];
        }

        if (!$sqliteResult['ok']) {
            return ['label' => '.env geschrieben / SQLite vorbereiten', 'ok' => false, 'output' => $output];
        }

        return ['label' => '.env geschrieben', 'ok' => true, 'output' => $output];
    }

    if ($stepName === 'vendor') {
        writeProgress($progressId, 'Vendor-Archive vorbereiten / entpacken', 20);
        $result = prepareVendor();

        if (!$result['ok']) {
            writeProgress($progressId, 'Vendor-Archive / Composer fehlgeschlagen', 25, 'error');
        }

        return $result;
    }

    if (!vendorReady()) {
        writeProgress($progressId, 'Artisan-Befehle übersprungen', 25, 'error');
        return [
            'label' => 'Artisan-Befehle übersprungen',
            'ok' => false,
            'output' => 'vendor/ ist unvollständig; Vendor-Archive konnten nicht genutzt werden und Composer install ist fehlgeschlagen.',
        ];
    }

    if ($stepName === 'key') {
        writeProgress($progressId, 'App-Key generieren', 40);
        writeAppKey();
        return ['label' => 'App-Key generiert', 'ok' => true, 'output' => 'APP_KEY wurde direkt in .env geschrieben.'];
    }

    if (in_array($stepName, ['cache', 'config', 'route', 'view'], true)) {
        writeProgress($progressId, 'Laravel-Caches überspringen', 78);
        return [
            'label' => 'Laravel-Caches übersprungen',
            'ok' => true,
            'output' => 'Cache-Aufbau wird auf diesem Webhosting nicht während der Erstinstallation ausgeführt. Die App läuft ohne vorab gebaute Caches.',
        ];
    }

    if ($stepName === 'migrate') {
        $freshInstall = freshInstallRequested($values);
        $label = $freshInstall
            ? 'Datenbank neu installieren und seeden'
            : 'Datenbank migrieren und seeden';
        $command = $freshInstall ? 'migrate:fresh' : 'migrate';
        $arguments = [
            '--force' => true,
            '--no-interaction' => true,
            '--no-ansi' => true,
            '--seed' => true,
        ];

        writeProgress($progressId, $label, 90);
        $result = runArtisanInProcess($command, $arguments, dbConnection($values));

        if ($result['ok']) {
            writeProgress($progressId, 'Admin-User anlegen', 96);
            $adminResult = createAdminUser($values);
            $result['ok'] = $adminResult['ok'];
            $result['output'] = trim($result['output'] . "\n\n" . $adminResult['output']);
        }

        if (!$result['ok']) {
            writeProgress($progressId, $label . ' fehlgeschlagen', 90, 'error');
        } else {
            writeProgress($progressId, 'Installation abgeschlossen', 100, 'done');
        }

        $output = $result['output'];
        if ($freshInstall) {
            $output = "Neuinstallation aktiv: Laravel migrate:fresh hat vorhandene Tabellen gelöscht und neu erstellt.\n" . $output;
        }

        return ['label' => $label, 'ok' => $result['ok'], 'output' => $output];
    }

    writeProgress($progressId, 'Unbekannter Installationsschritt', 0, 'error');
    return ['label' => 'Unbekannter Installationsschritt', 'ok' => false, 'output' => $stepName];
}

// ─── Request-Verarbeitung ─────────────────────────────────────────────────────

if (isset($_GET['logout']) || isset($_GET['reset'])) {
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'] ?? 'Strict',
        ]);
    }

    session_destroy();
    redirectToInstaller();
}

$step    = 'login';
$errors  = [];
$results = [];

if (!installerReady()) {
    $errors[] = 'Installer-Passwort wurde nicht gesetzt. Bitte installerPassword in gradle.properties setzen und neu deployen.';
}

// Login
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    $lockedUntil = $_SESSION['login_locked_until'] ?? 0;

    if (!verifyCsrf()) {
        $errors[] = 'Ungültige Sitzung. Bitte Formular erneut absenden.';
    } elseif ($lockedUntil > time()) {
        $errors[] = 'Zu viele Fehlversuche. Bitte später erneut versuchen.';
    } elseif (installerReady() && hash_equals(INSTALL_PASSWORD, $_POST['password'])) {
        $_SESSION['installer_auth'] = true;
        $_SESSION['login_failures'] = 0;
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    } else {
        $_SESSION['login_failures'] = ($_SESSION['login_failures'] ?? 0) + 1;
        if ($_SESSION['login_failures'] >= 10) {
            $_SESSION['login_locked_until'] = time() + 300;
        }
        $errors[] = 'Falsches Passwort.';
    }
}

if (isAuthenticated()) {
    $step = 'form';

    // Konfiguration speichern & Befehle ausführen
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['APP_URL'])) {
        $values = array_map('trim', $_POST);
        $errors = verifyCsrf() ? validateInstallValues($values) : ['Ungültige Sitzung. Bitte Formular erneut absenden.'];
        $isAsync = isset($_POST['async_install']);
        $isAsyncStep = isset($_POST['async_step']);
        $progressId = (string) ($_POST['progress_id'] ?? '');

        if ($errors) {
            if ($isAsync || $isAsyncStep) {
                writeProgress($progressId, 'Validierung fehlgeschlagen', 0, 'error');
                jsonResponse(['ok' => false, 'errors' => $errors]);
            }
            $step = 'form';
        } else {
            if ($isAsyncStep) {
                $stepName = (string) ($_POST['step_name'] ?? '');
                session_write_close();
                $result = runInstallStep($stepName, $values, $progressId);
                jsonResponse(['ok' => $result['ok'], 'result' => $result]);
            }

            if ($isAsync) {
                writeProgress($progressId, 'Installation wird gestartet', 1);
                session_write_close();
                $results = runInstallation($values, $progressId);
                $ok = !in_array(false, array_column($results, 'ok'), true);
                jsonResponse(['ok' => $ok, 'results' => $results]);
            }

            $results = runInstallation($values);
            $step = 'done';
        }
    }
}

// ─── HTML-Ausgabe ─────────────────────────────────────────────────────────────
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Petanque Turnier Manager – Installation</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; background: #f1f5f9; color: #1e293b; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 2rem 1rem; }
        .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); width: 100%; max-width: 680px; overflow: hidden; }
        .card-header { background: #1e3a5f; color: #fff; padding: 1.5rem 2rem; }
        .card-header h1 { font-size: 1.25rem; font-weight: 600; }
        .card-header p  { font-size: .85rem; opacity: .75; margin-top: .25rem; }
        .card-body { padding: 2rem; }
        .section { margin-bottom: 1.75rem; }
        .section-title { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: .75rem; padding-bottom: .4rem; border-bottom: 1px solid #e2e8f0; }
        .field { margin-bottom: 1rem; }
        label { display: block; font-size: .85rem; font-weight: 500; margin-bottom: .3rem; }
        label small { font-weight: 400; color: #94a3b8; }
        input, select { width: 100%; padding: .5rem .75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: .9rem; color: #1e293b; background: #fff; }
        input:focus, select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .btn { display: inline-block; padding: .6rem 1.5rem; background: #1e3a5f; color: #fff; border: none; border-radius: 6px; font-size: .9rem; font-weight: 600; cursor: pointer; transition: background .15s; }
        .btn:hover { background: #2d5080; }
        .alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: .75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: .875rem; }
        .result { margin-bottom: .5rem; padding: .6rem .9rem; border-radius: 6px; font-size: .85rem; }
        .result.ok  { background: #f0fdf4; border: 1px solid #bbf7d0; }
        .result.err { background: #fef2f2; border: 1px solid #fecaca; }
        .result-label { font-weight: 600; }
        .result-output { font-family: monospace; font-size: .78rem; color: #475569; margin-top: .3rem; white-space: pre-wrap; }
        .result-list { margin-top: 1.25rem; }
        .warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 1rem; border-radius: 6px; font-size: .875rem; margin-top: 1rem; }
        .warning strong { display: block; margin-bottom: .25rem; }
        .danger-option { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: .85rem; margin-top: 1rem; }
        .danger-option label { display: flex; align-items: flex-start; gap: .5rem; color: #991b1b; text-transform: none; letter-spacing: 0; font-size: .9rem; }
        .danger-option input[type="checkbox"] { width: auto; margin-top: .15rem; }
        .danger-option input[type="text"] { margin-top: .65rem; }
        .danger-note { color: #7f1d1d; font-size: .8rem; margin-top: .4rem; }
        .actions { display: flex; align-items: center; gap: 1rem; margin-top: 1rem; }
        .link { color: #1e3a5f; font-size: .875rem; font-weight: 600; text-decoration: none; }
        .link:hover { text-decoration: underline; }
        .static-value { padding: .5rem .75rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: .9rem; }
        .progress-panel { display: none; margin-top: 1.5rem; padding: 1rem; border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 8px; }
        .progress-panel.active { display: block; }
        .progress-title { font-size: .9rem; font-weight: 700; margin-bottom: .75rem; color: #1e3a5f; }
        .progress-bar { height: .5rem; background: #dbeafe; border-radius: 999px; overflow: hidden; margin-bottom: .9rem; }
        .progress-fill { width: 0; height: 100%; background: #2563eb; transition: width .35s ease; }
        .progress-steps { list-style: none; display: grid; gap: .45rem; }
        .progress-step { color: #64748b; font-size: .85rem; }
        .progress-step::before { content: '○'; display: inline-block; width: 1.4rem; color: #94a3b8; }
        .progress-step.active { color: #1e3a5f; font-weight: 700; }
        .progress-step.active::before { content: '●'; color: #2563eb; }
        .progress-step.done { color: #166534; }
        .progress-step.done::before { content: '✓'; color: #16a34a; }
    </style>
</head>
<body>
<div class="card">
    <div class="card-header">
        <h1>Pétanque Turnier Manager – Installation</h1>
        <p>Ersteinrichtung der Anwendung auf dem Server</p>
    </div>
    <div class="card-body">

        <?php foreach ($errors as $e): ?>
            <div class="alert-error"><?= htmlspecialchars($e) ?></div>
        <?php endforeach; ?>

    <?php if ($step === 'login'): ?>

        <form method="post" id="install-form">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrfToken()) ?>">
            <div class="field">
                <label>Installer-Passwort</label>
                <input type="password" name="password" autofocus required>
            </div>
            <button class="btn" type="submit">Anmelden</button>
        </form>

    <?php elseif ($step === 'form'): ?>

        <form method="post" id="install-form">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrfToken()) ?>">

            <div class="section">
                <div class="section-title">Anwendung</div>
                <div class="field">
                    <label>APP_NAME</label>
                    <div class="static-value"><?= htmlspecialchars(INSTALL_APP_NAME) ?></div>
                </div>
                <div class="field">
                    <label>APP_URL <small>Vollständige URL mit https://</small></label>
                    <input type="text" name="APP_URL" value="<?= inputValue(DEFAULT_APP_URL, 'https://') ?>" required>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Datenbank</div>
                <div class="row">
                    <div class="field">
                        <label>DB_CONNECTION</label>
                        <select name="DB_CONNECTION">
                            <option value="mysql"<?= selected(DEFAULT_DB_CONNECTION, 'mysql') ?>>mysql</option>
                            <option value="sqlite"<?= selected(DEFAULT_DB_CONNECTION, 'sqlite') ?>>sqlite</option>
                            <option value="pgsql"<?= selected(DEFAULT_DB_CONNECTION, 'pgsql') ?>>pgsql</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>DB_HOST</label>
                        <input type="text" name="DB_HOST" value="<?= inputValue(DEFAULT_DB_HOST, '127.0.0.1') ?>">
                    </div>
                </div>
                <div class="row">
                    <div class="field">
                        <label>DB_PORT</label>
                        <input type="text" name="DB_PORT" value="<?= inputValue(DEFAULT_DB_PORT, '3306') ?>">
                    </div>
                    <div class="field">
                        <label>DB_DATABASE</label>
                        <input type="text" name="DB_DATABASE" value="<?= inputValue(DEFAULT_DB_DATABASE) ?>" required>
                    </div>
                </div>
                <div class="row">
                    <div class="field">
                        <label>DB_USERNAME</label>
                        <input type="text" name="DB_USERNAME" value="<?= inputValue(DEFAULT_DB_USERNAME) ?>" required>
                    </div>
                    <div class="field">
                        <label>DB_PASSWORD</label>
                        <input type="password" name="DB_PASSWORD" value="<?= inputValue(DEFAULT_DB_PASSWORD) ?>">
                    </div>
                </div>
                <div class="danger-option">
                    <label>
                        <input type="checkbox" name="FRESH_INSTALL" value="1">
                        <span>Neuinstallation / Tabellen leeren ausführen</span>
                    </label>
                    <div class="danger-note">
                        Löscht vorhandene Tabellen in dieser Datenbank und führt danach Migrationen und Seeder neu aus.
                        Für eine leere Erstinstallation nach fehlgeschlagenem Lauf gedacht.
                    </div>
                    <input type="text" name="FRESH_INSTALL_CONFIRM" placeholder="Zur Bestätigung: TABELLEN LOESCHEN">
                </div>
            </div>

            <div class="section">
                <div class="section-title">Admin-Zugang</div>
                <div class="row">
                    <div class="field">
                        <label>ADMIN_NAME</label>
                        <input type="text" name="ADMIN_NAME" value="<?= inputValue(DEFAULT_ADMIN_NAME, 'Administrator') ?>" required>
                    </div>
                    <div class="field">
                        <label>ADMIN_EMAIL</label>
                        <input type="email" name="ADMIN_EMAIL" value="<?= inputValue(DEFAULT_ADMIN_EMAIL, 'admin@example.com') ?>" required>
                    </div>
                </div>
                <div class="field">
                    <label>ADMIN_PASSWORD <small>mindestens 8 Zeichen</small></label>
                    <input type="password" name="ADMIN_PASSWORD" value="<?= inputValue(DEFAULT_ADMIN_PASSWORD) ?>" required>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Mail <small style="text-transform:none;font-size:.85em">(optional)</small></div>
                <div class="row">
                    <div class="field">
                        <label>MAIL_MAILER</label>
                        <select name="MAIL_MAILER">
                            <option value="log"<?= selected(DEFAULT_MAIL_MAILER, 'log') ?>>log (kein Versand)</option>
                            <option value="smtp"<?= selected(DEFAULT_MAIL_MAILER, 'smtp') ?>>smtp</option>
                            <option value="sendmail"<?= selected(DEFAULT_MAIL_MAILER, 'sendmail') ?>>sendmail</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>MAIL_FROM_ADDRESS</label>
                        <input type="email" name="MAIL_FROM_ADDRESS" value="<?= inputValue(DEFAULT_MAIL_FROM_ADDRESS, 'noreply@example.com') ?>">
                    </div>
                </div>
                <div class="row">
                    <div class="field">
                        <label>MAIL_HOST</label>
                        <input type="text" name="MAIL_HOST" value="<?= inputValue(DEFAULT_MAIL_HOST, '127.0.0.1') ?>">
                    </div>
                    <div class="field">
                        <label>MAIL_PORT</label>
                        <input type="text" name="MAIL_PORT" value="<?= inputValue(DEFAULT_MAIL_PORT, '587') ?>">
                    </div>
                </div>
                <div class="row">
                    <div class="field">
                        <label>MAIL_USERNAME</label>
                        <input type="text" name="MAIL_USERNAME" value="<?= inputValue(DEFAULT_MAIL_USERNAME, 'null') ?>">
                    </div>
                    <div class="field">
                        <label>MAIL_PASSWORD</label>
                        <input type="password" name="MAIL_PASSWORD" value="<?= inputValue(DEFAULT_MAIL_PASSWORD) ?>">
                    </div>
                </div>
            </div>

            <div class="actions">
                <button class="btn" type="button" id="install-submit">Installation starten</button>
                <a class="link" href="?reset=1">Neu starten</a>
            </div>
        </form>

        <div class="progress-panel" id="install-progress" aria-live="polite">
            <div class="progress-title" id="progress-title">Installation läuft …</div>
            <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
            <ul class="progress-steps">
                <li class="progress-step" data-progress-step>.env schreiben</li>
                <li class="progress-step" data-progress-step>Vendor-Archive vorbereiten / entpacken</li>
                <li class="progress-step" data-progress-step>App-Key generieren</li>
                <li class="progress-step" data-progress-step>Laravel-Caches aufbauen</li>
                <li class="progress-step" data-progress-step>Datenbank migrieren und seeden</li>
            </ul>
        </div>

        <div class="result-list" id="async-results"></div>

    <?php elseif ($step === 'done'): ?>

        <?php foreach ($results as $r): ?>
            <div class="result <?= $r['ok'] ? 'ok' : 'err' ?>">
                <div class="result-label"><?= $r['ok'] ? '✓' : '✗' ?> <?= htmlspecialchars($r['label']) ?></div>
                <?php if ($r['output']): ?>
                    <div class="result-output"><?= htmlspecialchars($r['output']) ?></div>
                <?php endif; ?>
            </div>
        <?php endforeach; ?>

        <?php $composerResult = $results[1] ?? null; if ($composerResult && !$composerResult['ok']): ?>
        <div class="warning">
            <strong>Composer-Installation fehlgeschlagen.</strong>
            Prüfe, ob <code>composer</code> auf dem Server verfügbar ist, oder führe
            <code>composer install --no-dev --optimize-autoloader</code> auf dem Server aus.
            Danach den Installer erneut starten.
        </div>
        <?php endif; ?>

        <div class="warning">
            <strong>Wichtig: Installer jetzt löschen!</strong>
            Diese Datei enthält das Installer-Passwort und muss nach der Einrichtung
            vom Server entfernt werden:<br><code>public/install.php</code>
        </div>

        <div class="actions">
            <a class="link" href="?reset=1">Installer neu starten</a>
        </div>

    <?php endif; ?>

    </div>
</div>
<script>
(function () {
    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function randomProgressId() {
        var bytes = new Uint8Array(16);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(bytes);
        } else {
            for (var i = 0; i < bytes.length; i += 1) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }

        var id = '';
        for (var j = 0; j < bytes.length; j += 1) {
            id += ('0' + bytes[j].toString(16)).slice(-2);
        }
        return id;
    }

    function request(method, url, body, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status < 200 || xhr.status >= 300) {
                    callback(new Error('HTTP ' + xhr.status + ': ' + (xhr.responseText || '').slice(0, 300)));
                    return;
                }

                try {
                    callback(null, JSON.parse(xhr.responseText || '{}'));
                } catch (error) {
                    error.message = 'Ungültige Serverantwort: ' + (xhr.responseText || '').slice(0, 300);
                    callback(error);
                }
            }
        };
        xhr.onerror = function () {
            callback(new Error('Netzwerkfehler beim Aufruf des Installers.'));
        };
        xhr.send(body || null);
    }

    var installForm = document.getElementById('install-form');
    var progressPanel = document.getElementById('install-progress');
    var progressFill = document.getElementById('progress-fill');
    var progressTitle = document.getElementById('progress-title');
    var installSubmit = document.getElementById('install-submit');
    var asyncResults = document.getElementById('async-results');
    var progressSteps = Array.prototype.slice.call(document.querySelectorAll('[data-progress-step]'));

    if (!installForm || !progressPanel || !progressFill || !progressTitle || !installSubmit || !asyncResults) {
        return;
    }

    var progressMap = [
        ['.env', 0],
        ['vendor', 1],
        ['Composer', 1],
        ['App-Key', 2],
        ['Config-Cache', 3],
        ['Route-Cache', 3],
        ['View-Cache', 3],
        ['Datenbank', 4]
    ];
    var stepIndexes = {
        env: 0,
        vendor: 1,
        key: 2,
        cache: 3,
        config: 3,
        route: 3,
        view: 3,
        migrate: 4
    };
    var completedStepIndex = -1;

    function setStep(label, percent, status) {
        label = label || 'Installation läuft …';
        status = status || 'running';
        var activeIndex = 0;

        for (var i = 0; i < progressMap.length; i += 1) {
            if (label.indexOf(progressMap[i][0]) !== -1) {
                activeIndex = progressMap[i][1];
                break;
            }
        }
        if (status === 'done') {
            activeIndex = progressSteps.length;
        }

        for (var j = 0; j < progressSteps.length; j += 1) {
            progressSteps[j].classList.toggle('done', j <= completedStepIndex || j < activeIndex || status === 'done');
            progressSteps[j].classList.toggle('active', j === activeIndex && status === 'running');
        }

        progressFill.style.width = Math.max(0, Math.min(100, percent || 0)) + '%';
        progressTitle.textContent = label;
    }

    function renderResults(payload) {
        var html = '';
        var errors = payload.errors || [];
        var results = payload.results || [];

        for (var i = 0; i < errors.length; i += 1) {
            html += '<div class="alert-error">' + escapeHtml(errors[i]) + '</div>';
        }

        for (var j = 0; j < results.length; j += 1) {
            html += '<div class="result ' + (results[j].ok ? 'ok' : 'err') + '">';
            html += '<div class="result-label">' + (results[j].ok ? '✓' : '✗') + ' ' + escapeHtml(results[j].label) + '</div>';
            if (results[j].output) {
                html += '<div class="result-output">' + escapeHtml(results[j].output) + '</div>';
            }
            html += '</div>';
        }

        if (results.length) {
            html += '<div class="warning"><strong>Wichtig: Installer jetzt löschen!</strong>';
            html += 'Diese Datei enthält das Installer-Passwort und muss nach der Einrichtung ';
            html += 'vom Server entfernt werden:<br><code>public/install.php</code></div>';
        }

        asyncResults.innerHTML = html;
    }

    function appendResult(result) {
        var html = '<div class="result ' + (result.ok ? 'ok' : 'err') + '">';
        html += '<div class="result-label">' + (result.ok ? '✓' : '✗') + ' ' + escapeHtml(result.label) + '</div>';
        if (result.output) {
            html += '<div class="result-output">' + escapeHtml(result.output) + '</div>';
        }
        html += '</div>';
        asyncResults.innerHTML += html;
    }

    function markStepDone(stepName) {
        var index = stepIndexes[stepName];
        if (typeof index !== 'number') {
            return;
        }

        completedStepIndex = Math.max(completedStepIndex, index);

        for (var i = 0; i < progressSteps.length; i += 1) {
            progressSteps[i].classList.toggle('done', i <= completedStepIndex);
            progressSteps[i].classList.toggle('active', i === index + 1);
        }
    }

    function appendInstallerWarning() {
        asyncResults.innerHTML += '<div class="warning"><strong>Wichtig: Installer jetzt löschen!</strong>' +
            'Diese Datei enthält das Installer-Passwort und muss nach der Einrichtung ' +
            'vom Server entfernt werden:<br><code>public/install.php</code></div>';
    }

    function startInstall() {
        if (installForm.checkValidity && !installForm.checkValidity()) {
            installForm.reportValidity();
            return;
        }

        progressPanel.classList.add('active');
        installSubmit.disabled = true;
        installSubmit.textContent = 'Installation läuft …';
        asyncResults.innerHTML = '';
        setStep('Installationsanfrage wird gesendet ...', 1, 'running');

        var progressId = randomProgressId();
        var installUrl = window.location.href.split('?')[0];
        var steps = ['env', 'vendor', 'key', 'cache', 'migrate'];
        var stepIndex = 0;

        var pollTimer = window.setInterval(function () {
            request('GET', installUrl + '?progress=' + encodeURIComponent(progressId) + '&_=' + Date.now(), null, function (error, progress) {
                if (error) {
                    progressTitle.textContent = error.message || 'Fortschritt kann gerade nicht gelesen werden ...';
                    return;
                }
                if (progress.status === 'idle') {
                    return;
                }
                setStep(progress.label, progress.percent, progress.status);
                if (progress.status === 'done' || progress.status === 'error') {
                    window.clearInterval(pollTimer);
                }
            });
        }, 700);

        function finish(ok, errorMessage) {
            window.clearInterval(pollTimer);
            setStep(ok ? 'Installation abgeschlossen' : 'Installation fehlgeschlagen', ok ? 100 : 95, ok ? 'done' : 'error');
            if (errorMessage) {
                renderResults({ errors: [errorMessage] });
            } else if (ok) {
                appendInstallerWarning();
            }
            installSubmit.disabled = false;
            installSubmit.textContent = 'Installation starten';
        }

        function runNextStep() {
            if (stepIndex >= steps.length) {
                finish(true);
                return;
            }

            var stepFormData = new FormData(installForm);
            stepFormData.append('async_step', '1');
            stepFormData.append('progress_id', progressId);
            stepFormData.append('step_name', steps[stepIndex]);
            setStep(progressSteps[stepIndexes[steps[stepIndex]]].textContent, stepIndex * 14, 'running');

            request('POST', installUrl, stepFormData, function (error, payload) {
                if (error) {
                    finish(false, error.message || 'Die Serverantwort konnte nicht gelesen werden.');
                    return;
                }

                if (payload.errors && payload.errors.length) {
                    finish(false, payload.errors.join('\n'));
                    return;
                }

                if (!payload.result) {
                    finish(false, 'Der Installationsschritt lieferte kein Ergebnis.');
                    return;
                }

                appendResult(payload.result);
                markStepDone(steps[stepIndex]);

                if (!payload.ok) {
                    finish(false);
                    return;
                }

                stepIndex += 1;
                runNextStep();
            });
        }

        runNextStep();
    }

    installForm.addEventListener('submit', function (event) {
        event.preventDefault();
        startInstall();
    });
    installSubmit.addEventListener('click', startInstall);
}());
</script>
</body>
</html>
