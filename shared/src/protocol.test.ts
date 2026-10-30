import { describe, expect, it } from 'vitest';
import { encodeServerMessage, parseClientMessage, parseServerMessage, type DeltaMessage, type DetailsMessage, type PathMessage, type SnapshotMessage } from './protocol';
import type { Track } from './track';

const NOW = Date.parse('2026-10-28T14:00:00Z');
const jet: Track = {
  id: 'adsb:3c4b2a', source: 'adsb', domain: 'air', platform: 'airliner', affiliation: 'unknown',
  callsign: 'DLH499', lat: 51.0921, lon: -3.2552, altitudeM: 11598, courseDeg: 93.9, speedMps: 273.3,
  observedAt: NOW - 4_000, provider: 'opensky',
};
const ship: Track = {
  id: 'ais:235000001', source: 'ais', domain: 'sea', platform: 'vessel', affiliation: 'unknown',
  lat: 51.8, lon: -8.3, courseDeg: 0, speedMps: 0, observedAt: NOW - 60_000,
};

describe('parseServerMessage', () => {
  it('reads back a snapshot as sent, trails matched to their tracks by position', () => {
    const snapshot: SnapshotMessage = {
      type: 'snapshot', serverTime: NOW, tracks: [jet, ship],
      trails: { 'ais:235000001': [[-8.30012, 51.79988, NOW - 120_000], [-8.3, 51.8, NOW - 60_000]] },
    };
    expect(parseServerMessage(encodeServerMessage(snapshot))).toEqual(snapshot);
  });

  it('reads back a delta as sent, with feeds only when present', () => {
    const delta: DeltaMessage = { type: 'delta', serverTime: NOW, upserts: [jet], removals: ['ais:1'] };
    expect(parseServerMessage(encodeServerMessage(delta))).toEqual(delta);
    const feeds = [{ feed: 'opensky', label: 'OpenSky', state: 'ok' as const }];
    expect(parseServerMessage(encodeServerMessage({ ...delta, feeds }))).toEqual({ ...delta, feeds });
  });

  it('rejects the v9 shape, with track objects and trails keyed by id', () => {
    const raw = JSON.stringify({ type: 'snapshot', serverTime: 1, tracks: [jet], trails: { 'sim:a': [[0, 50, 1]] } });
    expect(parseServerMessage(raw)).toBeNull();
  });

  it('rejects a snapshot without trails (a v1 server)', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'snapshot', serverTime: 1, tracks: [] }))).toBeNull();
  });

  it('rejects malformed and unknown messages', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'delta', serverTime: 1 }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'mystery', serverTime: 1 }))).toBeNull();
  });
});

describe('parseClientMessage', () => {
  const view = (bbox: unknown) => JSON.stringify({ type: 'view', bbox });

  it('accepts a view, including longitudes past ±180 from a wrapped map', () => {
    expect(parseClientMessage(view({ south: 49, west: -5, north: 52, east: 2 }))).toEqual({
      type: 'view',
      bbox: { south: 49, west: -5, north: 52, east: 2 },
    });
    expect(parseClientMessage(view({ south: -20, west: 170, north: 0, east: 190 }))).not.toBeNull();
  });

  it('keeps only the four numbers, dropping anything extra', () => {
    const parsed = parseClientMessage(JSON.stringify({ type: 'view', bbox: { south: 0, west: 0, north: 1, east: 1, x: 'y' }, z: 1 }));
    expect(parsed).toEqual({ type: 'view', bbox: { south: 0, west: 0, north: 1, east: 1 } });
  });

  it('rejects junk, inverted boxes and impossible coordinates', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'hello' }))).toBeNull();
    expect(parseClientMessage(view(null))).toBeNull();
    expect(parseClientMessage(view({ south: '1', west: 0, north: 2, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: 0, west: 0, north: Infinity, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: 10, west: 0, north: 5, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: 0, west: 5, north: 1, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: -91, west: 0, north: 1, east: 1 }))).toBeNull();
    expect(parseClientMessage(view({ south: 0, west: -1000, north: 1, east: 1 }))).toBeNull();
  });
});

describe('path messages', () => {
  it('round-trips a path through the wire form', () => {
    const message: PathMessage = {
      type: 'path',
      serverTime: NOW,
      id: 'adsb:4ca7b3',
      points: [
        [-6.27, 53.42, NOW - 3_600_000],
        [-1.5, 52.1, NOW - 60_000],
      ],
      backfill: 'opensky',
    };
    expect(parseServerMessage(encodeServerMessage(message))).toEqual(message);
  });

  it("round-trips a track's details", () => {
    const message: DetailsMessage = {
      type: 'details',
      serverTime: NOW,
      id: 'ais:235000001',
      details: { country: 'United Kingdom', ship: { imo: 9875848, destination: 'PORTLAND', eta: '09-22T19:00Z', lengthM: 22 } },
    };
    expect(parseServerMessage(encodeServerMessage(message))).toEqual(message);
  });

  it('accepts a track request for a plausible track id only', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'track', id: 'adsb:4ca7b3' }))).toEqual({ type: 'track', id: 'adsb:4ca7b3' });
    expect(parseClientMessage(JSON.stringify({ type: 'track', id: '' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'track', id: 'x'.repeat(129) }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'track', id: 'has space' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'track', id: 42 }))).toBeNull();
  });
});

describe('news messages', () => {
  const story = {
    id: '1301234567',
    headline: 'Parliament passes the budget',
    url: 'https://example.org/budget',
    outlet: 'example.org',
    lat: 51.5,
    lon: -0.12,
    place: 'London, United Kingdom',
    kind: 'politics' as const,
    publishedAt: Date.UTC(2026, 9, 30, 12, 15),
  };

  it('round-trips, and drops a story that could put something odd in the page', () => {
    const raw = encodeServerMessage({ type: 'news', serverTime: 1, items: [story], replace: true });
    expect(parseServerMessage(raw)).toEqual({ type: 'news', serverTime: 1, items: [story], replace: true });
    const bad = JSON.stringify({ type: 'news', serverTime: 1, replace: false, items: [story, { ...story, url: 'javascript:alert(1)' }, { ...story, lat: 'x' }] });
    expect(parseServerMessage(bad)).toEqual({ type: 'news', serverTime: 1, items: [story], replace: false });
    expect(parseServerMessage(JSON.stringify({ type: 'news', serverTime: 1, items: [] }))).toBeNull();
  });
});
