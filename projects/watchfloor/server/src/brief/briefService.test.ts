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

  it('is editorial about findings: long orbits and converging pairs, never routine silence', () => {
    const h = harness();
    const orbit = (id: string, name: string): Finding => ({
      id: `circling:${id}`,
      kind: 'circling',
      tracks: [id],
      domain: 'air',
      name,
      detail: '4.2 turns in 11 min · radius 2.3 km',
      lat: 53.3,
      lon: -6.2,
      since: T0,
    });
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
    const pair: Finding = {
      id: 'conv:adsb:a|adsb:b',
      kind: 'converging',
      tracks: ['adsb:a', 'adsb:b'],
      domain: 'air',
      name: 'NATO01 × NAVY7',
      detail: 'CPA 1.8 km in 4 min · closing 320 kn',
      lat: 54,
      lon: 10,
      since: T0,
    };
    // Starts: only the converging pair is a line; an orbit earns its line by lasting.
    h.service.onFinding('finding-started', orbit('adsb:helo', 'GARDA2'), T0);
    h.service.onFinding('finding-started', ghost, T0 + 60_000);
    h.service.onFinding('finding-started', pair, T0 + 60_000);
    // Ends: a 97-minute orbit is the story; a 10-minute one is a traffic pattern;
    // "no longer converging" and a ship heard again add nothing.
    h.service.onFinding('finding-ended', orbit('adsb:helo', 'GARDA2'), T0 + 97 * 60_000);
    h.service.onFinding('finding-ended', orbit('adsb:gaa', 'SHORT1'), T0 + 10 * 60_000);
    h.service.onFinding('finding-ended', pair, T0 + 8 * 60_000);
    h.service.onFinding('finding-ended', ghost, T0 + 40 * 60_000, true);

    expect(h.service.message().events.map((e) => e.text)).toEqual([
      'Military aircraft converging: NATO01 × NAVY7 (CPA 1.8 km in 4 min · closing 320 kn).',
      'GARDA2 no longer circling (seen for 97 min).',
    ]);
  });

  it('logs a rare sighting when it starts, and nothing when it flies on', () => {
    const h = harness();
    const sighting: Finding = {
      id: 'rare:adsb:aaa111',
      kind: 'rare',
      tracks: ['adsb:aaa111'],
      domain: 'air',
      name: 'GTI4141',
      detail: 'Boeing 747 Dreamlifter · 1 of 5 in the aircraft database · 32,000 ft',
      lat: 53.2,
      lon: -3.0,
      since: T0,
    };
    h.service.onFinding('finding-started', sighting, T0);
    h.service.onFinding('finding-ended', sighting, T0 + 40 * 60_000);
    expect(h.service.message().events.map((e) => e.text)).toEqual([
      'Rare sighting: GTI4141 near 53.2°N 3.0°W (Boeing 747 Dreamlifter · 1 of 5 in the aircraft database · 32,000 ft).',
    ]);
  });

  it('logs significant hazards that happen on this watch, not the backlog', () => {
    const h = harness();
    const quake = (id: string, magnitude: number, time = T0 + 60_000): Hazard => ({
      id,
      kind: 'earthquake',
      source: 'usgs',
      title: `M ${magnitude} - somewhere`,
      lat: 10,
      lon: 20,
      time,
      magnitude,
      url: 'https://example.org',
    });
    h.service.onHazards([quake('usgs:old', 7.0)]);
    // A second source's first list arrives later with events that began long
    // ago: new to the merged list, but not news.
    h.service.onHazards([
      quake('usgs:old', 7.0),
      quake('usgs:new', 6.1),
      quake('usgs:small', 4.2),
      quake('usgs:lastweek', 6.8, T0 - 7 * 24 * 3_600_000),
    ]);
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
