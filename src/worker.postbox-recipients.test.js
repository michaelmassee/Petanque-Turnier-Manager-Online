import { describe, expect, it } from 'vitest';
import { listPostboxRecipients } from './worker.js';

function recipientsDb() {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      queries.push(sql);
      return {
        bind() {
          return {
            all: async () => (sql.includes('FROM users')
              ? { results: [{ id: 'recipient-1', first_name: 'Ada', last_name: 'Beispiel', role: 'user' }] }
              : { results: [{ id: 'tournament-1', name: 'Herbstturnier', date: '2026-10-06', registration_count: 2 }] }),
          };
        },
      };
    },
  };
}

describe('Postbox-Empfänger für Turnier-Broadcasts', () => {
  it('liefert Turnierdatum und nur offene oder bestätigte Meldungen als Anzahl', async () => {
    const db = recipientsDb();

    const response = await listPostboxRecipients(db, 'organizer-1');

    await expect(response.json()).resolves.toEqual({
      recipients: [{ id: 'recipient-1', firstName: 'Ada', lastName: 'Beispiel', role: 'user' }],
      tournaments: [{ id: 'tournament-1', name: 'Herbstturnier', date: '2026-10-06', registrationCount: 2 }],
    });
    expect(db.queries[1]).toContain("r.status IN ('pending', 'confirmed')");
    expect(db.queries[1]).toContain('COUNT(r.id) AS registration_count');
  });
});
