import { describe, expect, it } from 'vitest';
import { clusterPlaceCount } from './MarkerClusterGroup.jsx';

describe('clusterPlaceCount', () => {
  it('zählt Plätze statt Marker, ein Marker ohne Angabe zählt als einer', () => {
    expect(clusterPlaceCount([{ options: { placeCount: 2 } }, { options: { placeCount: 1 } }, { options: {} }])).toBe(4);
  });
});
