import type { Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { ClimbRates } from './climb';
import { MAX_VOICES, summarise, type ScreenView } from './picture';
import { seededRandom } from './scale';

function track(id: string, lon: number, change: Partial<Track> = {}): Track {
  return {
    id,
    source: 'sim',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'unknown',
    lat: 50,
    lon,
    altitudeM: 9000,
    courseDeg: 90,
    speedMps: 200,
    observedAt: 0,
    ...change,
  };
}

/** The screen spans longitudes 0 to 10. */
const view: ScreenView = {
  contains: (lon) => lon >= 0 && lon <= 10,
  across: (lon) => lon / 5 - 1,
};

describe('summarise', () => {
  it('counts what is live, shown and on screen, by domain', () => {
    const tracks = [
      track('air-1', 1),
      track('air-2', 9),
      track('air-off-screen', 20),
      track('air-hidden', 5),
      track('sea-moving', 2, { domain: 'sea', speedMps: 6, altitudeM: undefined }),
      track('sea-moored', 3, { domain: 'sea', speedMps: 0.2, altitudeM: undefined }),
    ];
    const picture = summarise(tracks, (t) => t.id !== 'air-hidden', view, new ClimbRates(), 0, Math.random);
    expect(picture).toMatchObject({ aircraft: 2, ships: 2, shipsUnderWay: 1, climbing: 0, descending: 0 });
    expect(picture.voices.map((v) => v.id).sort()).toEqual(['air-1', 'air-2']);
    expect(picture.voices.find((v) => v.id === 'air-1')!.pan).toBeCloseTo(-0.8, 6);
  });

  it('hears climbs and descents across successive looks', () => {
    const climbs = new ClimbRates();
    const at = (t: number, up: number, down: number) => [
      track('up', 4, { altitudeM: up, observedAt: t }),
      track('down', 6, { altitudeM: down, observedAt: t }),
    ];
    summarise(at(0, 1000, 5000), () => true, view, climbs, 0, Math.random);
    const picture = summarise(at(10_000, 1080, 4920), () => true, view, climbs, 10_000, Math.random);
    expect(picture.climbing).toBe(1);
    expect(picture.descending).toBe(1);
    expect(Object.fromEntries(picture.voices.map((v) => [v.id, v.climb]))).toEqual({ up: 'climbing', down: 'descending' });
  });

  it('samples a crowded sky fairly, and keeps pans on screen', () => {
    const tracks = Array.from({ length: 200 }, (_, i) => track(`a${i}`, (i / 199) * 10));
    const random = seededRandom(3);
    const picked = new Map<string, number>();
    const runs = 400;
    let widestPan = 0;
    const sizes = new Set<string>();
    for (let run = 0; run < runs; run++) {
      const picture = summarise(tracks, () => true, view, new ClimbRates(), 0, random);
      sizes.add(`${picture.aircraft}/${picture.voices.length}`);
      for (const v of picture.voices) {
        widestPan = Math.max(widestPan, Math.abs(v.pan));
        picked.set(v.id, (picked.get(v.id) ?? 0) + 1);
      }
    }
    expect([...sizes]).toEqual([`200/${MAX_VOICES}`]);
    expect(widestPan).toBeLessThanOrEqual(1);
    // Each aircraft should be picked about 48 in 200 times (24%).
    const shares = tracks.map((t) => (picked.get(t.id) ?? 0) / runs);
    expect(Math.min(...shares)).toBeGreaterThan(0.12);
    expect(Math.max(...shares)).toBeLessThan(0.36);
  });
});
