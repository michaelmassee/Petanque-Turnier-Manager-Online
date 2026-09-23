import { describe, expect, it } from 'vitest';
import { filterPlaces, groupMapPlaces, groupPlacesByOrganization } from './PlacesPage.jsx';

describe('Kartenmarker für Bouleplätze', () => {
  it('fasst Platz und Halle eines Vereins an derselben Adresse zusammen', () => {
    const groups = groupMapPlaces([
      { id: 'outdoor', clubId: 'club-1', address: 'Parkweg 1, Linden', venueType: 'outdoor' },
      { id: 'indoor', clubId: 'club-1', address: ' parkweg 1, linden ', venueType: 'indoor' },
      { id: 'other-address', clubId: 'club-1', address: 'Hallenweg 2, Linden', venueType: 'indoor' },
      { id: 'independent', clubId: null, address: 'Parkweg 1, Linden', venueType: 'outdoor' },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.place.id === 'outdoor')?.places.map((place) => place.id)).toEqual(['outdoor', 'indoor']);
  });

  it('filtert Vereine und Boulehallen auch kombiniert', () => {
    const places = [
      { id: 'club-place', clubId: 'club-1', venueType: 'outdoor' },
      { id: 'club-hall', clubId: 'club-1', venueType: 'indoor' },
      { id: 'independent-hall', clubId: null, venueType: 'indoor' },
    ];

    expect(filterPlaces(places, { clubsOnly: true }).map((place) => place.id)).toEqual(['club-place', 'club-hall']);
    expect(filterPlaces(places, { indoorOnly: true }).map((place) => place.id)).toEqual(['club-hall', 'independent-hall']);
    expect(filterPlaces(places, { clubsOnly: true, indoorOnly: true }).map((place) => place.id)).toEqual(['club-hall']);
  });

  it('behandelt einen vorhandenen Vereinsnamen auch ohne Organisations-ID als Verein', () => {
    const place = { id: 'legacy-club-place', clubId: null, clubName: 'Boules Brothers Ostheim', address: 'Limesstraße 10-12, Ostheim', venueType: 'outdoor' };

    expect(filterPlaces([place], { clubsOnly: true })).toEqual([place]);
    expect(groupMapPlaces([place])[0].id).toBe('club:boules brothers ostheim:limesstraße 10-12, ostheim');
  });

  it('fasst die Plätze eines Vereins unabhängig von ihren Adressen in einem Listenbereich zusammen', () => {
    const groups = groupPlacesByOrganization([
      { id: 'outdoor', clubId: 'club-1', clubName: 'BC Linden', address: 'Parkweg 1, Linden' },
      { id: 'indoor', clubId: 'club-1', clubName: 'BC Linden', address: 'Hallenweg 2, Linden' },
      { id: 'independent', clubId: null, clubName: null, address: 'Dorfplatz 3, Linden' },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ clubName: 'BC Linden', places: [{ id: 'outdoor' }, { id: 'indoor' }] });
    expect(groups[1]).toMatchObject({ clubName: null, places: [{ id: 'independent' }] });
  });
});
