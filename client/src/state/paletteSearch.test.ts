import type { Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import type { Airport } from '../map/airports';
import { searchPalette, type PaletteSources } from './paletteSearch';
import type { Region } from './regions';

function track(over: Partial<Track>): Track {
  return {
    id: 'adsb:4ca7b3',
    source: 'adsb',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'unknown',
    lat: 50,
    lon: 1,
    courseDeg: 90,
    speedMps: 200,
    observedAt: 0,
    ...over,
  } as Track;
}

const dublin: Airport = { code: 'EIDW', iata: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'IE', lat: 53.42, lon: -6.27, size: 0 };
const dubai: Airport = { code: 'OMDB', iata: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'AE', lat: 25.25, lon: 55.36, size: 0 };

const area: Region = { id: 'r1', name: 'Home patch', ring: [[0, 0], [1, 0], [1, 1]], onEnter: true, onExit: true } as Region;

function sources(tracks: Track[] = [], airports: Airport[] = [], areas: Region[] = []): PaletteSources {
  return { tracks, airports, areas };
}

describe('searchPalette', () => {
  it('needs two characters, so one keystroke does not match the world', () => {
    expect(searchPalette('', sources([track({})]))).toEqual([]);
    expect(searchPalette('e', sources([], [dublin]))).toEqual([]);
  });

  it('finds a track by callsign prefix', () => {
    const t = track({ callsign: 'RYR12QD' });
    const [first] = searchPalette('ryr', sources([t, track({ id: 'adsb:2', callsign: 'BAW55' })]));
    expect(first).toEqual({ kind: 'track', track: t });
  });

  it('finds whoever is squawking the code', () => {
    const mayday = track({ id: 'adsb:9', callsign: 'ABC1', squawk: '7700' });
    const [first] = searchPalette('7700', sources([track({ callsign: 'XYZ7700X' }), mayday]));
    expect(first).toEqual({ kind: 'track', track: mayday });
  });

  it('puts an exact airport code above a callsign that merely starts with it', () => {
    const t = track({ callsign: 'DUB123' });
    const results = searchPalette('dub', sources([t], [dublin, dubai]));
    expect(results[0]).toEqual({ kind: 'airport', airport: dublin });
    expect(results).toContainEqual({ kind: 'track', track: t });
  });

  it('finds chokepoints and watch areas by name', () => {
    const [strait] = searchPalette('hormuz', sources());
    expect(strait?.kind).toBe('chokepoint');
    const [patch] = searchPalette('home', sources([], [], [area]));
    expect(patch).toEqual({ kind: 'area', area });
  });

  it('finds aircraft by type code and model', () => {
    const whale = track({ id: 'adsb:3', callsign: 'UAE1', typeCode: 'A388', model: 'AIRBUS A380-800' });
    expect(searchPalette('a388', sources([whale]))[0]).toEqual({ kind: 'track', track: whale });
    expect(searchPalette('airbus', sources([whale]))[0]).toEqual({ kind: 'track', track: whale });
  });

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, i) => track({ id: `adsb:${i}`, callsign: `RYR${i}` }));
    expect(searchPalette('ryr', sources(many)).length).toBe(10);
  });
});
