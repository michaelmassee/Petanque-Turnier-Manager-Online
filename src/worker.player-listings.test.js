import { describe, expect, it, vi } from 'vitest';
import { deletePlayerListingsOfFinishedTournaments, playerListingInput, toPublicPlayerListing } from './worker.js';

// Minimaler D1-Ersatz: merkt sich SQL und Parameter, liefert für first() das vorgegebene Ergebnis.
function fakeDb(firstResult = null) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, params: [] };
      calls.push(call);
      const statement = {
        bind: (...params) => { call.params = params; return statement; },
        first: async () => firstResult,
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
      };
      return statement;
    },
  };
}

const row = {
  id: 'l-1', user_id: 'u-1', type: 'tournament', title: 'Suche Schießer', description: null,
  location_name: 'Boulodrome Nord', latitude: 51.2, longitude: 6.8, event_date: '2099-05-01',
  playing_position: 'schiesser', tournament_id: 't-1', linked_tournament_name: 'Frühjahrs-Cup',
  delete_when_tournament_finished: 1, owner_first_name: 'Anna', owner_last_name: 'B',
  created_at: '2026-01-01', updated_at: '2026-01-01',
};

describe('Mitspielgesuche mit Turnierverknüpfung', () => {
  it('liefert Turnier-ID und -Namen eines öffentlichen verknüpften Turniers', () => {
    expect(toPublicPlayerListing(row, true)).toMatchObject({ tournamentId: 't-1', tournamentName: 'Frühjahrs-Cup', deleteWhenTournamentFinished: true, ownerName: 'Anna B', userId: 'u-1' });
  });

  it('verbirgt den Verweis, wenn das Turnier nicht (mehr) öffentlich ist', () => {
    expect(toPublicPlayerListing({ ...row, linked_tournament_name: null }, true)).toMatchObject({ tournamentId: null, tournamentName: null });
  });

  it('zeigt Gästen das Gesuch anonymisiert', () => {
    const listing = toPublicPlayerListing(row, false);
    expect(listing).not.toHaveProperty('ownerName');
    expect(listing).not.toHaveProperty('userId');
    expect(listing.tournamentName).toBe('Frühjahrs-Cup');
  });

  it('übernimmt die abgeschaltete Löschoption', () => {
    expect(toPublicPlayerListing({ ...row, delete_when_tournament_finished: 0 }, true).deleteWhenTournamentFinished).toBe(false);
  });

  it('lehnt ein unbekanntes oder nicht öffentliches Turnier ab, bevor geocodiert wird', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const db = fakeDb(null);

    await expect(playerListingInput(db, { type: 'tournament', title: 'Suche', locationName: 'Düsseldorf', tournamentId: 't-privat' }, 'DE'))
      .rejects.toMatchObject({ status: 400, message: 'Turnier nicht gefunden' });
    expect(db.calls[0].sql).toContain("visibility = 'public'");
    expect(db.calls[0].params).toEqual(['t-privat']);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('übernimmt Datum und Koordinaten des Turniers ohne erneutes Geocoding', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const db = fakeDb({ id: 't-1', date: '2099-05-01', latitude: 51.2, longitude: 6.8 });

    const input = await playerListingInput(db, { type: 'tournament', title: 'Suche', locationName: 'Boulodrome Nord', eventDate: '2000-01-01', tournamentId: 't-1', deleteWhenTournamentFinished: false }, 'DE');

    expect(input).toMatchObject({ tournamentId: 't-1', eventDate: '2099-05-01', latitude: 51.2, longitude: 6.8, deleteWhenTournamentFinished: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('löscht per Cron nur Gesuche mit aktiver Option zu beendeten Turnieren', async () => {
    const db = fakeDb();

    await deletePlayerListingsOfFinishedTournaments(db);

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].sql).toMatch(/DELETE FROM player_listings/);
    expect(db.calls[0].sql).toMatch(/delete_when_tournament_finished = 1/);
    expect(db.calls[0].sql).toMatch(/status = 'finished'/);
  });
});
