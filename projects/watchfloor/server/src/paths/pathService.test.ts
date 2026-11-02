import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STALENESS, type PathMessage, type Track } from '@watchfloor/shared';
import type { FlightTrackResult } from '../feeds/opensky/openSkyFeed';
import { TrackStore } from '../trackStore';
import { PathService } from './pathService';

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const ID = 'adsb:4ca7b3';

function jet(extra: Partial<Track> = {}): Track {
  return {
    id: ID,
    source: 'adsb',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'unknown',
    lat: 50,
    lon: 0,
    courseDeg: 90,
    speedMps: 230,
    observedAt: NOW,
    altitudeM: 11_000,
    ...extra,
  };
}

function setup(result: FlightTrackResult, opts: { maxLookupsPerHour?: number } = {}) {
  const store = new TrackStore(DEFAULT_STALENESS);
  store.ingest(jet(), NOW);
  store.ingest(jet({ lat: 51, observedAt: NOW + MIN }), NOW + MIN);
  let now = NOW + MIN;
  const lookup = vi.fn(async (_icao24: string) => result);
  const service = new PathService({ store, lookup, now: () => now, ...opts });
  const sent: PathMessage[] = [];
  const ask = async (id = ID) => {
    service.request(id, (m) => sent.push(m));
    await new Promise((r) => setTimeout(r, 0));
  };
  return { store, lookup, service, sent, ask, advance: (ms: number) => (now += ms) };
}

const EARLIER: FlightTrackResult = {
  kind: 'ok',
  points: [
    [-1, 49, NOW - 60 * MIN],
    [-0.5, 49.5, NOW - 30 * MIN],
  ],
};

describe('PathService', () => {
  it('answers at once, then again with the flight from takeoff', async () => {
    const { sent, ask, lookup } = setup(EARLIER);
    await ask();
    expect(lookup).toHaveBeenCalledWith('4ca7b3');
    expect(sent.map((m) => m.backfill)).toEqual(['pending', 'opensky']);
    expect(sent[0]!.points).toHaveLength(2);
    expect(sent[1]!.points.map((p) => p[2])).toEqual([NOW - 60 * MIN, NOW - 30 * MIN, NOW, NOW + MIN]);
  });

  it('asks OpenSky only once per aircraft', async () => {
    const { sent, ask, lookup } = setup(EARLIER);
    await ask();
    await ask();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(sent.at(-1)!.backfill).toBe('opensky');
  });

  it('shares one lookup between browsers asking at the same time', async () => {
    const { service, lookup } = setup(EARLIER);
    const a: PathMessage[] = [];
    const b: PathMessage[] = [];
    service.request(ID, (m) => a.push(m));
    service.request(ID, (m) => b.push(m));
    await new Promise((r) => setTimeout(r, 0));
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(a.map((m) => m.backfill)).toEqual(['pending', 'opensky']);
    expect(b.map((m) => m.backfill)).toEqual(['pending', 'opensky']);
  });

  it("doesn't ask when we saw the aircraft climb out", async () => {
    const { store, sent, ask, lookup } = setup(EARLIER);
    store.remove(ID);
    store.ingest(jet({ altitudeM: 200 }), NOW);
    await ask();
    expect(lookup).not.toHaveBeenCalled();
    expect(sent.map((m) => m.backfill)).toEqual(['none']);
  });

  it("doesn't ask about ships or unknown tracks", async () => {
    const { store, sent, ask, lookup } = setup(EARLIER);
    store.ingest(
      { ...jet(), id: 'ais:235000001', source: 'ais', domain: 'sea', platform: 'cargo', altitudeM: undefined },
      NOW,
    );
    await ask('ais:235000001');
    await ask('adsb:000000');
    expect(lookup).not.toHaveBeenCalled();
    expect(sent.map((m) => m.id)).toEqual(['ais:235000001']);
  });

  it('stops at the hourly cap', async () => {
    const { store, ask, lookup, advance } = setup({ kind: 'failed', detail: 'HTTP 500' }, { maxLookupsPerHour: 1 });
    store.ingest(jet({ id: 'adsb:aaaaaa' }), NOW + MIN);
    await ask();
    await ask('adsb:aaaaaa');
    expect(lookup).toHaveBeenCalledTimes(1);
    advance(61 * MIN);
    store.ingest(jet({ id: 'adsb:aaaaaa', observedAt: NOW + 62 * MIN }), NOW + 62 * MIN);
    await ask('adsb:aaaaaa');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('waits after a failure, and pauses while rate limited', async () => {
    const failing = setup({ kind: 'failed', detail: 'timeout' });
    await failing.ask();
    await failing.ask();
    expect(failing.lookup).toHaveBeenCalledTimes(1);
    expect(failing.sent.at(-1)!.backfill).toBe('none');

    const limited = setup({ kind: 'limited', retryAfterMs: 30 * MIN });
    limited.store.ingest(jet({ id: 'adsb:bbbbbb' }), NOW + MIN);
    await limited.ask();
    await limited.ask('adsb:bbbbbb');
    expect(limited.lookup).toHaveBeenCalledTimes(1);
  });

  it('remembers when there was no earlier flight', async () => {
    const { sent, ask, lookup } = setup({ kind: 'none' });
    await ask();
    await ask();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(sent.map((m) => m.backfill)).toEqual(['pending', 'none', 'none']);
  });

  it('works without OpenSky', async () => {
    const store = new TrackStore(DEFAULT_STALENESS);
    store.ingest(jet(), NOW);
    const sent: PathMessage[] = [];
    new PathService({ store, now: () => NOW }).request(ID, (m) => sent.push(m));
    expect(sent.map((m) => m.backfill)).toEqual(['none']);
  });
});
