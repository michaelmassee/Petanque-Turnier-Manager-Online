# Petanque Turnier Manager Online

Eine webbasierte Turnierverwaltung für Pétanque-Turniere, gebaut mit Laravel, Livewire und Tailwind CSS.

## Technologie-Stack

- **Backend:** PHP 8.3, Laravel 13, Livewire 3, Volt
- **Frontend:** Tailwind CSS v4, Vite
- **Datenbank:** SQLite (lokal) / MySQL (Produktion)
- **Auth:** Laravel Breeze
- **Build:** Gradle (Deployment), npm (Assets)

## Lokale Entwicklung

### Voraussetzungen

- PHP 8.3+
- Composer
- Node.js + npm
- SQLite

### Installation

```bash
git clone git@github.com:michaelmassee/Petanque-Turnier-Manager-Online.git
cd Petanque-Turnier-Manager-Online

composer install
npm install

cp .env.example .env
php artisan key:generate
php artisan migrate --seed

./gradlew localDev
```

Die Anwendung ist dann unter `http://localhost:8000` erreichbar. Der Gradle-Task startet Laravel und Vite gemeinsam; Aenderungen an Blade-, CSS- und JavaScript-Dateien werden automatisch im Browser aktualisiert. Stoppen mit `Ctrl+C`.

### Lokaler Test-Admin

Nur fuer lokale Entwicklung und Tests wird beim Seeding ein Admin-User aus `.env` angelegt:

```ini
LOCAL_ADMIN_NAME=Admin
LOCAL_ADMIN_EMAIL=admin@ptm.de
LOCAL_ADMIN_PASSWORD=password
```

Aktualisieren:

```bash
php artisan db:seed
```

Der Seeder ignoriert diese Werte in Produktion und laeuft nur fuer `APP_ENV=local` oder `APP_ENV=testing`.

### Rollen und Freigabe

Das System kennt drei Rollen. Ein Benutzer kann mehrere Rollen gleichzeitig haben:

| Rolle | Rechte |
|---|---|
| `admin` | Kann alle Turniere verwalten und Turnierverwalter freigeben. |
| `turnierverwalter` | Kann nach E-Mail-Bestaetigung und Admin-Freigabe eigene Turniere erstellen und verwalten. |
| `teilnehmer` | Basisrolle fuer registrierte Benutzer. Sie gibt keinen Zugriff auf den Verwaltungsbereich. |

Neue Registrierungen erhalten automatisch die Rollen `teilnehmer` und `turnierverwalter`, sind aber erst nach zwei Schritten im Verwaltungsbereich aktiv:

1. E-Mail-Adresse ueber den zugesendeten Link bestaetigen.
2. Admin gibt den Benutzer unter `Admin > Benutzerfreigaben` frei.

Nicht freigegebene Benutzer sehen nach der E-Mail-Bestaetigung eine Warteseite. Turnierverwalter koennen ausschliesslich Turniere verwalten, bei denen `created_by` auf ihren eigenen Benutzer zeigt.

Beim Erstellen oder Bearbeiten eines Turniers kann der Turnierverwalter ausser Vorname und Nachname festlegen:

- welche weiteren Felder fuer die Anmeldung Pflicht sind (`Verein`, `Lizenznummer`, `Teamname`, E-Mail fuer Spieler 2 und 3)
- ob Teilnehmer nach der Anmeldung manuell bestaetigt werden muessen

Teilnehmer-Anmeldungen selbst werden nicht per E-Mail verifiziert. Wenn die manuelle Bestaetigung deaktiviert ist, werden Anmeldungen direkt auf `confirmed` gesetzt. Wenn sie aktiviert ist, landen neue Anmeldungen auf `pending` und muessen vom Turnierverwalter bestaetigt werden.

## URLs

### Lokal

| Zweck | URL |
|---|---|
| Anwendung | `http://localhost:8000` |

### Produktion

Aktuelle Hosting-Installation:

