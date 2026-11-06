import { describe, expect, it } from 'vitest';
import type { Airport } from '../map/airports';
import { CHOKEPOINTS } from '../state/chokepoints';
import { searchPalette } from '../state/paletteSearch';
import { placeTarget } from './places';

const cork: Airport = { code: 'EICK', iata: 'ORK', name: 'Cork Airport', city: 'Cork', country: 'IE', lat: 51.8413, lon: -8.4911, size: 1 };

describe('places', () => {
  it('flies to an airport close enough to see its traffic', () => {
    expect(placeTarget({ kind: 'airport', airport: cork })).toEqual({
      label: 'Cork Airport',
      detail: 'EICK · ORK · Cork',
      lon: -8.4911,
      lat: 51.8413,
      zoom: 9,
    });
  });

  it("flies to a chokepoint's narrows", () => {
    const dover = CHOKEPOINTS.find((c) => c.id === 'dover')!;
    expect(placeTarget({ kind: 'chokepoint', chokepoint: dover })).toEqual({
      label: 'Dover Strait',
      detail: 'Shipping chokepoint',
      lon: 1.5,
      lat: 51,
      zoom: 8,
    });
  });

  it("finds places with the map's own search, codes first", () => {
    const matches = searchPalette('ork', { tracks: [], airports: [cork], areas: [] }, 5).map(placeTarget);
    expect(matches[0]?.label).toBe('Cork Airport');
  });
});
