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
// Vor dem Upload ändern. Nach der Installation Datei löschen!
define('INSTALL_PASSWORD', 'install-geheim');

// ─── Pfade ────────────────────────────────────────────────────────────────────
define('BASE_DIR',  dirname(__DIR__));
define('ENV_FILE',  BASE_DIR . '/.env');
define('ARTISAN',   BASE_DIR . '/artisan');

session_start();

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function isAuthenticated(): bool {
    return ($_SESSION['installer_auth'] ?? false) === true;
}

function runCommand(string $cmd): array {
    $output = [];
    $return = 0;
    exec($cmd . ' 2>&1', $output, $return);
    return ['output' => implode("\n", $output), 'ok' => $return === 0];
}

function writeEnv(array $values): void {
    $lines = [];
    $lines[] = '# Generiert von install.php – ' . date('Y-m-d H:i:s');
    $lines[] = '';
    $lines[] = 'APP_NAME="' . ($values['APP_NAME'] ?? 'Laravel') . '"';
    $lines[] = 'APP_ENV=' . ($values['APP_ENV'] ?? 'production');
    $lines[] = 'APP_KEY=';
    $lines[] = 'APP_DEBUG=' . ($values['APP_DEBUG'] ?? 'false');
    $lines[] = 'APP_URL=' . ($values['APP_URL'] ?? 'http://localhost');
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
    $lines[] = 'LOG_LEVEL=' . ($values['LOG_LEVEL'] ?? 'error');
    $lines[] = '';
    $lines[] = 'DB_CONNECTION=' . ($values['DB_CONNECTION'] ?? 'mysql');
    $lines[] = 'DB_HOST=' . ($values['DB_HOST'] ?? '127.0.0.1');
    $lines[] = 'DB_PORT=' . ($values['DB_PORT'] ?? '3306');
    $lines[] = 'DB_DATABASE=' . ($values['DB_DATABASE'] ?? '');
    $lines[] = 'DB_USERNAME=' . ($values['DB_USERNAME'] ?? '');
    $lines[] = 'DB_PASSWORD=' . ($values['DB_PASSWORD'] ?? '');
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
    $lines[] = 'MAIL_MAILER=' . ($values['MAIL_MAILER'] ?? 'log');
    $lines[] = 'MAIL_SCHEME=null';
    $lines[] = 'MAIL_HOST=' . ($values['MAIL_HOST'] ?? '127.0.0.1');
    $lines[] = 'MAIL_PORT=' . ($values['MAIL_PORT'] ?? '2525');
    $lines[] = 'MAIL_USERNAME=' . ($values['MAIL_USERNAME'] ?? 'null');
    $lines[] = 'MAIL_PASSWORD=' . ($values['MAIL_PASSWORD'] ?? 'null');
    $lines[] = 'MAIL_FROM_ADDRESS="' . ($values['MAIL_FROM_ADDRESS'] ?? 'hello@example.com') . '"';
    $lines[] = 'MAIL_FROM_NAME="${APP_NAME}"';
    $lines[] = '';
    $lines[] = 'VITE_APP_NAME="${APP_NAME}"';

    file_put_contents(ENV_FILE, implode("\n", $lines) . "\n");
}

// ─── Request-Verarbeitung ─────────────────────────────────────────────────────

$step    = 'login';
$errors  = [];
$results = [];

// Login
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if ($_POST['password'] === INSTALL_PASSWORD) {
        $_SESSION['installer_auth'] = true;
        header('Location: ' . $_SERVER['PHP_SELF']);
        exit;
    }
    $errors[] = 'Falsches Passwort.';
}

if (isAuthenticated()) {
    $step = 'form';

    // Konfiguration speichern & Befehle ausführen
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['APP_URL'])) {
        $values = array_map('trim', $_POST);

        // .env schreiben
        writeEnv($values);
        $results[] = ['label' => '.env geschrieben', 'ok' => true, 'output' => ENV_FILE];

        // Composer install (vendor/ auf dem Server aufbauen)
        $composerBin = trim($values['COMPOSER_PATH'] ?? 'composer');
        $res = runCommand('cd ' . escapeshellarg(BASE_DIR) . ' && ' . escapeshellarg($composerBin) . ' install --no-dev --optimize-autoloader --no-interaction');
        $results[] = ['label' => 'Composer install', 'ok' => $res['ok'], 'output' => $res['output']];

        $php = PHP_BINARY ?: 'php';
        $art = escapeshellarg(ARTISAN);

        // Befehle ausführen
        $commands = [
            'App-Key generieren'    => "$php $art key:generate --force",
            'Config-Cache'          => "$php $art config:cache",
            'Route-Cache'           => "$php $art route:cache",
            'View-Cache'            => "$php $art view:cache",
            'Datenbank migrieren'   => "$php $art migrate --force",
        ];

        foreach ($commands as $label => $cmd) {
            $res = runCommand($cmd);
            $results[] = ['label' => $label, 'ok' => $res['ok'], 'output' => $res['output']];
        }

        $step = 'done';
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
        .warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 1rem; border-radius: 6px; font-size: .875rem; margin-top: 1rem; }
        .warning strong { display: block; margin-bottom: .25rem; }
    </style>
