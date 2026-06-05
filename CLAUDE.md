# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Überblick

Webbasierte Turnierverwaltung für Pétanque-Turniere. Laravel 13 + Livewire 3 + Volt, Tailwind CSS v4 über Vite, PHP 8.3. SQLite lokal, MySQL in Produktion. UI und Inhalte sind mehrsprachig (de, en, fr, nl, es).

Besonderheit: **Gradle ist der zentrale Orchestrator** für Entwicklung, Tests und Deployment — nicht nur ein Build-Tool. Composer/npm/artisan werden meist über Gradle-Tasks aufgerufen.

## Häufige Befehle

```bash
./gradlew localDev      # Laravel-Server + Vite mit Live-Reload (http://localhost:8000)
./gradlew localTest     # PHP-Syntaxcheck (php -l) über alle Dateien + buildAssets + PHPUnit
./gradlew buildAssets   # Nur Vite-Build
./gradlew deploy        # Vollständiges SFTP/FTP-Deployment (Setup danach via install.php)
./gradlew deployAssets  # Nur public/build hochladen (schnelles CSS/JS-Update)
```

Tests direkt (umgeht Gradle, schneller bei Iteration):

```bash
php artisan test                                   # alle Tests
php artisan test --filter=PublicRegistrationTest   # eine Testklasse
php artisan test tests/Feature/AdminAccessTest.php # eine Datei
vendor/bin/pint                                    # Code-Style (Laravel Pint)
```

Tests laufen gegen In-Memory-SQLite (`phpunit.xml`); keine lokale DB nötig. `./gradlew localTest` überspringt PHPUnit still, wenn `vendor/bin/phpunit` fehlt (Prod-`composer install --no-dev`) — dann `composer install` ohne `--no-dev`.

## Architektur

### Mehrsprachiges Routing (zentrale Eigenheit)
Öffentliche Routen haben ein **verpflichtendes** Sprachpräfix (`/de`, `/en`, `/fr`, `/nl`, `/es`) — kein optionales Präfix. `routes/web.php` erzeugt die Routen in einer `foreach`-Schleife pro Locale; Routennamen folgen dem Muster `public.{locale}.tournaments.show`. Beim Verlinken im Code **immer den Helper `lroute('tournaments.show', $t)`** (aus `app/helpers.php`) verwenden — er löst das aktuelle Locale auf. `public_locale_route($locale, ...)` für explizites Locale (Sprachumschalter). `/` leitet auf das Browser-Sprach-Locale weiter. `SetLocale`-Middleware setzt `App::setLocale()` aus dem ersten URL-Segment.

Der **Admin-Bereich (`/admin`) und Auth sind bewusst ohne Sprachpräfix.** Beim Hinzufügen von Routen diese Trennung beibehalten.

### Rollen & Freigabe
User haben ein `roles`-Array (Cast, kein Pivot): `admin`, `turnierverwalter`, `teilnehmer` (Konstanten + Helper in `app/Models/User.php`). Neuregistrierungen bekommen `teilnehmer` + `turnierverwalter`, sind aber erst nutzbar nach (1) E-Mail-Bestätigung und (2) Admin-Freigabe (`approved_at`). Die `approved`-Middleware (`EnsureUserApproved`, Alias in `bootstrap/app.php`) schützt `/admin` und leitet nicht freigegebene User auf `approval.pending`. Turnierverwalter dürfen nur eigene Turniere verwalten (`Tournament.created_by`). Admins sind immer freigegeben.

### Modelle
`Tournament`, `Registration`, `Result` nutzen **ULIDs** (`HasUlids`), nicht Auto-Increment. Domänenlogik liegt in den Modellen, nicht in Services (`app/Services` ist leer): z. B. `Tournament::isRegistrationOpen()`, `requiresManualConfirmation()`. Turnier-Konfiguration (Pflicht-Anmeldefelder, manuelle Bestätigung) steckt in der JSON-Spalte `config` und wird über `requiredRegistrationFields()` / `requiresRegistrationField()` gelesen. Enums in `app/Enums` (`TournamentType` mit 14 Spielsystemen, `Formation`, `TournamentStatus`, `RegistrationStatus`) sind als Model-Casts gebunden; `->label()` löst Übersetzungsstrings auf.

### Drei Eingangsbereiche
- **Public** (`Http/Controllers/Public`): Turnierliste, Anmeldung, Anmeldungsstornierung per Token.
- **Admin** (`Http/Controllers/Admin`): Turnier-, Anmeldungs- und Benutzerverwaltung.
- **API** (`Http/Controllers/Api`, `routes/api.php`, Präfix `/api/v1`): Endpunkt für eine externe Turnier-Engine, die Ergebnisse pusht. **Auth über Bearer-Token = `Tournament.api_token`** (siehe `findTournamentByToken` in `ResultApiController`), nicht über Sanctum/Sessions. Exceptions im API-Pfad werden als JSON gerendert.

Livewire/Volt-Komponenten liegen unter `resources/views/livewire`; klassische Blade-Views unter `resources/views/{public,admin,auth,...}`. `app/Livewire` enthält nur Auth-Helfer (Breeze).

## Deployment-Modell
Kein Server-seitiges Composer/Migration. `./gradlew deploy` baut Assets + Vendor lokal, lädt mehrere Vendor-ZIP-Archive per SFTP/FTP hoch; die eigentliche Einrichtung (`.env`, App-Key, Migrationen, Admin-User) erfolgt über den **Web-Installer `public/install.php`**, der nach der Installation gelöscht/gesperrt werden muss. Deploy-Zugangsdaten und Installer-Defaults stehen in `gradle.properties` (gitignored; Vorlage: `gradle.properties.example`). Weitere Remote-Tasks im `build.gradle` (z. B. `clearRemoteLaravelCache`, `fetchRemoteLaravelLog`, `fixRemotePermissions`).

**Hosting-Annahme:** Die Domain zeigt direkt auf `public/`. Niemals eine Root-`.htaccess` oder `URL::forceRootUrl(...)` einbauen, um ein `/public`-Präfix in URLs zu umgehen — stattdessen den DocumentRoot im Hosting korrigieren.

## Konventionen
- Antworten und Commit-Sprache: Deutsch. Deutsche Texte gehören in die `lang/`-Dateien (nie hartkodiert in Blade/PHP); im UI über `__('tournaments.type.…')`.
- Lokaler Seed-Admin (nur `APP_ENV=local`/`testing`) kommt aus `LOCAL_ADMIN_*` in `.env` über den `DatabaseSeeder`.
