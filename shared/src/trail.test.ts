import { describe, expect, it } from 'vitest';
import { destination } from './geo';
import type { Track } from './track';
import { DEFAULT_TRAIL_RULES, TrailHistory } from './trail';

const NOW = 1_700_000_000_000;
const ORIGIN = { lat: 50, lon: 0 };

/** A sea track `metresEast` east of the origin, observed `ago` ms before NOW. */
function report(metresEast: number, ago: number, extra: Partial<Track> = {}): Track {
  const pos = destination(ORIGIN, 90, metresEast);
  return {
    id: 'sim:ship',
    source: 'sim',
    domain: 'sea',
    platform: 'cargo',
    affiliation: 'neutral',
    lat: pos.lat,
    lon: pos.lon,
    courseDeg: 90,
    speedMps: 8,
    observedAt: NOW - ago,
    ...extra,
  };
}

describe('TrailHistory', () => {
  it('keeps reported positions oldest first, as [lon, lat, time]', () => {
    const trails = new TrailHistory();
    trails.record(report(0, 20_000));
    trails.record(report(100, 10_000));

    const points = trails.get('sim:ship');
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual([0, 50, NOW - 20_000]);
    expect(points[1]![2]).toBe(NOW - 10_000);
  });

  it('skips reports too close to the previous point', () => {
    const trails = new TrailHistory();
    const spacing = DEFAULT_TRAIL_RULES.sea.minSpacingM;
    trails.record(report(0, 30_000));
    expect(trails.record(report(spacing / 2, 20_000))).toBe(false);
    expect(trails.record(report(spacing * 2, 10_000))).toBe(true);
    expect(trails.get('sim:ship')).toHaveLength(2);
  });

  it('ignores reports that arrive out of order', () => {
    const trails = new TrailHistory();
    trails.record(report(0, 10_000));
    expect(trails.record(report(500, 20_000))).toBe(false);
    expect(trails.get('sim:ship')).toHaveLength(1);
  });

  it('drops points older than the domain window but keeps the newest', () => {
    const trails = new TrailHistory();
    const window = DEFAULT_TRAIL_RULES.sea.windowMs;
    trails.record(report(0, window + 60_000));
    trails.record(report(500, window + 30_000));
    trails.record(report(1000, 60_000));
    trails.prune(NOW);
    expect(trails.get('sim:ship').map((p) => p[2])).toEqual([NOW - 60_000]);

    // A track that has gone quiet still keeps its last known point.
    trails.prune(NOW + window * 2);
    expect(trails.get('sim:ship')).toHaveLength(1);
  });

  it('uses the shorter air window for aircraft', () => {
    const trails = new TrailHistory();
    const air = (m: number, ago: number) => report(m, ago, { id: 'sim:jet', domain: 'air' });
    trails.record(air(0, DEFAULT_TRAIL_RULES.air.windowMs + 1000));
    trails.record(air(5000, 1000));
    trails.prune(NOW);
    expect(trails.get('sim:jet')).toHaveLength(1);
  });

  it('round-trips through the snapshot form, skipping unknown tracks', () => {
    const server = new TrailHistory();
    server.record(report(0, 20_000));
    server.record(report(500, 10_000));

    const client = new TrailHistory();
    client.load({ ...server.toRecord(), 'sim:gone': [[1, 1, NOW]] }, [report(500, 10_000)]);
    expect(client.get('sim:ship')).toEqual(server.get('sim:ship'));
    expect(client.get('sim:gone')).toHaveLength(0);

    // Loaded trails keep their domain, so they carry on thinning correctly.
    expect(client.record(report(510, 5000))).toBe(false);
  });

  it('forgets removed tracks', () => {
    const trails = new TrailHistory();
    trails.record(report(0, 0));
    trails.remove('sim:ship');
    expect(trails.size).toBe(0);
    expect(trails.get('sim:ship')).toEqual([]);
  });
});
