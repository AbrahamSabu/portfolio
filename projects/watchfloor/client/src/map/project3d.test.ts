import { describe, expect, it } from 'vitest';
import { clipPosition, mercatorPerMetre, mercatorX, mercatorY, projectPoint, translated, wrapDx, type ProjectionSnapshot } from './project3d';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('Mercator helpers', () => {
  it('put Greenwich on the equator at the middle of the world', () => {
    expect(mercatorX(0)).toBe(0.5);
    expect(mercatorY(0)).toBeCloseTo(0.5, 12);
    expect(mercatorX(-180)).toBe(0);
    expect(mercatorY(85.051129)).toBeCloseTo(0, 6);
  });

  it('scale heights like MapLibre: one world is the equator, longer per metre towards the poles', () => {
    expect(1 / mercatorPerMetre(0)).toBeCloseTo(2 * Math.PI * 6371008.8, 3);
    expect(mercatorPerMetre(60)).toBeCloseTo(2 * mercatorPerMetre(0), 12);
  });

  it('fold x offsets across the antimeridian', () => {
    expect(wrapDx(0.9)).toBeCloseTo(-0.1, 12);
    expect(wrapDx(-0.7)).toBeCloseTo(0.3, 12);
    expect(wrapDx(0.2)).toBeCloseTo(0.2, 12);
  });
});

describe('translated', () => {
  it('moves the origin, so offsets from a reference land where the absolute point would', () => {
    const m = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 5, 7, 0, 1];
    const t = translated(m, 0.25, 0.5);
    const p = clipPosition({ globe: false, main: t, fallback: t, transition: 0, altScale: 1 }, 0.01, 0.02, 0);
    const q = clipPosition({ globe: false, main: m, fallback: m, transition: 0, altScale: 1 }, 0.26, 0.52, 0);
    p.forEach((v, i) => expect(v).toBeCloseTo(q[i]!, 12));
  });
});

describe('clipPosition', () => {
  const flat: ProjectionSnapshot = { globe: false, main: IDENTITY, fallback: IDENTITY, transition: 0, altScale: 2 };

  it('passes Mercator through the matrix with the height scaled', () => {
    expect(clipPosition(flat, 0.3, 0.4, 100)).toEqual([0.3, 0.4, 200, 1]);
  });

  it('puts the globe on a unit sphere, raised by the height', () => {
    const globe: ProjectionSnapshot = { globe: true, main: IDENTITY, fallback: IDENTITY, transition: 1, altScale: 1 };
    // 0°, 0° faces +z; 90° E is +x; the North Pole is +y.
    const [x, y, z] = clipPosition(globe, mercatorX(0), mercatorY(0), 0);
    expect([x, y, z].map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([0, 0, 1]);
    expect(clipPosition(globe, mercatorX(90), mercatorY(0), 0)[0]).toBeCloseTo(1, 9);
    expect(clipPosition(globe, mercatorX(0), mercatorY(85), 0)[1]).toBeCloseTo(Math.sin((85 * Math.PI) / 180), 6);
    expect(clipPosition(globe, mercatorX(0), mercatorY(0), 6371008.8)[2]).toBeCloseTo(2, 9);
  });

  it('blends towards the flat fallback during the globe-to-flat transition', () => {
    const half: ProjectionSnapshot = { globe: true, main: IDENTITY, fallback: IDENTITY, transition: 0.5, altScale: 1 };
    const [, , z] = clipPosition(half, 0.5, 0.5, 0);
    expect(z).toBeCloseTo(0.5, 9); // halfway between the sphere's z = 1 and the flat z = 0
  });
});

describe('projectPoint', () => {
  it('maps clip space to CSS pixels with y down', () => {
    const p: ProjectionSnapshot = { globe: false, main: IDENTITY, fallback: IDENTITY, transition: 0, altScale: 1 };
    expect(projectPoint(p, 0, 0, 0, 800, 600)).toEqual({ x: 400, y: 300 });
    expect(projectPoint(p, 1, 1, 0, 800, 600)).toEqual({ x: 800, y: 0 });
  });

  it('gives up on ground beyond the globe’s horizon', () => {
    // Camera looking at 0°, 0° (+z): the horizon plane keeps z >= 0.
    const globe: ProjectionSnapshot = { globe: true, main: IDENTITY, fallback: IDENTITY, transition: 1, altScale: 1, clippingPlane: [0, 0, 1, 0] };
    expect(projectPoint(globe, mercatorX(10), mercatorY(0), 0, 10, 10)).not.toBeNull();
    expect(projectPoint(globe, mercatorX(170), mercatorY(0), 0, 10, 10)).toBeNull();
  });

  it('gives up on points behind the camera', () => {
    const behind = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1];
    expect(projectPoint({ globe: false, main: behind, fallback: behind, transition: 0, altScale: 1 }, 0, 0, 0, 10, 10)).toBeNull();
  });
});
