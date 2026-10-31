import type { Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { EmergencyWatch } from './emergencies';

const jet = (squawk: string | undefined, observedAt: number, id = 'adsb:abc123'): Track => ({
  id,
  source: 'adsb',
  domain: 'air',
  platform: 'airliner',
  affiliation: 'unknown',
  lat: 51,
  lon: -8,
  courseDeg: 90,
  speedMps: 200,
  observedAt,
  ...(squawk ? { squawk } : {}),
});

describe('EmergencyWatch', () => {
  it('raises an emergency once a second report carries the code, and only once', () => {
    const watch = new EmergencyWatch();
    expect(watch.update([jet('7700', 1000)], 1000)).toEqual([]);
    // The same report again (no new position): still unconfirmed.
    expect(watch.update([jet('7700', 1000)], 2000)).toEqual([]);
    expect(watch.update([jet('7700', 6000)], 6000)).toEqual([{ id: 'adsb:abc123', squawk: '7700', meaning: 'Emergency', since: 1000 }]);
    expect(watch.update([jet('7700', 9000)], 9000)).toEqual([]);
    expect(watch.active).toHaveLength(1);
  });

  it('ignores ordinary codes and a code that passes through on one report', () => {
    const watch = new EmergencyWatch();
    watch.update([jet('7700', 1000)], 1000);
    expect(watch.update([jet('2201', 6000)], 6000)).toEqual([]);
    expect(watch.active).toEqual([]);
  });

  it('ends when the code changes or the aircraft leaves, and a new code starts over', () => {
    const watch = new EmergencyWatch();
    watch.update([jet('7600', 1000)], 1000);
    watch.update([jet('7600', 2000)], 2000);
    expect(watch.active.map((e) => e.meaning)).toEqual(['Radio failure']);
    watch.update([jet('7500', 3000)], 3000);
    expect(watch.active).toEqual([]);
    expect(watch.update([jet('7500', 4000)], 4000).map((e) => e.meaning)).toEqual(['Unlawful interference']);
    watch.update([], 5000);
    expect(watch.active).toEqual([]);
  });
});
