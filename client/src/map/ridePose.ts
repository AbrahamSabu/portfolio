import { headingDelta, normalizeDeg, normalizeLon } from '@watchfloor/shared';

/** Where the ride's camera is: position, altitude (m) and which way it points (° true). */
export interface Pose {
  lat: number;
  lon: number;
  altM: number;
  bearing: number;
}

export const NO_OFFSET: Pose = { lat: 0, lon: 0, altM: 0, bearing: 0 };

/** `a − b`, the bearing the short way round. */
export function poseDelta(a: Pose, b: Pose): Pose {
  return { lat: a.lat - b.lat, lon: normalizeLon(a.lon - b.lon), altM: a.altM - b.altM, bearing: headingDelta(b.bearing, a.bearing) };
}

export function poseAdd(a: Pose, d: Pose): Pose {
  return { lat: a.lat + d.lat, lon: normalizeLon(a.lon + d.lon), altM: a.altM + d.altM, bearing: normalizeDeg(a.bearing + d.bearing) };
}

/**
 * Keeps the camera smooth when a new report corrects the dead-reckoned
 * estimate. The camera follows the estimate exactly, plus an offset: when a
 * report moves the estimate, the offset takes up the jump (so the camera
 * doesn't move that frame), then fades over about `tauS` seconds. Altitude
 * steps between reports (there's no climb rate) ease in the same way.
 */
export class PoseSmoother {
  private offset: Pose = NO_OFFSET;
  private shown: Pose | null = null;
  private reportAt: number | null = null;

  constructor(private readonly tauS = 0.8) {}

  /** The pose to draw this frame, for an estimate made from the report observed at `reportAt`. */
  next(estimate: Pose, reportAt: number, dtS: number): Pose {
    if (this.shown && reportAt !== this.reportAt) this.offset = poseDelta(this.shown, estimate);
    this.reportAt = reportAt;
    const k = Math.exp(-Math.max(0, dtS) / this.tauS);
    this.offset = { lat: this.offset.lat * k, lon: this.offset.lon * k, altM: this.offset.altM * k, bearing: this.offset.bearing * k };
    this.shown = poseAdd(estimate, this.offset);
    return this.shown;
  }

  /** Start from a pose the camera is already at (after flying in), easing towards the estimate. */
  startFrom(pose: Pose, estimate: Pose, reportAt: number): void {
    this.offset = poseDelta(pose, estimate);
    this.shown = pose;
    this.reportAt = reportAt;
  }
}
