// Testdaten der Browser-E2E-Tests: Turniere (ID-Präfix `e2e-`), zusätzliche Konten mit festen Sessions und
// persönliche Live-Links. Wird vom globalen Setup geseedet und von den Tests für Erwartungen gelesen.
import { createHash } from 'node:crypto';
import { ORGANIZER_EMAIL, PLAYER_EMAIL, quote, seedStatements } from '../../scripts/lib/test-tournament-data.mjs';

export const ID_PREFIX = 'e2e-';
const FAR_FUTURE = '2099-01-01T00:00:00.000Z';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// Gleiches Passwort wie ptm-user (Hash wird beim Seed übernommen); angemeldet wird über die festen Sessions.
export const ACCOUNTS = {
  spieler1: { id: 'e2e-user-spieler-1', email: 'e2e-spieler-1@example.test', first_name: 'Erika', last_name: 'Eins', session: 'e2e-session-spieler-1' },
  spieler2: { id: 'e2e-user-spieler-2', email: 'e2e-spieler-2@example.test', first_name: 'Zora', last_name: 'Zwei', session: 'e2e-session-spieler-2' },
  spieler3: { id: 'e2e-user-spieler-3', email: 'e2e-spieler-3@example.test', first_name: 'Dora', last_name: 'Drei', session: 'e2e-session-spieler-3' },
  fremd: { id: 'e2e-user-fremd', email: 'e2e-fremd@example.test', first_name: 'Fritz', last_name: 'Fremd', session: 'e2e-session-fremd' },
};
export const ORGANIZER = { email: ORGANIZER_EMAIL, session: 'e2e-session-turnierleitung' };

// Ein Konto je Meldung im Turnier „meldungen“: So kann gezielt ein Spieler aus Team A oder Team B melden.
const MELDER_NAMEN = ['Ada', 'Ben', 'Cleo', 'Dario', 'Eva', 'Fynn', 'Greta', 'Hugo', 'Ida', 'Jona', 'Kim', 'Lea'];
export const MELDER = MELDER_NAMEN.map((name, index) => ({
  id: `e2e-user-melder-${index + 1}`, email: `e2e-melder-${index + 1}@example.test`, first_name: name, last_name: 'Melder',
  session: `e2e-session-melder-${index + 1}`,
}));

const registered = { 1: ACCOUNTS.spieler1, 2: ACCOUNTS.spieler2, 3: ACCOUNTS.spieler3 };

// liveTokens: Meldungsnummern mit persönlichem Live-Link (Meldung 1 = registriertes Konto, Rest anonym).
export const TOURNAMENTS = {
  supermelee: { id: 'e2e-supermelee', name: 'E2E Supermêlée Triplette', type: 'rangliste', formation: 'triplette', registrationType: 'supermelee', count: 18, accounts: registered, liveTokens: [1, 4, 5] },
  rechte: { id: 'e2e-rechte', name: 'E2E Rechte und Konflikte', type: 'rangliste', formation: 'triplette', registrationType: 'supermelee', count: 12, accounts: registered, liveTokens: [1, 4] },
  meldungen: { id: 'e2e-meldungen', name: 'E2E Ergebnismeldungen', type: 'rangliste', formation: 'triplette', registrationType: 'supermelee', count: 12, accounts: Object.fromEntries(MELDER.map((account, index) => [index + 1, account])), liveTokens: [] },
  ohneLive: { id: 'e2e-ohne-live', name: 'E2E Ohne Live-Ansicht', type: 'rangliste', formation: 'triplette', registrationType: 'supermelee', count: 12, accounts: registered, liveTokens: [4], liveViewEnabled: false, playerResultReportingEnabled: false },
  teilnahme: { id: 'e2e-teilnahme', name: 'E2E Teilnahme Supermêlée', type: 'rangliste', formation: 'triplette', registrationType: 'supermelee', count: 17, accounts: registered, liveTokens: [4] },
  melee: { id: 'e2e-melee', name: 'E2E Mêlée Schweizer Doublette', type: 'schweizer', formation: 'doublette', registrationType: 'melee', count: 16, accounts: registered, liveTokens: [4] },
  schweizer: { id: 'e2e-schweizer', name: 'E2E Schweizer Doublette', type: 'schweizer', formation: 'doublette', registrationType: 'forme', count: 8, accounts: registered, liveTokens: [4] },
  formuleX: { id: 'e2e-formule-x', name: 'E2E Formule X Triplette', type: 'formule_x', formation: 'triplette', registrationType: 'forme', count: 8, accounts: registered, liveTokens: [4] },
  ko: { id: 'e2e-ko', name: 'E2E KO Tête', type: 'ko', formation: 'tete', registrationType: 'forme', count: 8, accounts: registered, liveTokens: [4] },
  jgj: { id: 'e2e-jgj', name: 'E2E Jeder gegen jeden Doublette', type: 'jeder_gegen_jeden', formation: 'doublette', registrationType: 'forme', count: 4, accounts: registered, liveTokens: [4] },
};

export const registrationId = (tournament, number) => `${tournament.id}-r${String(number).padStart(3, '0')}`;
export const liveToken = (tournament, number) => sha256(`e2e-live-${tournament.id}-${number}`);

export function e2eSeedStatements({ organizer, today }) {
  const now = new Date().toISOString();
  const accounts = [...Object.values(ACCOUNTS), ...MELDER];
  return [
    // Konten mit dem Passwort-Hash von ptm-user, damit sie sich bei Bedarf auch über das Formular anmelden können.
    ...accounts.map((account) => `INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash,
        email_verified_at, created_at, updated_at)
      SELECT ${quote(account.id)}, ${quote(account.email)}, ${quote(account.first_name)}, ${quote(account.last_name)}, 'user',
        password_salt, password_hash, ${quote(now)}, ${quote(now)}, ${quote(now)} FROM users WHERE email = ${quote(PLAYER_EMAIL)}
      ON CONFLICT(email) DO UPDATE SET password_salt = excluded.password_salt, password_hash = excluded.password_hash;`),
    "DELETE FROM sessions WHERE id LIKE 'e2e-session-%';",
    `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (${quote(ORGANIZER.session)}, ${quote(organizer.id)}, '${FAR_FUTURE}', ${quote(now)});`,
    ...accounts.map((account) => `INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (${quote(account.session)}, ${quote(account.id)}, '${FAR_FUTURE}', ${quote(now)});`),
    ...seedStatements({
      tournaments: Object.values(TOURNAMENTS).map((tournament) => ({
        ...tournament,
        liveTokenHashes: Object.fromEntries(tournament.liveTokens.map((number) => [number, sha256(liveToken(tournament, number))])),
      })),
      idPrefix: ID_PREFIX, organizer, today, now,
    }),
  ];
}
