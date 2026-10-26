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
    const dropAfter = DEFAULT_STALENESS.sea.dropAfterMs;
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
});
