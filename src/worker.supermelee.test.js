// @vitest-environment node
// Supermêlée online: Setzpositionen trennen Spieler bei der Auslosung, Fehlrunden zählen in der Rangliste 0:13
// (Hauptprojekt-Standard).
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { computeTournamentRanking, generateTournamentRound, getTournamentById } from './worker.js';

describe('Supermêlée online', () => {
  let db;
  const turnier = () => getTournamentById(db, 't1');
  const spieler = (count, from = 1, seed = () => null) => {
    for (let index = from; index < from + count; index += 1) {
      db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, seeding_position, registered_at, created_at, updated_at)
        VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', 'active', ?, ?, ?, ?)`)
        .run(`p${index}`, `Spieler ${index}`, `p${index}@example.test`, seed(index), `2026-10-16T10:${String(index).padStart(2, '0')}:00Z`, '2026-10-16', '2026-10-16');
    }
  };

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 's', 'h', '2026-10-16', '2026-10-16')`);
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, registration_type, status, visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Supermêlée', '2026-10-16', 'Ort', 'rangliste', 'doublette', 'supermelee', 'running', 'public', '2026-10-16', '2026-10-16')`).run();
  });

  it('setzt Spieler mit gleicher Setzposition nicht ins selbe Team', async () => {
    spieler(8, 1, (index) => (index <= 4 ? 1 : null));
    await generateTournamentRound(db, await turnier());
    const seeded = new Set(['p1', 'p2', 'p3', 'p4']);
    for (const row of db.sqlite.prepare('SELECT team_a_registration_ids, team_b_registration_ids FROM tournament_matches').all()) {
      for (const team of [JSON.parse(row.team_a_registration_ids), JSON.parse(row.team_b_registration_ids)]) {
        expect(team.filter((id) => seeded.has(id)).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('wertet Nachzügler für verpasste Runden mit 0:13 und führt sie in der Rangliste', async () => {
    spieler(8);
    await generateTournamentRound(db, await turnier());
    db.sqlite.prepare('UPDATE tournament_matches SET score_a = 13, score_b = 7').run();
    spieler(4, 9);
    const ranking = await computeTournamentRanking(db, await turnier());
    expect(ranking).toHaveLength(12);
    expect(ranking.find((entry) => entry.playerId === 'p9')).toMatchObject({ wins: 0, gameDiff: -1, pointsFor: 0, pointsAgainst: 13 });
  });
});
