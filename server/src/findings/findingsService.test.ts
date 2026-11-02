import { describe, expect, it } from 'vitest';
import type { Finding, Track } from '@watchfloor/shared';
import { FindingsService, type FindingsWorld } from './findingsService';

const T0 = 1_700_000_000_000;

function track(id: string, over: Partial<Track> = {}): Track {
  return {
    id,
    source: 'adsb',
    domain: 'air',
    platform: 'helicopter',
    affiliation: 'unknown',
    lat: 52,
    lon: 4,
    courseDeg: 90,
    speedMps: 50,
    observedAt: T0,
    ...over,
  };
}

/** An orbiting path ending at `end`: enough turning to trip the detector. */
function orbitPath(end: number, laps = 3, minutes = 9): number[] {
  const n = laps * 24;
  const data: number[] = [];
  for (let i = 0; i <= n; i++) {
    const angle = (i / 24) * 2 * Math.PI;
    data.push(4 + (2000 * Math.sin(angle)) / 68_500, 52 + (2000 * Math.cos(angle)) / 110_540, end - minutes * 60_000 + (i / n) * minutes * 60_000);
  }
  return data;
}

/** A ship's steady path from `from` to `to`. */
function seaPath(from: number, to: number): number[] {
  const data: number[] = [];
  for (let i = 0; i <= 20; i++) data.push(1 + i * 0.01, 51, from + (i / 20) * (to - from));
  return data;
}

interface Harness {
  service: FindingsService;
  world: { tracks: Track[]; paths: Map<string, number[]> };
  changes: Finding[][];
  events: { kind: string; id: string }[];
  setNow: (t: number) => void;
}

function harness(): Harness {
  let now = T0;
  const world = { tracks: [] as Track[], paths: new Map<string, number[]>() };
  const changes: Finding[][] = [];
  const events: { kind: string; id: string }[] = [];
  const view: FindingsWorld = { tracks: () => world.tracks, path: (id) => world.paths.get(id) };
  const service = new FindingsService({
    world: view,
    now: () => now,
    onChange: (items) => changes.push(items),
    onEvent: (kind, finding) => events.push({ kind, id: finding.id }),
  });
  return { service, world, changes, events, setNow: (t) => (now = t) };
}

