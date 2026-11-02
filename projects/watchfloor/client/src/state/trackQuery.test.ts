import { describe, expect, it } from 'vitest';
import type { Track } from '@watchfloor/shared';
import { DEFAULT_QUERY, nextSort, queryTracks, type TrackQuery } from './trackQuery';

const NOW = 1_700_000_000_000;

function track(id: string, extra: Partial<Track> = {}): Track {
  return {
    id,
    source: 'sim',
    domain: 'sea',
    platform: 'cargo',
    affiliation: 'neutral',
    lat: 50,
    lon: 0,
    courseDeg: 0,
    speedMps: 5,
    observedAt: NOW,
    ...extra,
  };
}

const jet = track('sim:air-1', { domain: 'air', platform: 'airliner', callsign: 'BAW12', speedMps: 230, altitudeM: 11000, typeCode: 'B748', model: 'BOEING 747-8' });
const heli = track('sim:air-2', { domain: 'air', platform: 'helicopter', callsign: 'RESCUE 9', speedMps: 60, altitudeM: 300 });
const ship = track('sim:sea-1', { callsign: 'NORDIC STAR', speedMps: 7, observedAt: NOW - 30_000 });
const dark = track('sim:sea-2', { speedMps: 7, observedAt: NOW - 5000 }); // no callsign
const all = [ship, dark, heli, jet];

const ids = (q: Partial<TrackQuery>) => queryTracks(all, { ...DEFAULT_QUERY, ...q }, NOW).map((t) => t.id);

describe('track list query', () => {
  it('filters by domain', () => {
    expect(ids({ domain: 'air' })).toEqual(['sim:air-1', 'sim:air-2']);
    expect(ids({ domain: 'sea' })).toEqual(['sim:sea-1', 'sim:sea-2']);
  });

  it('searches callsigns case-insensitively, ignoring extra spaces', () => {
    expect(ids({ search: '  rescue   9 ' })).toEqual(['sim:air-2']);
    expect(ids({ search: 'baw' })).toEqual(['sim:air-1']);
  });

  it('also searches aircraft type designators and models', () => {
    expect(ids({ search: 'b748' })).toEqual(['sim:air-1']);
    expect(ids({ search: 'boeing 747' })).toEqual(['sim:air-1']);
  });

  it('also searches track ids, so tracks without a callsign can be found', () => {
    expect(ids({ search: 'sea-2' })).toEqual(['sim:sea-2']);
  });

  it('sorts callsigns naturally, with unnamed tracks last in both directions', () => {
    expect(ids({ sort: 'callsign', dir: 'asc' })).toEqual(['sim:air-1', 'sim:sea-1', 'sim:air-2', 'sim:sea-2']);
    expect(ids({ sort: 'callsign', dir: 'desc' })).toEqual(['sim:air-2', 'sim:sea-1', 'sim:air-1', 'sim:sea-2']);
  });

  it('puts tracks without an altitude last, rather than treating them as lowest', () => {
    expect(ids({ sort: 'altitude', dir: 'asc' }).slice(0, 2)).toEqual(['sim:air-2', 'sim:air-1']);
    expect(ids({ sort: 'altitude', dir: 'desc' }).slice(0, 2)).toEqual(['sim:air-1', 'sim:air-2']);
  });

  it('breaks ties on id so equal rows keep a stable order', () => {
    expect(ids({ domain: 'sea', sort: 'speed', dir: 'asc' })).toEqual(['sim:sea-1', 'sim:sea-2']);
    expect(ids({ domain: 'sea', sort: 'speed', dir: 'desc' })).toEqual(['sim:sea-1', 'sim:sea-2']);
  });

  it('sorts by report age, freshest first', () => {
    expect(ids({ sort: 'age', dir: 'asc' }).slice(-2)).toEqual(['sim:sea-2', 'sim:sea-1']);
  });

  it('flips the current column, and starts a new column at its most useful end', () => {
    const bySpeed = nextSort(DEFAULT_QUERY, 'speed');
    expect(bySpeed).toMatchObject({ sort: 'speed', dir: 'desc' });
    expect(nextSort(bySpeed, 'speed')).toMatchObject({ sort: 'speed', dir: 'asc' });
    expect(nextSort(bySpeed, 'callsign')).toMatchObject({ sort: 'callsign', dir: 'asc' });
  });
});
