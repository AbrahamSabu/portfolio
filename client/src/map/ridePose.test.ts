import { describe, expect, it } from 'vitest';
import { PoseSmoother, poseAdd, poseDelta, type Pose } from './ridePose';

const pose = (lat: number, lon: number, altM: number, bearing: number): Pose => ({ lat, lon, altM, bearing });

describe('poseDelta and poseAdd', () => {
  it('turn the short way round and wrap the antimeridian', () => {
    expect(poseDelta(pose(0, 0, 0, 10), pose(0, 0, 0, 350)).bearing).toBeCloseTo(20);
    expect(poseDelta(pose(0, -179.9, 0, 0), pose(0, 179.9, 0, 0)).lon).toBeCloseTo(0.2);
    expect(poseAdd(pose(0, 179.9, 0, 350), pose(0, 0.2, 0, 20))).toMatchObject({ bearing: 10 });
    expect(poseAdd(pose(0, 179.9, 0, 350), pose(0, 0.2, 0, 20)).lon).toBeCloseTo(-179.9);
  });
});

describe('PoseSmoother', () => {
  it('follows the estimate exactly while reports agree with it', () => {
    const s = new PoseSmoother();
    s.next(pose(50, 0, 9000, 90), 1, 0.016);
    const p = s.next(pose(50, 0.01, 9000, 90), 1, 0.016);
    expect([p.lat, p.lon, p.altM, p.bearing].map((v) => +v.toFixed(9))).toEqual([50, 0.01, 9000, 90]);
  });

  it("doesn't jump when a new report corrects the estimate, then eases into it", () => {
    const s = new PoseSmoother(0.8);
    const before = s.next(pose(50, 0, 9000, 90), 1, 0.016);
    const corrected = pose(50, 0.002, 9300, 95); // the new report: 140 m on, 300 m higher, turned 5°
    const atReport = s.next(corrected, 2, 0);
    expect(atReport.lon).toBeCloseTo(before.lon, 9);
    expect(atReport.altM).toBeCloseTo(9000, 6);
    let p = atReport;
    for (let i = 0; i < 600; i++) p = s.next(corrected, 2, 1 / 60); // ten seconds later
    expect(p.altM).toBeCloseTo(9300, 0);
    expect(p.bearing).toBeCloseTo(95, 2);
  });

  it('eases from where the fly-in left the camera', () => {
    const s = new PoseSmoother(0.8);
    s.startFrom(pose(50, 0, 9000, 90), pose(50, 0.01, 9000, 92), 7);
    const first = s.next(pose(50, 0.01, 9000, 92), 7, 0.1);
    expect(first.lon).toBeGreaterThan(0);
    expect(first.lon).toBeLessThan(0.01);
  });
});
