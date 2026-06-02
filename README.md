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

npm run dev
php artisan serve
```

Die Anwendung ist dann unter `http://localhost:8000` erreichbar.

## Tests

```bash
php artisan test
```

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
remotePath=/var/www/html/petanque-turnier
```

Der `deploy`-Task führt keine Remote-Befehle aus. Nach dem Upload erfolgt die Einrichtung über `https://<deine-domain>/install.php`.
Das Installer-Passwort kommt aus `installerPassword` in der lokalen `gradle.properties`; im Repository steht nur ein Platzhalter.
Optionale `installer...`-Werte aus `gradle.properties` werden als Defaultwerte in das Installer-Formular eingetragen.

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
