import { describe, expect, it } from 'vitest';
import { DEFAULT_STALENESS, type Track } from '@watchfloor/shared';
import { nearbyAircraft, SkyWatchers } from './nearby';

const NOW = 1_700_000_000_000;
const CORK = { lat: 51.9, lon: -8.5 };

function jet(id: string, over: Partial<Track> = {}): Track {
  return {
    id: `adsb:${id}`,
    source: 'adsb',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'unknown',
    callsign: `TST${id}`,
    lat: CORK.lat + 0.1,
    lon: CORK.lon,
    altitudeM: 10_000,
    courseDeg: 90,
    speedMps: 230,
    observedAt: NOW - 5_000,
    ...over,
  };
}

const noDetails = () => ({});

describe('nearbyAircraft', () => {
  it('lists live aircraft overhead, nearest first', () => {
    const far = jet('far', { lat: CORK.lat + 0.4 });
    const near = jet('near', { lat: CORK.lat + 0.05 });
    const { aircraft } = nearbyAircraft([far, near], CORK, NOW, DEFAULT_STALENESS, noDetails);
    expect(aircraft.map((a) => a.id)).toEqual(['adsb:near', 'adsb:far']);
    expect(aircraft[0]).toMatchObject({ callsign: 'TSTnear', altitudeM: 10_000, speedMps: 230 });
  });

  it('leaves out what you cannot point at: on the ground, out of range, stale, ships', () => {
    const tracks = [
      jet('taxiing', { altitudeM: 20 }),
      jet('nopressure', { altitudeM: undefined }),
      jet('beyond', { lat: CORK.lat + 1 }),
      jet('stale', { observedAt: NOW - 10 * 60_000 }),
      jet('ship', { domain: 'sea', source: 'ais', platform: 'cargo', altitudeM: undefined }),
    ];
    expect(nearbyAircraft(tracks, CORK, NOW, DEFAULT_STALENESS, noDetails).aircraft).toEqual([]);
  });

  it('keeps a private aircraft anonymous: what it is, not who', () => {
    const t = jet('pia', { model: 'CESSNA 525', typeCode: 'C525' });
    const [a] = nearbyAircraft([t], CORK, NOW, DEFAULT_STALENESS, () => ({ private: true, airline: 'Somebody' })).aircraft;
    expect(a?.callsign).toBeUndefined();
    expect(a?.airline).toBeUndefined();
    expect(a?.model).toBe('CESSNA 525');
  });

  it('names the airline and marks military aircraft', () => {
    const [a, b] = nearbyAircraft(
      [jet('a', { lat: CORK.lat + 0.01 }), jet('b', { lat: CORK.lat + 0.02, platform: 'military-aircraft' })],
      CORK,
      NOW,
      DEFAULT_STALENESS,
      (t) => (t.id === 'adsb:a' ? { airline: 'Ryanair' } : {}),
    ).aircraft;
    expect(a?.airline).toBe('Ryanair');
    expect(b?.military).toBe(true);
  });
});

describe('SkyWatchers', () => {
  it('reports a change only when a new patch of sky appears or one expires', () => {
    const w = new SkyWatchers(60_000);
    expect(w.active).toBe(false);
    expect(w.touch(51.9, -8.5, NOW)).toBe(true);
    // Walking around inside the same half-degree cell changes nothing.
    expect(w.touch(51.95, -8.4, NOW + 5_000)).toBe(false);
    expect(w.active).toBe(true);
    expect(w.areas()).toEqual([{ south: 51, west: -9, north: 52.5, east: -7.5 }]);
    expect(w.expire(NOW + 30_000)).toBe(false);
    expect(w.expire(NOW + 70_000)).toBe(true);
    expect(w.active).toBe(false);
  });
});
