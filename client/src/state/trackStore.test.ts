import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAIL_RULES, type Track } from '@watchfloor/shared';
import { TrackStore } from './trackStore';

const NOW = 1_700_000_000_000;

function track(id: string, lat: number, observedAt: number): Track {
  return {
    id,
    source: 'sim',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'neutral',
    lat,
    lon: 0,
    courseDeg: 0,
    speedMps: 200,
    observedAt,
  };
}

describe('client TrackStore trails', () => {
  it('starts from the snapshot history and extends it from deltas', () => {
    const store = new TrackStore();
    store.applySnapshot([track('sim:a', 50.01, NOW - 5000)], {
      'sim:a': [
        [0, 50, NOW - 10_000],
        [0, 50.01, NOW - 5000],
      ],
    });
    store.applyDelta([track('sim:a', 50.02, NOW)], [], NOW);
    expect(store.trail('sim:a').map((p) => p[1])).toEqual([50, 50.01, 50.02]);
  });

  it('drops the trail with its track', () => {
    const store = new TrackStore();
    store.applySnapshot([track('sim:a', 50, NOW)], { 'sim:a': [[0, 50, NOW]] });
    store.applyDelta([], ['sim:a'], NOW);
    expect(store.trail('sim:a')).toEqual([]);
  });

  it('ages out old points on empty heartbeat deltas, without notifying views', () => {
    const store = new TrackStore();
    const window = DEFAULT_TRAIL_RULES.air.windowMs;
    store.applySnapshot([track('sim:a', 50.01, NOW)], {
      'sim:a': [
        [0, 50, NOW - window - 1000],
        [0, 50.01, NOW],
      ],
    });
    let notified = 0;
    store.subscribe(() => notified++);
    store.applyDelta([], [], NOW);
    expect(store.trail('sim:a')).toHaveLength(1);
    expect(notified).toBe(0);
  });
});
