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
| `sftp` | 22 | Dateien hochladen **und** Remote-Befehle ausführen (migrate, cache, chmod) |
| `ftp` | 21 | Nur Dateien hochladen — Remote-Befehle müssen manuell per SSH nachgeholt werden |

```properties
# SFTP (Standard, empfohlen)
deployProtocol=sftp
remoteHost=mein-server.example.com
remotePort=22
remoteUser=deploy
remotePassword=geheimes-passwort
remotePath=/var/www/html/petanque-turnier

# FTP
deployProtocol=ftp
remoteHost=mein-server.example.com
remotePort=21
remoteUser=deploy
remotePassword=geheimes-passwort
remotePath=/var/www/html/petanque-turnier
```

> **Hinweis FTP:** Da FTP keine Befehlsausführung auf dem Server ermöglicht, gibt der `deploy`-Task nach dem Upload die manuell auszuführenden Befehle aus.

### Datenbank auf dem Server einrichten (Erstinstallation)

Der `deploy`-Task überträgt den Code und führt automatisch `php artisan migrate --force` aus. Damit die Migrationen funktionieren, muss auf dem Server **vor dem ersten Deployment** eine `.env`-Datei mit den Datenbankzugangsdaten existieren.

#### Schritt 1 – `.env` auf dem Server anlegen

Die Datei `.env` wird **nicht** automatisch hochgeladen (sie enthält Secrets). Sie muss manuell auf dem Server erstellt werden, z. B. per SSH:

```bash
ssh deploy@mein-server.example.com
cp /var/www/html/petanque-turnier/.env.example \
   /var/www/html/petanque-turnier/.env
```

#### Schritt 2 – Datenbankverbindung konfigurieren

In der `.env` auf dem Server die SQLite-Standardwerte durch MySQL ersetzen:

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

#### Schritt 3 – App-Key generieren

```bash
# auf dem Server (SSH)
cd /var/www/html/petanque-turnier
php artisan key:generate
```

#### Konfigurationsstellen im Überblick

| Datei | Wo | Zweck |
|---|---|---|
| `gradle.properties` | lokal (nicht eingecheckt) | SFTP-Zugangsdaten, Remote-Pfad |
| `.env` auf dem Server | Server (nicht eingecheckt) | DB-Zugangsdaten, App-Key, URL |
| `.env.example` | Repository | Vorlage mit allen verfügbaren Variablen |

> **Hinweis:** `./gradlew deploy` führt am Ende automatisch `php artisan migrate --force` aus. Bei jedem weiteren Deployment werden neue Migrationen eingespielt, ohne dass ein manueller Eingriff nötig ist.

### Deployment-Tasks

| Task | Beschreibung |
|---|---|
| `./gradlew buildAssets` | Frontend-Assets kompilieren (Vite) |
| `./gradlew composerInstall` | Composer-Pakete für Produktion installieren |
| `./gradlew deploy` | Vollständiges Deployment per SFTP inkl. Migrationen |
| `./gradlew deployAssets` | Nur `public/build` hochladen (schnelles CSS/JS-Update) |

```bash
# Vollständiges Deployment
./gradlew deploy

# Nur Frontend-Assets aktualisieren
./gradlew deployAssets
```

## Lizenz

[European Union Public Licence v. 1.2 (EUPL-1.2)](LICENSE)