</head>
<body>
<div class="card">
    <div class="card-header">
        <h1>Pétanque Turnier Manager – Installation</h1>
        <p>Ersteinrichtung der Anwendung auf dem Server</p>
    </div>
    <div class="card-body">

    <?php if ($step === 'login'): ?>

        <?php foreach ($errors as $e): ?>
            <div class="alert-error"><?= htmlspecialchars($e) ?></div>
        <?php endforeach; ?>

        <form method="post">
            <div class="field">
                <label>Installer-Passwort</label>
                <input type="password" name="password" autofocus required>
            </div>
            <button class="btn" type="submit">Anmelden</button>
        </form>

    <?php elseif ($step === 'form'): ?>

        <form method="post">

            <div class="section">
                <div class="section-title">Server</div>
                <div class="field">
                    <label>Composer-Pfad <small>Pfad zum composer-Binary auf dem Server</small></label>
                    <input type="text" name="COMPOSER_PATH" value="composer">
                </div>
            </div>

            <div class="section">
                <div class="section-title">Anwendung</div>
                <div class="field">
                    <label>APP_NAME <small>Anwendungsname</small></label>
                    <input type="text" name="APP_NAME" value="Pétanque Turnier Manager Online" required>
                </div>
                <div class="row">
                    <div class="field">
                        <label>APP_URL <small>Vollständige URL mit https://</small></label>
                        <input type="text" name="APP_URL" value="https://" required>
                    </div>
                    <div class="field">
                        <label>APP_ENV</label>
                        <select name="APP_ENV">
                            <option value="production" selected>production</option>
                            <option value="local">local</option>
                        </select>
                    </div>
                </div>
                <div class="row">
                    <div class="field">
                        <label>APP_DEBUG</label>
                        <select name="APP_DEBUG">
                            <option value="false" selected>false (Produktion)</option>
                            <option value="true">true (Entwicklung)</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>LOG_LEVEL</label>
                        <select name="LOG_LEVEL">
                            <option value="error" selected>error</option>
                            <option value="warning">warning</option>
                            <option value="info">info</option>
                            <option value="debug">debug</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Datenbank</div>
                <div class="row">
                    <div class="field">
                        <label>DB_CONNECTION</label>
                        <select name="DB_CONNECTION">
                            <option value="mysql" selected>mysql</option>
                            <option value="sqlite">sqlite</option>
                            <option value="pgsql">pgsql</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>DB_HOST</label>
                        <input type="text" name="DB_HOST" value="127.0.0.1">
                    </div>
                </div>
                <div class="row">
                    <div class="field">
                        <label>DB_PORT</label>
                        <input type="text" name="DB_PORT" value="3306">
                    </div>
                    <div class="field">
                        <label>DB_DATABASE</label>
                        <input type="text" name="DB_DATABASE" required>
                    </div>
                </div>
                <div class="row">
                    <div class="field">
                        <label>DB_USERNAME</label>
                        <input type="text" name="DB_USERNAME" required>
                    </div>
                    <div class="field">
                        <label>DB_PASSWORD</label>
                        <input type="password" name="DB_PASSWORD">
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Mail <small style="text-transform:none;font-size:.85em">(optional)</small></div>
                <div class="row">
                    <div class="field">
                        <label>MAIL_MAILER</label>
                        <select name="MAIL_MAILER">
                            <option value="log" selected>log (kein Versand)</option>
                            <option value="smtp">smtp</option>
                            <option value="sendmail">sendmail</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>MAIL_FROM_ADDRESS</label>
                        <input type="email" name="MAIL_FROM_ADDRESS" value="noreply@example.com">
                    </div>
                </div>
                <div class="row">
                    <div class="field">
                        <label>MAIL_HOST</label>
                        <input type="text" name="MAIL_HOST" value="127.0.0.1">
                    </div>
                    <div class="field">
                        <label>MAIL_PORT</label>
                        <input type="text" name="MAIL_PORT" value="587">
                    </div>
                </div>
                <div class="row">
                    <div class="field">
                        <label>MAIL_USERNAME</label>
                        <input type="text" name="MAIL_USERNAME" value="null">
                    </div>
                    <div class="field">
                        <label>MAIL_PASSWORD</label>
                        <input type="password" name="MAIL_PASSWORD">
                    </div>
                </div>
            </div>

            <button class="btn" type="submit">Installation starten</button>
        </form>

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
            Prüfe den Composer-Pfad (Standard: <code>composer</code>) oder führe
            <code>composer install --no-dev --optimize-autoloader</code> manuell per SSH aus,
            bevor du die Artisan-Befehle ausführst.
        </div>
        <?php endif; ?>

        <div class="warning">
            <strong>Wichtig: Installer jetzt löschen!</strong>
            Diese Datei enthält das Installer-Passwort und muss nach der Einrichtung
            vom Server entfernt werden:<br><code>public/install.php</code>
        </div>

    <?php endif; ?>

    </div>
</div>
</body>
</html>
