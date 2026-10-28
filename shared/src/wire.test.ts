import { describe, expect, it } from 'vitest';
import type { Track } from './track';
import type { TrailPoint } from './trail';
import { decodeTrack, decodeTrail, encodeTrack, encodeTrail } from './wire';

const NOW = Date.parse('2026-10-28T14:00:00Z');
const jet: Track = {
  id: 'adsb:3c4b2a', source: 'adsb', domain: 'air', platform: 'airliner', affiliation: 'unknown',
  callsign: 'DLH499', lat: 51.092134567, lon: -3.255298765, altitudeM: 11597.64, courseDeg: 93.8912,
  speedMps: 273.2834, observedAt: NOW - 4_321, provider: 'opensky',
};
const ship: Track = {
  id: 'ais:235000001', source: 'ais', domain: 'sea', platform: 'cargo', affiliation: 'unknown',
  lat: 51.8, lon: -8.3, courseDeg: 270, speedMps: 5.1, observedAt: NOW - 61_000,
};

describe('encodeTrack / decodeTrack', () => {
  it('round-trips a track, rounded to what no one can see', () => {
    const back = decodeTrack(encodeTrack(jet, NOW), NOW);
    expect(back).toEqual({
      ...jet, lat: 51.09213, lon: -3.2553, altitudeM: 11598, courseDeg: 93.9, speedMps: 273.3,
    });
  });

  it('leaves absent fields off the end, and out of the decoded track', () => {
    const tuple = encodeTrack(ship, NOW);
    expect(tuple).toEqual(['ais:235000001', 2, 1, 7, 3, 51.8, -8.3, 270, 5.1, 61_000]);
    expect(decodeTrack(tuple, NOW)).toEqual(ship);
  });

  it('keeps a later field when an earlier optional one is absent', () => {
    const named = { ...ship, callsign: 'EVER GIVEN' };
    expect(encodeTrack(named, NOW).slice(10)).toEqual([null, 'EVER GIVEN']);
    expect(decodeTrack(encodeTrack(named, NOW), NOW)).toEqual(named);
  });

  it('prints short decimals, with no float noise', () => {
    const json = JSON.stringify(encodeTrack({ ...ship, lat: 0.1 + 0.2, speedMps: 0.1 + 0.2 }, NOW));
    expect(json).toContain(',0.3,');
    expect(json).not.toMatch(/\.\d{6,}/);
  });

  it('is well under half the size of the object it replaces', () => {
    expect(JSON.stringify(encodeTrack(jet, NOW)).length).toBeLessThan(JSON.stringify(jet).length / 2);
  });

  it('refuses a value it has no code for, which would be a bug, not bad input', () => {
    expect(() => encodeTrack({ ...ship, platform: 'submarine' as Track['platform'] }, NOW)).toThrow(/TRACK_VALUES/);
  });
});

describe('encodeTrail / decodeTrail', () => {
  const trail: TrailPoint[] = [
    [-8.30012, 51.79988, NOW - 120_000],
    [-8.30006, 51.79994, NOW - 90_250],
    [-8.3, 51.8, NOW - 61_000],
    [179.99999, -0.00001, NOW - 1],
  ];

  it('is lossless for trails, which are already rounded to 1e-5 degrees', () => {
    expect(decodeTrail(encodeTrail(trail, NOW), NOW)).toEqual(trail);
  });

  it('sends each later point as a small step from the one before', () => {
    expect(encodeTrail(trail.slice(0, 2), NOW)).toEqual([-830012, 5179988, 120_000, 6, 6, 29_750]);
  });

  it('handles empty and single-point trails', () => {
    expect(encodeTrail([], NOW)).toEqual([]);
    expect(decodeTrail([], NOW)).toEqual([]);
    expect(decodeTrail(encodeTrail(trail.slice(0, 1), NOW), NOW)).toEqual(trail.slice(0, 1));
  });
});
