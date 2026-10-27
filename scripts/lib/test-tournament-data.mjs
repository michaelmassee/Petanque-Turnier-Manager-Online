// Testturnier-Daten für die lokale D1: genutzt vom manuellen Seed (scripts/seed-test-tournaments.mjs) und von den
// Browser-E2E-Tests (e2e/). Erzeugt nur SQL, ausgeführt wird es vom Aufrufer.
import { execFileSync } from 'node:child_process';

export const TOURNAMENTS = [
  { id: 'testturnier-schweizer', name: 'TEST Schweizer Doublette', type: 'schweizer', formation: 'doublette', registrationType: 'forme', count: 70 },
  { id: 'testturnier-formule-x', name: 'TEST Formule X Triplette', type: 'formule_x', formation: 'triplette', registrationType: 'forme', count: 70 },
  { id: 'testturnier-ko', name: 'TEST KO Tête', type: 'ko', formation: 'tete', registrationType: 'forme', count: 70 },
  { id: 'testturnier-jgj', name: 'TEST Jeder gegen jeden Doublette', type: 'jeder_gegen_jeden', formation: 'doublette', registrationType: 'forme', count: 8 },
  { id: 'testturnier-melee', name: 'TEST Mêlée Schweizer Doublette', type: 'schweizer', formation: 'doublette', registrationType: 'melee', count: 70 },
  { id: 'testturnier-supermelee', name: 'TEST Supermêlée Triplette', type: 'rangliste', formation: 'triplette', registrationType: 'supermelee', count: 70 },
];

const FIRST_NAMES = ['Anna', 'Bernd', 'Claire', 'Dieter', 'Elif', 'Frank', 'Gisela', 'Hans', 'Ines', 'Jean', 'Karin', 'Lukas',
  'Marie', 'Nico', 'Olga', 'Pierre', 'Rita', 'Stefan', 'Tanja', 'Uwe', 'Vera', 'Walter', 'Yvonne', 'Zeynep'];
const LAST_NAMES = ['Adler', 'Becker', 'Dubois', 'Engel', 'Fischer', 'Garnier', 'Hoffmann', 'Jansen', 'Keller', 'Lambert',
  'Meyer', 'Neumann', 'Peters', 'Richter', 'Schulz', 'Thomas', 'Vogel', 'Wagner', 'Yilmaz', 'Zimmermann', 'Martin'];
export const CLUBS = ['Boule Club Musterstadt', 'Pétanque Freunde Nord', 'BC Rheinufer', 'Club Bouliste Süd', 'PC Am Park'];

export const TEST_USERS_SQL = '.dev.vars.test-users.sql';
export const ORGANIZER_EMAIL = 'ptm-turnierleiter@example.test';
export const PLAYER_EMAIL = 'ptm-user@example.test';

export const quote = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);

// wrangler d1 execute gegen die lokale D1; config/persistTo wählen eine eigene Konfiguration und State-Ordner (E2E).
export function localD1({ config, persistTo } = {}) {
  const base = ['wrangler', 'd1', 'execute', 'DB', '--local', ...(config ? ['-c', config] : []), ...(persistTo ? ['--persist-to', persistTo] : [])];
  const wrangler = (...args) => execFileSync('npx', [...base, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    wrangler,
    query: (sql) => JSON.parse(wrangler('--json', '--command', sql))[0].results,
    file: (path) => wrangler('--yes', '--file', path),
  };
}

function person(tournamentId, index) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return { first, last, email: `testspieler-${tournamentId.replace(/^[a-z0-9]+-/, '')}-${index + 1}@example.test`, club: CLUBS[index % CLUBS.length] };
}

// accounts: Meldungsnummer → verknüpftes Konto { id, email, first_name, last_name };
// liveTokenHashes: Meldungsnummer → SHA-256 des persönlichen Live-Links.
function registration(tournament, number, { now, accounts, liveTokenHashes }) {
  let index = (number - 1) * 3;
  const account = accounts[number];
  const own = account
    ? { first: account.first_name, last: account.last_name, email: account.email, club: CLUBS[0] }
    : person(tournament.id, index++);
  const partners = tournament.registrationType !== 'forme' ? 0 : { tete: 0, doublette: 1, triplette: 2 }[tournament.formation];
  const partner = partners >= 1 ? person(tournament.id, index++) : null;
  const partner2 = partners >= 2 ? person(tournament.id, index++) : null;
  // Aufsteigende Anmeldezeit hält die Meldeliste in Nummernreihenfolge.
  const registeredAt = new Date(Date.parse(now) - (tournament.count - number + 1) * 60_000).toISOString();
  const values = {
    id: `${tournament.id}-r${String(number).padStart(3, '0')}`,
    tournament_id: tournament.id,
    first_name: own.first,
    last_name: own.last,
    email: own.email,
    player_email: own.email,
    club: own.club,
    partner_first_name: partner?.first,
    partner_last_name: partner?.last,
    partner_email: partner?.email,
    partner_club: partner?.club,
    partner2_first_name: partner2?.first,
    partner2_last_name: partner2?.last,
    partner2_email: partner2?.email,
    partner2_club: partner2?.club,
    status: 'confirmed',
    registered_at: registeredAt,
    confirmed_at: registeredAt,
    created_at: registeredAt,
    updated_at: registeredAt,
    cancel_token: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''),
    user_id: account?.id ?? null,
    registrant_user_id: account?.id ?? null,
    live_token_hash: liveTokenHashes[number] ?? null,
  };
  return `INSERT INTO registrations (${Object.keys(values).join(', ')}) VALUES (${Object.values(values).map(quote).join(', ')});`;
}

function tournamentInsert(tournament, { organizer, today, now }) {
  const values = {
    id: tournament.id,
    owner_id: organizer.id,
    creator_id: organizer.id,
    name: tournament.name,
    date: today,
    start_time: '10:00',
    location: 'Musterstadt',
    description: 'Lokales Testturnier, angelegt von scripts/seed-test-tournaments.mjs',
    type: tournament.type,
    formation: tournament.formation,
    registration_type: tournament.registrationType,
    status: 'registration',
    visibility: 'public',
    participants_public: 1,
    live_view_enabled: tournament.liveViewEnabled === false ? 0 : 1,
    player_result_reporting_enabled: tournament.playerResultReportingEnabled === false ? 0 : 1,
    created_at: now,
    updated_at: now,
  };
  return `INSERT INTO tournaments (${Object.keys(values).join(', ')}) VALUES (${Object.values(values).map(quote).join(', ')});`;
}

// Löscht alle Turniere mit idPrefix (Meldungen, Runden, Partien und Teams per ON DELETE CASCADE) und legt
// tournaments neu im Anmeldestatus an. Pro Turnier optional accounts/liveTokenHashes (siehe registration()).
export function seedStatements({ tournaments, idPrefix, organizer, accounts = {}, today, now = new Date().toISOString() }) {
  return [
    `DELETE FROM tournaments WHERE id LIKE ${quote(`${idPrefix}%`)};`,
    ...tournaments.flatMap((tournament) => [
      tournamentInsert(tournament, { organizer, today, now }),
      ...Array.from({ length: tournament.count }, (_, index) => registration(tournament, index + 1, {
        now, accounts: tournament.accounts ?? accounts, liveTokenHashes: tournament.liveTokenHashes ?? {},
      })),
    ]),
  ];
}

export const berlinToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
