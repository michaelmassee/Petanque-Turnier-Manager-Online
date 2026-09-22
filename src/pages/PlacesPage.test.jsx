import { describe, expect, it } from 'vitest';
import { filterPlaces, groupMapPlaces } from './PlacesPage.jsx';

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
});