| Zweck | URL |
|---|---|
| Anwendung | `http://ptmonline.bc-linden.de/` |
| Deutsch | `http://ptmonline.bc-linden.de/de` |
| Englisch | `http://ptmonline.bc-linden.de/en` |
| Franzoesisch | `http://ptmonline.bc-linden.de/fr` |
| Niederlaendisch | `http://ptmonline.bc-linden.de/nl` |
| Spanisch | `http://ptmonline.bc-linden.de/es` |
| Login | `http://ptmonline.bc-linden.de/login` |
| Admin-Dashboard | `http://ptmonline.bc-linden.de/admin` |
| Admin-Turniere | `http://ptmonline.bc-linden.de/admin/tournaments` |
| Profil | `http://ptmonline.bc-linden.de/profile` |
| Installer | `http://ptmonline.bc-linden.de/install.php` |

Nach erfolgreicher Installation muss `public/install.php` auf dem Server geloescht oder gesperrt werden.

### Laravel-DocumentRoot

Die Produktion ist als Standard-Laravel-Hosting eingerichtet: Die Domain zeigt direkt auf das Projektverzeichnis `public/`. Sichtbare URLs enthalten deshalb kein `/public`:

```text
DocumentRoot: /pfad/zum/projekt/public
URL:          https://deine-domain.example.com/login
```

Wichtig: Die Domain darf nicht auf das Projektwurzelverzeichnis zeigen und die App ueber `/public/...` ausliefern:

```text
DocumentRoot: /pfad/zum/projekt
URL:          https://deine-domain.example.com/public/login
```

Das ist nicht Laravel-Standard und kann Redirects, Livewire-Endpunkte, Asset-URLs und die Sicherheit der Laravel-Dateistruktur stoeren. Sensible Dateien wie `.env`, `storage/`, `vendor/`, `app/` und `config/` duerfen nicht direkt im Webroot liegen.

Wenn nach einem Hosting-Wechsel wieder `/public` in sichtbaren URLs auftaucht, muss die Domain/Subdomain im Hosting erneut auf `public/` gesetzt werden. Im Code soll dafuer keine Root-`.htaccess` und kein `URL::forceRootUrl(...)`-Workaround verwendet werden.

## Tests

```bash
./gradlew localTest
```

Der Gradle-Task prueft lokal die PHP-Syntax, baut die Frontend-Assets und fuehrt Laravel/PHPUnit-Tests aus, wenn die Dev-Abhaengigkeiten lokal installiert sind. Fehlt `vendor/bin/phpunit`, werden die PHPUnit-Tests uebersprungen; dann bei Bedarf zuerst `composer install` ohne `--no-dev` ausfuehren.

## Deployment per SFTP

Das Projekt verwendet Gradle als Deployment-Tool.

### Vorbereitung

```bash
cp gradle.properties.example gradle.properties
# gradle.properties bearbeiten und Zugangsdaten eintragen
```

`gradle.properties` ist in `.gitignore` und wird nicht eingecheckt.

#### Protokoll wählen: SFTP oder FTP

In `gradle.properties` den Schalter `deployProtocol` setzen:

| Wert | Port | Verhalten |
|---|---|---|
| `sftp` | 22 | Dateien hochladen |
| `ftp` | 21 | Dateien hochladen |

```properties
# SFTP (Standard, empfohlen)
deployProtocol=sftp
remoteHost=mein-server.example.com
remotePort=22
remoteUser=deploy
remotePassword=geheimes-passwort
installerPassword=langes-zufaelliges-installer-passwort
installerAppUrl=https://meine-domain.example.com
installerDbConnection=mysql
installerDbHost=127.0.0.1
installerDbPort=3306
installerDbDatabase=petanque
installerDbUsername=dbuser
installerDbPassword=geheimes-db-passwort
installerAdminName=Administrator
installerAdminEmail=admin@example.com
installerAdminPassword=langes-admin-passwort
remotePath=/var/www/html/petanque-turnier

# FTP
deployProtocol=ftp
remoteHost=mein-server.example.com
remotePort=21
remoteUser=deploy
remotePassword=geheimes-passwort
installerPassword=langes-zufaelliges-installer-passwort
installerAppUrl=https://meine-domain.example.com
installerDbConnection=mysql
installerDbHost=127.0.0.1
installerDbPort=3306
installerDbDatabase=petanque
installerDbUsername=dbuser
installerDbPassword=geheimes-db-passwort
installerAdminName=Administrator
installerAdminEmail=admin@example.com
installerAdminPassword=langes-admin-passwort
remotePath=/var/www/html/petanque-turnier
```

