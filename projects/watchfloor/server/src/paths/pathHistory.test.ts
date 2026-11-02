import { describe, expect, it } from 'vitest';
import type { Track } from '@watchfloor/shared';
import { PathHistory, redundant } from './pathHistory';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

/** An aircraft report at a position and time. */
function jet(lon: number, lat: number, observedAt: number, extra: Partial<Track> = {}): Track {
  return {
    id: 'adsb:4ca7b3',
    source: 'adsb',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'unknown',
    lat,
    lon,
    courseDeg: 90,
    speedMps: 230,
    observedAt,
    altitudeM: 11_000,
    ...extra,
  };
}

describe('redundant', () => {
  it('drops a point on the straight line between its neighbours', () => {
    expect(redundant([0, 50, 0], [0.5, 50, 1], [1, 50, 2], 300)).toBe(true);
  });

  it('keeps a turn', () => {
    expect(redundant([0, 50, 0], [0.5, 50.05, 1], [1, 50, 2], 300)).toBe(false);
  });

  it('keeps the turning point of a track that doubled back', () => {
    expect(redundant([0, 50, 0], [1, 50, 1], [0.5, 50, 2], 300)).toBe(false);
  });

  it('works across the antimeridian', () => {
    expect(redundant([179.9, 0, 0], [-180, 0, 1], [-179.9, 0, 2], 300)).toBe(true);
  });
});

describe('PathHistory', () => {
  it('thins a straight cruise to its ends', () => {
    const paths = new PathHistory();
    // Due east at about 230 m/s, one report a minute for 4 minutes.
    for (let i = 0; i <= 4; i++) paths.record(jet(i * 0.19, 50, NOW + i * MIN));
    expect(paths.get('adsb:4ca7b3').map((p) => p[2])).toEqual([NOW, NOW + 4 * MIN]);
  });

  it('keeps a point at least every maxGap, so the path still says when', () => {
    const paths = new PathHistory();
    for (let i = 0; i <= 12; i++) paths.record(jet(i * 0.19, 50, NOW + i * MIN));
    const times = paths.get('adsb:4ca7b3').map((p) => p[2]);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeLessThanOrEqual(5 * MIN);
    expect(times.at(-1)).toBe(NOW + 12 * MIN);
  });

  it('keeps the corner of a turn', () => {
    const paths = new PathHistory();
    paths.record(jet(0, 50, NOW));
    paths.record(jet(0.2, 50, NOW + MIN));
    paths.record(jet(0.4, 50, NOW + 2 * MIN)); // the corner
    paths.record(jet(0.4, 50.12, NOW + 3 * MIN)); // now heading north
    paths.record(jet(0.4, 50.24, NOW + 4 * MIN));
    expect(paths.get('adsb:4ca7b3').map((p) => [p[0], p[1]])).toEqual([
      [0, 50],
      [0.4, 50],
      [0.4, 50.24],
    ]);
  });

  it('ignores reports out of order or barely moved', () => {
    const paths = new PathHistory();
    paths.record(jet(0, 50, NOW));
    paths.record(jet(0.1, 50, NOW - MIN));
    paths.record(jet(0.0001, 50, NOW + MIN));
    expect(paths.get('adsb:4ca7b3')).toHaveLength(1);
  });

  it('caps the points per track, dropping the oldest', () => {
    const rule = { windowMs: 24 * 60 * MIN, toleranceM: 1, maxGapMs: MIN, minSpacingM: 1, maxPoints: 5 };
    const paths = new PathHistory({ air: rule, sea: rule });
    for (let i = 0; i < 10; i++) paths.record(jet(i * 0.1, 50 + (i % 2) * 0.1, NOW + i * MIN));
    const points = paths.get('adsb:4ca7b3');
    expect(points).toHaveLength(5);
    expect(points[0]![2]).toBe(NOW + 5 * MIN);
  });

  it('prunes points past the window but keeps the newest', () => {
    const paths = new PathHistory();
    paths.record(jet(0, 50, NOW));
    paths.record(jet(0, 51, NOW + MIN));
    paths.prune(NOW + 13 * 60 * MIN);
    expect(paths.get('adsb:4ca7b3').map((p) => p[2])).toEqual([NOW + MIN]);
  });

  it('puts earlier history in front, and only what is older than ours', () => {
    const paths = new PathHistory();
    paths.record(jet(1, 50, NOW));
    paths.record(jet(1, 51, NOW + MIN));
    paths.prepend(
      'adsb:4ca7b3',
      [
        [0.5, 50, NOW - 20 * MIN],
        [0, 50, NOW - 40 * MIN],
        [1.1, 50.5, NOW + 30_000], // overlaps ours: ours win
      ],
      'opensky',
    );
    expect(paths.get('adsb:4ca7b3').map((p) => p[2])).toEqual([NOW - 40 * MIN, NOW - 20 * MIN, NOW, NOW + MIN]);
    expect(paths.info('adsb:4ca7b3')?.backfill).toBe('opensky');
  });

  it('records that a lookup found nothing earlier', () => {
    const paths = new PathHistory();
    paths.record(jet(1, 50, NOW, { altitudeM: 300 }));
    paths.prepend('adsb:4ca7b3', [[1, 50, NOW + MIN]], 'opensky');
    expect(paths.info('adsb:4ca7b3')).toEqual({ firstAltitudeM: 300, backfill: 'none' });
  });

  it('round-trips through its saved form', () => {
    const paths = new PathHistory();
    paths.record(jet(0, 50, NOW));
    paths.record(jet(0, 51, NOW + MIN));
    paths.markNoBackfill('adsb:4ca7b3');
    const saved = paths.toRecord(['adsb:4ca7b3', 'adsb:missing']);
    const restored = new PathHistory();
    restored.load(saved, [jet(0, 51, NOW + MIN)]);
    expect(restored.get('adsb:4ca7b3')).toEqual(paths.get('adsb:4ca7b3'));
    expect(restored.info('adsb:4ca7b3')?.backfill).toBe('none');
  });
});
