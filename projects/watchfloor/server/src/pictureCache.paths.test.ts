import { describe, expect, it } from 'vitest';
import { DEFAULT_STALENESS } from '@watchfloor/shared';
import { TrackStore } from './trackStore';
import { pictureOf, restorePicture } from './pictureCache';
import { PathService } from './paths/pathService';

const id = 'adsb:4ca7b3';
const low = {
  id, source: 'adsb', domain: 'air', platform: 'airliner', affiliation: 'unknown',
  lat: 51.47, lon: -0.46, courseDeg: 270, speedMps: 80, altitudeM: 150,
};

describe('restored paths and OpenSky backfill', () => {
  it('remembers that a path started near the ground, so no lookup is spent on a flight we watched take off', async () => {
    const now = Date.now();
    const store = new TrackStore(DEFAULT_STALENESS);
    store.ingest({ ...low, observedAt: now - 60_000 }, now);
    store.ingest({ ...low, lat: 51.5, lon: -0.7, altitudeM: 900, observedAt: now - 30_000 }, now);
    expect(store.paths.info(id)?.firstAltitudeM).toBe(150);

    const restored = new TrackStore(DEFAULT_STALENESS);
    restorePicture(restored, await pictureOf(store, 'key', now), 'key', now);
    expect(restored.paths.get(id)).toHaveLength(2);
    // Expected: still known. Actual: undefined (PathHistory.load never sets it, and the
    // picture doesn't carry it), so after a restart every restored aircraft looks like
    // one first seen at cruise.
    const lookups: string[] = [];
    const paths = new PathService({ store: restored, lookup: async (icao) => (lookups.push(icao), { kind: 'none' }), now: () => now });
    paths.request(id, () => {});
    expect(lookups).toEqual([]);
  });
});