Der `deploy`-Task führt keine Remote-Befehle aus. Nach dem Upload erfolgt die Einrichtung über `https://<deine-domain>/install.php`.
Das Installer-Passwort kommt aus `installerPassword` in der lokalen `gradle.properties`; im Repository steht nur ein Platzhalter.
Optionale `installer...`-Werte aus `gradle.properties` werden als Defaultwerte in das Installer-Formular eingetragen.
Der Admin-Zugang wird im Installer über `installerAdminName`, `installerAdminEmail` und `installerAdminPassword` vorbelegt und nach der Migration angelegt oder aktualisiert.

Admin-Login nach der Installation:

| Einstellung | Quelle |
|---|---|
| Name | `installerAdminName` in `gradle.properties` oder Eingabe im Installer |
| E-Mail | `installerAdminEmail` in `gradle.properties` oder Eingabe im Installer |
| Passwort | `installerAdminPassword` in `gradle.properties` oder Eingabe im Installer |

Der alte Test-User `test@example.com` / `password` wird nicht mehr automatisch angelegt.

### Datenbank auf dem Server einrichten (Erstinstallation)

Der `deploy`-Task baut Assets und Composer-Abhängigkeiten lokal und lädt `vendor/` als mehrere Vendor-Archive hoch. `.env`-Erstellung, Entpacken der Vendor-Archive, App-Key und Migrationen werden danach über den Web-Installer ausgeführt.

Damit die Installation funktioniert, muss `public/install.php` nach dem Upload im Browser erreichbar sein.

#### Schritt 1 – Anwendung hochladen

```bash
./gradlew deploy
```

#### Schritt 2 – Datenbankverbindung konfigurieren

Im Browser `https://<deine-domain>/install.php` öffnen und die Datenbankzugangsdaten eintragen:

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://meine-domain.example.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=petanque
DB_USERNAME=dbuser
DB_PASSWORD=geheimes-passwort
```

#### Schritt 3 – Installer entfernen

Nach erfolgreicher Installation `public/install.php` auf dem Server löschen oder den Zugriff darauf sperren.

#### Konfigurationsstellen im Überblick

| Datei | Wo | Zweck |
|---|---|---|
| `gradle.properties` | lokal (nicht eingecheckt) | Protokoll, Zugangsdaten, Remote-Pfad |
| `.env` auf dem Server | Wird von `install.php` erstellt | DB-Zugangsdaten, App-Key, URL |
| `.env.example` | Repository | Vorlage mit allen verfügbaren Variablen |

### Deployment-Tasks

| Task | Beschreibung |
|---|---|
| `./gradlew localDev` | Lokale Entwicklung starten: Laravel-Server plus Vite-Live-Reload |
| `./gradlew localTest` | Lokale Checks: PHP-Syntax, PHPUnit falls installiert, Frontend-Build |
| `./gradlew buildAssets` | Frontend-Assets kompilieren (Vite) |
| `./gradlew composerInstall` | Composer-Pakete für Produktion installieren |
| `./gradlew deploy` | Vollständiger Upload per SFTP oder FTP; Installation über `install.php` |
| `./gradlew deployAssets` | Nur `public/build` hochladen (schnelles CSS/JS-Update) |

```bash
# Vollständiges Deployment
./gradlew deploy

# Nur Frontend-Assets aktualisieren
./gradlew deployAssets
```

## Lizenz

[European Union Public Licence v. 1.2 (EUPL-1.2)](LICENSE)
