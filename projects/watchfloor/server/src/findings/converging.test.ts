import { describe, expect, it } from 'vitest';
import type { Track } from '@watchfloor/shared';
import { convergingPairs } from './converging';

const NOW = 1_700_000_000_000;

function jet(id: string, over: Partial<Track> = {}): Track {
  return {
    id: `adsb:${id}`,
    source: 'adsb',
    domain: 'air',
    platform: 'military-aircraft',
    affiliation: 'unknown',
    lat: 54,
    lon: 10,
    altitudeM: 8000,
    courseDeg: 90,
    speedMps: 200,
    observedAt: NOW,
    ...over,
  };
}

// Head-on along the 54th parallel, 100 km apart (1° lon ≈ 65.4 km at 54°N).
const eastbound = jet('aaa', { lon: 10, courseDeg: 90 });
const westbound = jet('bbb', { lon: 11.53, courseDeg: 270 });

describe('convergingPairs', () => {
  it('finds a head-on military pair', () => {
    const pairs = convergingPairs([eastbound, westbound], NOW);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.approach.cpaM).toBeLessThan(5000);
    expect(pairs[0]!.approach.tcpaS).toBeGreaterThan(0);
    expect(pairs[0]!.approach.tcpaS).toBeLessThan(600);
  });

  it('only watches military aircraft', () => {
    expect(convergingPairs([eastbound, jet('bbb', { lon: 11.53, courseDeg: 270, platform: 'airliner' })], NOW)).toHaveLength(0);
  });

  it('ignores parallel tracks that never meet', () => {
    const pairs = convergingPairs([eastbound, jet('bbb', { lat: 54.5, courseDeg: 90 })], NOW);
    expect(pairs).toHaveLength(0);
  });

  it('ignores a formation already joined', () => {
    expect(convergingPairs([eastbound, jet('bbb', { lon: 10.08, courseDeg: 270 })], NOW)).toHaveLength(0);
  });

  it('ignores stacked flight levels', () => {
    expect(convergingPairs([eastbound, jet('bbb', { lon: 11.53, courseDeg: 270, altitudeM: 2000 })], NOW)).toHaveLength(0);
  });

  it('converges unknown altitudes on geometry alone', () => {
    const a = jet('aaa', { altitudeM: undefined as unknown as number });
    delete (a as Partial<Track>).altitudeM;
    const b = jet('bbb', { lon: 11.53, courseDeg: 270 });
    expect(convergingPairs([a, b], NOW)).toHaveLength(1);
  });

  it('ignores stale reports', () => {
    expect(convergingPairs([eastbound, jet('bbb', { lon: 11.53, courseDeg: 270, observedAt: NOW - 5 * 60_000 })], NOW)).toHaveLength(0);
  });
});