describe('FindingsService', () => {
  it('reports a circling aircraft and keeps its since stable', () => {
    const h = harness();
    h.world.tracks = [track('adsb:abc123', { callsign: 'GARDA2' })];
    h.world.paths.set('adsb:abc123', orbitPath(T0));
    h.service.sweep();

    const items = h.service.items();
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('circling');
    expect(items[0]!.name).toBe('GARDA2');
    expect(items[0]!.detail).toMatch(/turns in \d+ min · radius/);
    expect(items[0]!.since).toBe(T0);
    expect(h.events).toEqual([{ kind: 'finding-started', id: 'circling:adsb:abc123' }]);

    // Still circling a minute later: same finding, same since.
    h.setNow(T0 + 60_000);
    h.world.tracks = [track('adsb:abc123', { callsign: 'GARDA2', observedAt: T0 + 60_000 })];
    h.world.paths.set('adsb:abc123', orbitPath(T0 + 60_000));
    h.service.sweep();
    expect(h.service.items()[0]!.since).toBe(T0);
    expect(h.events).toHaveLength(1);
  });

  it('ends a circling finding once the orbit stops (after the hold)', () => {
    const h = harness();
    h.world.tracks = [track('adsb:abc123')];
    h.world.paths.set('adsb:abc123', orbitPath(T0));
    h.service.sweep();
    expect(h.service.items()).toHaveLength(1);

    // Ten minutes on, the path in the window is straight: the finding holds
    // for a while, then ends.
    const later = T0 + 10 * 60_000;
    h.setNow(later);
    h.world.tracks = [track('adsb:abc123', { observedAt: later })];
    h.world.paths.set('adsb:abc123', seaPath(later - 9 * 60_000, later));
    h.service.sweep();
    expect(h.service.items()).toHaveLength(0);
    expect(h.events.at(-1)).toEqual({ kind: 'finding-ended', id: 'circling:adsb:abc123' });
  });

  it('reports a ship gone dark under way, in exactly those words', () => {
    const h = harness();
    const lastContact = T0 - 9 * 60_000;
    h.world.tracks = [
      track('ais:123456789', { source: 'ais', domain: 'sea', platform: 'cargo', callsign: 'BALTIC ROSE', speedMps: 6, observedAt: lastContact }),
    ];
    h.world.paths.set('ais:123456789', seaPath(lastContact - 30 * 60_000, lastContact));
    h.service.sweep();

    const items = h.service.items();
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('dark');
    expect(items[0]!.detail).toBe('AIS contact lost · was making 12 kn');
    expect(items[0]!.since).toBe(lastContact);
  });

  it('resolves the ghost when the ship reports again', () => {
    const h = harness();
    const lastContact = T0 - 9 * 60_000;
    const ship = track('ais:123456789', { source: 'ais', domain: 'sea', platform: 'cargo', speedMps: 6, observedAt: lastContact });
    h.world.tracks = [ship];
    h.world.paths.set('ais:123456789', seaPath(lastContact - 30 * 60_000, lastContact));
    h.service.sweep();
    expect(h.service.items()).toHaveLength(1);

    h.setNow(T0 + 60_000);
    h.world.tracks = [{ ...ship, observedAt: T0 + 60_000 }];
    h.service.sweep();
    expect(h.service.items()).toHaveLength(0);
    expect(h.events.at(-1)).toEqual({ kind: 'finding-ended', id: 'dark:ais:123456789' });
  });

  it('keeps the ghost after the store drops the track, then lets it fade', () => {
    const h = harness();
    const lastContact = T0 - 9 * 60_000;
    h.world.tracks = [track('ais:123456789', { source: 'ais', domain: 'sea', platform: 'cargo', speedMps: 6, observedAt: lastContact })];
    h.world.paths.set('ais:123456789', seaPath(lastContact - 30 * 60_000, lastContact));
    h.service.sweep();

    // The track ages out of the store entirely; the ghost stays...
    h.setNow(T0 + 20 * 60_000);
    h.world.tracks = [];
    h.service.sweep();
    expect(h.service.items()).toHaveLength(1);

    // ...until the linger runs out.
    h.setNow(lastContact + 46 * 60_000);
    h.service.sweep();
    expect(h.service.items()).toHaveLength(0);
  });

  it('ignores a ship only just seen: no history, no judgement', () => {
    const h = harness();
    const lastContact = T0 - 9 * 60_000;
    h.world.tracks = [track('ais:123456789', { source: 'ais', domain: 'sea', platform: 'cargo', speedMps: 6, observedAt: lastContact })];
    h.world.paths.set('ais:123456789', seaPath(lastContact - 60_000, lastContact));
    h.service.sweep();
    expect(h.service.items()).toHaveLength(0);
  });

  it('ignores a silent ship that was drifting, not under way', () => {
    const h = harness();
    const lastContact = T0 - 9 * 60_000;
    h.world.tracks = [track('ais:123456789', { source: 'ais', domain: 'sea', platform: 'cargo', speedMps: 0.5, observedAt: lastContact })];
    h.world.paths.set('ais:123456789', seaPath(lastContact - 30 * 60_000, lastContact));
    h.service.sweep();
    expect(h.service.items()).toHaveLength(0);
  });

  it('pairs converging military aircraft and names both', () => {
    const h = harness();
    h.world.tracks = [
      track('adsb:aaa', { platform: 'military-aircraft', callsign: 'NATO01', lat: 54, lon: 10, courseDeg: 90, speedMps: 200, altitudeM: 8000 }),
      track('adsb:bbb', { platform: 'maritime-patrol', callsign: 'NAVY7', lat: 54, lon: 11.53, courseDeg: 270, speedMps: 200, altitudeM: 8000 }),
    ];
    h.service.sweep();
    const items = h.service.items();
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('converging');
    expect(items[0]!.name).toBe('NATO01 × NAVY7');
    expect(items[0]!.detail).toMatch(/^CPA \d+\.\d km in \d+ min · closing \d+ kn$/);
    expect(items[0]!.tracks).toEqual(['adsb:aaa', 'adsb:bbb']);
  });

  it('only publishes when the list changed', () => {
    const h = harness();
    h.world.tracks = [track('adsb:abc123')];
    h.world.paths.set('adsb:abc123', orbitPath(T0));
    h.service.sweep();
    h.service.sweep();
    expect(h.changes).toHaveLength(1);
  });
});
