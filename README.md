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

### Deployment-Tasks

| Task | Beschreibung |
|---|---|
| `./gradlew buildAssets` | Frontend-Assets kompilieren (Vite) |
| `./gradlew composerInstall` | Composer-Pakete für Produktion installieren |
| `./gradlew deploy` | Vollständiges Deployment per SFTP |
| `./gradlew deployAssets` | Nur `public/build` hochladen (schnelles CSS/JS-Update) |

```bash
# Vollständiges Deployment
./gradlew deploy

# Nur Frontend-Assets aktualisieren
./gradlew deployAssets
```

## Lizenz

MIT
