import { describe, expect, it } from 'vitest';
import { DEFAULT_STALENESS, type Track } from '@watchfloor/shared';
import { TrackStore } from './trackStore';

const NOW = 1_700_000_000_000;

function track(id: string, observedAt = NOW, extra: Partial<Track> = {}): Track {
  return {
    id,
    source: 'sim',
    domain: 'sea',
    platform: 'cargo',
    affiliation: 'neutral',
    lat: 50,
    lon: 0,
    courseDeg: 90,
    speedMps: 8,
    observedAt,
    ...extra,
  };
}

describe('TrackStore', () => {
  it('prunes by the source override when there is one', () => {
    const rules = { ...DEFAULT_STALENESS, bySource: { adsb: { staleAfterMs: 145_000, dropAfterMs: 360_000 } } };
    const store = new TrackStore(rules);
    const air = { domain: 'air', platform: 'aircraft', affiliation: 'unknown' } as const;
    store.ingest(track('sim:a', NOW, air), NOW);
    store.ingest(track('adsb:4ca7b3', NOW, { ...air, source: 'adsb' }), NOW);
    // Past the air default (2 min) but inside the OpenSky override (6 min).
    store.prune(NOW + 200_000);
    expect(store.get('sim:a')).toBeUndefined();
    expect(store.get('adsb:4ca7b3')).toBeDefined();
  });

  it('coalesces repeated reports into one upsert per flush', () => {
    const store = new TrackStore(DEFAULT_STALENESS);
    store.ingest(track('sim:a', NOW - 2000), NOW);
    store.ingest(track('sim:a', NOW - 1000, { lat: 50.1 }), NOW);
    store.ingest(track('sim:b'), NOW);

    const { upserts, removals } = store.flush();
    expect(upserts.map((t) => t.id).sort()).toEqual(['sim:a', 'sim:b']);
    expect(upserts.find((t) => t.id === 'sim:a')?.lat).toBe(50.1);
    expect(removals).toEqual([]);
    expect(store.flush()).toEqual({ upserts: [], removals: [] });
  });

  it('ignores reports older than what it already has', () => {
    const store = new TrackStore(DEFAULT_STALENESS);
    store.ingest(track('sim:a', NOW, { lat: 51 }), NOW);
    expect(store.ingest(track('sim:a', NOW - 5000, { lat: 49 }), NOW)).toBe(false);
    expect(store.get('sim:a')?.lat).toBe(51);
  });

  it('rejects invalid and far-future reports', () => {
    const store = new TrackStore(DEFAULT_STALENESS);
    expect(store.ingest({ id: 'junk' }, NOW)).toBe(false);
    expect(store.ingest(track('sim:f', NOW + 120_000), NOW)).toBe(false);
    expect(store.rejected).toBe(2);
    expect(store.size).toBe(0);
  });

  it('prunes tracks past their drop window', () => {
    const store = new TrackStore(DEFAULT_STALENESS);
    const dropAfter = DEFAULT_STALENESS.byDomain.sea.dropAfterMs;
    store.ingest(track('sim:old', NOW - dropAfter + 1000), NOW);
    store.ingest(track('sim:new', NOW), NOW);
    store.flush();

    expect(store.prune(NOW + 2000)).toBe(1);
    expect(store.flush()).toEqual({ upserts: [], removals: ['sim:old'] });
  });

  it('treats remove-then-report within one tick as an upsert', () => {
    const store = new TrackStore(DEFAULT_STALENESS);
    store.ingest(track('sim:a', NOW - 1000), NOW);
    store.flush();
    store.remove('sim:a');
    store.ingest(track('sim:a', NOW), NOW);
    const { upserts, removals } = store.flush();
    expect(upserts.map((t) => t.id)).toEqual(['sim:a']);
    expect(removals).toEqual([]);
  });

  describe('trails', () => {
    it('keeps every accepted report, even ones coalesced out of the delta', () => {
      const store = new TrackStore(DEFAULT_STALENESS);
      store.ingest(track('sim:a', NOW - 3000, { lat: 50.0 }), NOW);
      store.ingest(track('sim:a', NOW - 2000, { lat: 50.01 }), NOW);
      store.ingest(track('sim:a', NOW - 1000, { lat: 50.02 }), NOW);

      expect(store.flush().upserts).toHaveLength(1);
      expect(store.trailSnapshot()['sim:a']?.map((p) => p[1])).toEqual([50, 50.01, 50.02]);
    });

    it('does not record rejected or out-of-order reports', () => {
      const store = new TrackStore(DEFAULT_STALENESS);
      store.ingest(track('sim:a', NOW, { lat: 50.0 }), NOW);
      store.ingest(track('sim:a', NOW - 5000, { lat: 50.5 }), NOW);
      store.ingest({ id: 'junk' }, NOW);
      expect(store.trailSnapshot()).toEqual({ 'sim:a': [[0, 50, NOW]] });
    });

    it('forgets the trail when its track is removed or pruned', () => {
      const store = new TrackStore(DEFAULT_STALENESS);
      store.ingest(track('sim:a'), NOW);
      store.ingest(track('sim:old', NOW - DEFAULT_STALENESS.byDomain.sea.dropAfterMs + 1000), NOW);
      store.remove('sim:a');
      store.prune(NOW + 2000);
      expect(store.trailSnapshot()).toEqual({});
    });
  });
});
