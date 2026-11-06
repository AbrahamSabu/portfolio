import { describe, expect, it } from 'vitest';
import type { Track } from '@watchfloor/shared';
import { parseRoute, routeLookupFor } from './rideHud';

describe('parseRoute', () => {
  it('reads hexdb.io routes, stops included', () => {
    expect(parseRoute({ route: 'EGLL-KJFK' })).toBe('EGLL → KJFK');
    expect(parseRoute({ route: 'EIDW-EGLL-OMDB' })).toBe('EIDW → EGLL → OMDB');
  });

  it('refuses anything that is not a route', () => {
    expect(parseRoute({ route: 'n/a' })).toBeUndefined();
    expect(parseRoute({ route: '<b>EGLL</b>-KJFK' })).toBeUndefined();
    expect(parseRoute({})).toBeUndefined();
    expect(parseRoute(null)).toBeUndefined();
  });
});

describe('routeLookupFor', () => {
  const track = { id: 'adsb:4ca7b3', source: 'adsb', domain: 'air', platform: 'airliner', affiliation: 'unknown', lat: 0, lon: 0, courseDeg: 0, speedMps: 0, observedAt: 0, callsign: 'EIN123 ' } as Track;

  it('looks up a live aircraft by its callsign', () => {
    expect(routeLookupFor(track, false)).toBe('https://hexdb.io/api/v1/route/icao/EIN123');
  });

  it('never looks up simulated, private or nameless aircraft', () => {
    expect(routeLookupFor({ ...track, source: 'sim' }, false)).toBeUndefined();
    expect(routeLookupFor(track, true)).toBeUndefined();
    expect(routeLookupFor({ ...track, callsign: undefined }, false)).toBeUndefined();
  });
});
