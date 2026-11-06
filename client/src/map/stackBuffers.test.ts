import { describe, expect, it } from 'vitest';
import type { TrailPoint } from '@watchfloor/shared';
import { FLOATS_PER_VERTEX, LOOK } from './layer3d';
import { mercatorX, mercatorY, type ProjectionSnapshot } from './project3d';
import { buildAircraft, buildTrails, liftTrail, pickAircraft, type StackAircraft } from './stackBuffers';

const REF = { x: 0.5, y: 0.5 };
const plane = (over: Partial<StackAircraft> = {}): StackAircraft => ({
  id: 'p',
  affiliation: 'unknown',
  lon: 1,
  lat: 51,
  altM: 3000,
  stale: false,
  selected: false,
  ...over,
});
/** Vertex `i` of a batch as named fields. */
const vertex = (data: Float32Array, i: number) => {
  const v = data.subarray(i * FLOATS_PER_VERTEX, (i + 1) * FLOATS_PER_VERTEX);
  return { dx: v[0]!, dy: v[1]!, alt: v[2]!, alpha: v[6]!, size: v[7]!, look: v[8]! };
};

describe('liftTrail', () => {
  it('lifts each point to the altitude of its moment and leaves out what came before', () => {
    const points: TrailPoint[] = [
      [0, 50, 1000],
      [0.1, 50, 2000],
      [0.2, 50, 3000],
    ];
    const lifted = liftTrail(points, (t) => (t >= 2000 ? t : undefined));
    expect(lifted).toEqual([
      [0.1, 50, 2000],
      [0.2, 50, 3000],
    ]);
  });

  it('skips straight to the first point it has an altitude for', () => {
    const points: TrailPoint[] = Array.from({ length: 100 }, (_, i) => [i, 0, i * 1000]);
    const asked: number[] = [];
    const lifted = liftTrail(points, (t) => (asked.push(t), 500), 48, 90_000);
    expect(lifted.map((p) => p[0])).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
    expect(asked).toHaveLength(10);
  });

  it('thins a long trail evenly, keeping its first and newest points', () => {
    const points: TrailPoint[] = Array.from({ length: 300 }, (_, i) => [i, 0, i]);
    const lifted = liftTrail(points, (t) => t, 48);
    expect(lifted).toHaveLength(48);
    expect(lifted[0]).toEqual([0, 0, 0]);
    expect(lifted.at(-1)).toEqual([299, 0, 299]);
  });
});

describe('buildAircraft', () => {
  it('draws a drop line from the aircraft to the ground, a ground dot and the aircraft on top', () => {
    const { lines, points } = buildAircraft([plane()], REF);
    expect(lines.count).toBe(2);
    expect(vertex(lines.data, 0).alt).toBe(3000);
    expect(vertex(lines.data, 1).alt).toBe(0);
    expect(vertex(lines.data, 0).alpha).toBeGreaterThan(vertex(lines.data, 1).alpha);
    expect(points.count).toBe(2);
    expect(vertex(points.data, 0)).toMatchObject({ alt: 0, size: 4 });
    expect(vertex(points.data, 1)).toMatchObject({ alt: 3000, size: 9, look: LOOK.dot, alpha: 1 });
  });

  it('stores positions relative to the reference, folded across the antimeridian', () => {
    const { points } = buildAircraft([plane({ lon: 179.9, lat: 0 })], { x: mercatorX(-179.9), y: 0.5 });
    const v = vertex(points.data, 1);
    expect(v.dx).toBeCloseTo(-0.2 / 360, 9);
    expect(v.dy).toBeCloseTo(mercatorY(0) - 0.5, 9);
  });

  it('puts an aircraft without an altitude on the surface, with no drop line', () => {
    const { lines, points } = buildAircraft([plane({ altM: undefined })], REF);
    expect(lines.count).toBe(0);
    expect(points.count).toBe(1);
    expect(vertex(points.data, 0).alt).toBe(0);
  });

  it('rings the selected aircraft and fades stale ones', () => {
    const { points } = buildAircraft([plane({ selected: true }), plane({ id: 'q', stale: true })], REF);
    expect(vertex(points.data, 2)).toMatchObject({ look: LOOK.selected, size: 20 });
    expect(vertex(points.data, 3).alpha).toBeCloseTo(0.4, 6);
  });

  it("joins the trail's end to where the aircraft is now", () => {
    const { lines } = buildAircraft([plane({ trailEnd: [0.9, 51, 2900] })], REF);
    expect(lines.count).toBe(4);
    expect(vertex(lines.data, 2).alt).toBe(2900);
    expect(vertex(lines.data, 3).alt).toBe(3000);
  });
});

describe('buildTrails', () => {
  it('draws segments that brighten towards the newest point', () => {
    const batch = buildTrails(
      [{ affiliation: 'friend', stale: false, selected: false, points: [[0, 50, 100], [0.1, 50, 200], [0.2, 50, 300]] }],
      REF,
    );
    expect(batch.mode).toBe('lines');
    expect(batch.count).toBe(4);
    expect(vertex(batch.data, 0).alpha).toBeLessThan(vertex(batch.data, 3).alpha);
    expect(vertex(batch.data, 3).alt).toBe(300);
  });

  it('skips trails too short to draw', () => {
    expect(buildTrails([{ affiliation: 'friend', stale: false, selected: false, points: [[0, 50, 100]] }], REF).count).toBe(0);
  });
});

describe('pickAircraft', () => {
  // A flat projection that maps Mercator 0..1 straight onto clip space -1..1, heights ignored.
  const p: ProjectionSnapshot = { globe: false, main: [2, 0, 0, 0, 0, -2, 0, 0, 0, 0, 0, 0, -1, 1, 0, 1], fallback: [], transition: 0, altScale: 1 };
  const at = (lon: number, lat: number) => ({ x: mercatorX(lon) * 1000, y: mercatorY(lat) * 1000 });

  it('finds the nearest aircraft within reach of the point', () => {
    const near = plane({ id: 'near', lon: 10, lat: 10 });
    const far = plane({ id: 'far', lon: 20, lat: 10 });
    const point = at(10, 10);
    expect(pickAircraft(p, [far, near], { x: point.x + 3, y: point.y }, 6, 1000, 1000)).toBe('near');
    expect(pickAircraft(p, [far, near], { x: point.x + 40, y: point.y }, 6, 1000, 1000)).toBeNull();
  });
});
