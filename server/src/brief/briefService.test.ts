import { describe, expect, it } from 'vitest';
import type { Finding, Hazard, Track } from '@watchfloor/shared';
import { BriefService } from './briefService';
import { place } from './compose';

const T0 = 1_700_000_000_000;

function track(id: string, over: Partial<Track> = {}): Track {
  return {
    id,
    source: 'adsb',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'unknown',
    lat: 51.2,
    lon: 3.4,
    courseDeg: 90,
    speedMps: 200,
    observedAt: T0,
    ...over,
  };
}

function harness() {
  let now = T0;
  const world = { tracks: [] as Track[] };
  const service = new BriefService({ tracks: () => world.tracks, now: () => now });
  return { service, world, setNow: (t: number) => (now = t) };
}

describe('BriefService', () => {
  it('logs an emergency squawk starting and ending, with where and how long', () => {
    const h = harness();
    h.world.tracks = [track('adsb:aaa', { callsign: 'RYR4XW', squawk: '7700' })];
    h.service.sweep();
    h.setNow(T0 + 12 * 60_000);
    h.world.tracks = [track('adsb:aaa', { callsign: 'RYR4XW', squawk: '1000' })];
    h.service.sweep();

    const { events } = h.service.message();
    expect(events.map((e) => e.text)).toEqual([
      'RYR4XW began squawking 7700 (Emergency) near 51.2°N 3.4°E.',
      'RYR4XW no longer squawking 7700 (after 12 min).',
    ]);
    expect(events[0]!.kind).toBe('squawk-started');
    expect(events[1]!.kind).toBe('squawk-ended');
    expect(events[0]!.trackId).toBe('adsb:aaa');
  });

  it('does not repeat a squawk that simply continues', () => {
    const h = harness();
    h.world.tracks = [track('adsb:aaa', { squawk: '7600' })];
    h.service.sweep();
    h.service.sweep();
    expect(h.service.message().events).toHaveLength(1);
  });

  it('words each finding kind, and skips a ghost that merely faded', () => {
    const h = harness();
    const circlingFinding: Finding = {
      id: 'circling:adsb:helo',
      kind: 'circling',
      tracks: ['adsb:helo'],
      domain: 'air',
      name: 'GARDA2',
      detail: '4.2 turns in 11 min · radius 2.3 km',
      lat: 53.3,
      lon: -6.2,
      since: T0,
    };
    const ghost: Finding = {
      id: 'dark:ais:1',
      kind: 'dark',
      tracks: ['ais:1'],
      domain: 'sea',
      name: 'BALTIC ROSE',
      detail: 'AIS contact lost · was making 12 kn',
      lat: 55,
      lon: 14,
      since: T0,
    };
    h.service.onFinding('finding-started', circlingFinding, T0);
    h.service.onFinding('finding-started', ghost, T0 + 60_000);
    h.service.onFinding('finding-ended', circlingFinding, T0 + 30 * 60_000);
    h.service.onFinding('finding-ended', ghost, T0 + 40 * 60_000, true);
    const faded: Finding = { ...ghost, id: 'dark:ais:2', name: 'OTHER' };
    h.service.onFinding('finding-ended', faded, T0 + 50 * 60_000); // lapsed, not resolved

    expect(h.service.message().events.map((e) => e.text)).toEqual([
      'GARDA2 seen circling near 53.3°N 6.2°W (4.2 turns in 11 min · radius 2.3 km).',
      'AIS contact with BALTIC ROSE lost near 55.0°N 14.0°E (was making 12 kn).',
      'GARDA2 no longer circling (seen for 30 min).',
      'BALTIC ROSE is transmitting again (silent for 40 min).',
    ]);
  });

  it('logs significant hazards that appear, but not those already there at start', () => {
    const h = harness();
    const quake = (id: string, magnitude: number): Hazard => ({
      id,
      kind: 'earthquake',
      source: 'usgs',
      title: `M ${magnitude} - somewhere`,
      lat: 10,
      lon: 20,
      time: T0,
      magnitude,
      url: 'https://example.org',
    });
    h.service.onHazards([quake('usgs:old', 7.0)]);
    h.service.onHazards([quake('usgs:old', 7.0), quake('usgs:new', 6.1), quake('usgs:small', 4.2)]);
    expect(h.service.message().events.map((e) => e.text)).toEqual(['M 6.1 - somewhere (USGS).']);
  });

  it('prunes to the window: the brief is the last 24 hours', () => {
    const h = harness();
    h.world.tracks = [track('adsb:aaa', { squawk: '7700' })];
    h.service.sweep();
    h.setNow(T0 + 25 * 3_600_000);
    const message = h.service.message();
    expect(message.events).toHaveLength(0);
    expect(message.sinceTime).toBe(T0 + 3_600_000);
  });
});

describe('place', () => {
  it('names hemispheres', () => {
    expect(place(51.23, -3.44)).toBe('51.2°N 3.4°W');
    expect(place(-33.9, 151.2)).toBe('33.9°S 151.2°E');
  });
});
