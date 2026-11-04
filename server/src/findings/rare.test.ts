import { describe, expect, it } from 'vitest';
import type { Track } from '@watchfloor/shared';
import { rareSightings } from './rare';

const NOW = 1_700_000_000_000;

function aircraft(id: string, typeCode: string | undefined, over: Partial<Track> = {}): Track {
  return {
    id: `adsb:${id}`,
    source: 'adsb',
    domain: 'air',
    platform: 'aircraft',
    affiliation: 'unknown',
    lat: 53.2,
    lon: -3.0,
    altitudeM: 7_000,
    courseDeg: 120,
    speedMps: 200,
    observedAt: NOW - 10_000,
    ...(typeCode ? { typeCode } : {}),
    ...over,
  };
}

describe('rareSightings', () => {
  it('finds a Dreamlifter in flight and names it', () => {
    const found = rareSightings([aircraft('a1', 'BLCF'), aircraft('a2', 'A320')], NOW);
    expect(found.map((f) => [f.track.id, f.label])).toEqual([['adsb:a1', 'Boeing 747 Dreamlifter']]);
  });

  it('leaves out what is too common to be news', () => {
    expect(rareSightings([aircraft('a', 'A388'), aircraft('b', 'B744'), aircraft('c', 'C17')], NOW)).toEqual([]);
  });

  it('only counts it flying: a Beluga parked at its factory broadcasts all day', () => {
    expect(rareSightings([aircraft('parked', 'A337', { altitudeM: 10, speedMps: 0 })], NOW)).toEqual([]);
    expect(rareSightings([aircraft('taxiing', 'A337', { altitudeM: 500, speedMps: 8 })], NOW)).toEqual([]);
  });

  it('ignores stale reports and aircraft the database could not type', () => {
    expect(rareSightings([aircraft('old', 'B52', { observedAt: NOW - 10 * 60_000 }), aircraft('untyped', undefined)], NOW)).toEqual([]);
  });

  it('never looks at ships', () => {
    expect(rareSightings([aircraft('boat', 'BLCF', { domain: 'sea', source: 'ais' })], NOW)).toEqual([]);
  });
});
