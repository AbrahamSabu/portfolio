import { describe, expect, it } from 'vitest';
import type { Track } from '@watchfloor/shared';
import { SelectedPath, splitAtGaps } from './selectedPath';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

const report = (id: string, lon: number, observedAt: number) =>
  ({ id, lon, lat: 50, observedAt }) as Track;

describe('SelectedPath', () => {
  it("ignores an answer for a track that isn't selected any more", () => {
    const path = new SelectedPath();
    path.select('adsb:aaaaaa');
    path.load({ type: 'path', serverTime: NOW, id: 'adsb:bbbbbb', points: [[0, 50, NOW]], backfill: 'none' });
    expect(path.loaded).toBe(false);
    expect(path.points).toEqual([]);
  });

  it('keeps reports that arrived before the answer, and extends from deltas', () => {
    const path = new SelectedPath();
    path.select('adsb:aaaaaa');
    path.extend([report('adsb:aaaaaa', 2, NOW + 2 * MIN)]);
    path.load({
      type: 'path',
      serverTime: NOW,
      id: 'adsb:aaaaaa',
      points: [
        [0, 50, NOW],
        [1, 50, NOW + MIN],
      ],
      backfill: 'pending',
    });
    path.extend([report('adsb:other', 9, NOW + 3 * MIN), report('adsb:aaaaaa', 3, NOW + 3 * MIN)]);
    path.extend([report('adsb:aaaaaa', 2.5, NOW + 2.5 * MIN)]); // older than the tail: ignored
    expect(path.points.map((p) => p[0])).toEqual([0, 1, 2, 3]);
    expect(path.backfill).toBe('pending');
  });

  it('starts over on a new selection', () => {
    const path = new SelectedPath();
    path.select('adsb:aaaaaa');
    path.extend([report('adsb:aaaaaa', 2, NOW)]);
    path.select('adsb:bbbbbb');
    expect(path.points).toEqual([]);
    expect(path.loaded).toBe(false);
  });
});

describe('splitAtGaps', () => {
  it('draws long pauses as gaps between solid stretches', () => {
    const { solid, gaps } = splitAtGaps(
      [
        [0, 50, NOW],
        [1, 50, NOW + MIN],
        [5, 50, NOW + 60 * MIN], // an hour with no reports
        [6, 50, NOW + 61 * MIN],
      ],
      20 * MIN,
    );
    expect(solid).toEqual([
      [
        [0, 50],
        [1, 50],
      ],
      [
        [5, 50],
        [6, 50],
      ],
    ]);
    expect(gaps).toEqual([
      [
        [1, 50],
        [5, 50],
      ],
    ]);
  });

  it('keeps a line continuous across the antimeridian', () => {
    const { solid } = splitAtGaps(
      [
        [179.5, 0, NOW],
        [-179.5, 0, NOW + MIN],
        [-178.5, 0, NOW + 2 * MIN],
      ],
      20 * MIN,
    );
    expect(solid[0]!.map((c) => c[0])).toEqual([179.5, 180.5, 181.5]);
  });
});
