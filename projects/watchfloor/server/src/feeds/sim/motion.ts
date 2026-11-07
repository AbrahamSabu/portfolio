import {
  bearingDeg,
  destination,
  distanceM,
  headingDelta,
  normalizeDeg,
  type BBox,
  type LatLon,
} from '@watchfloor/shared';
import type { SimEntity } from './entity';
import type { Rng } from './rng';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Holding levels are 1,000 ft apart. */
export const HOLD_LEVEL_M = 304.8;
/** Where an aircraft leaving a stack descends to for its approach: 3,000 ft. */
const APPROACH_ALTITUDE_M = 914;

/**
 * Distance at which a waypoint counts as reached: a bit more than the current
 * turn radius, or one step's travel if that's more (a long step through the
 * past would otherwise overshoot and circle back).
 */
function arrivalRadiusM(e: SimEntity, dt: number): number {
  const turnRateRad = (e.maxTurnRateDps * Math.PI) / 180;
  const turnRadius = Math.max(e.speedMps, e.cruiseSpeedMps * 0.25) / turnRateRad;
  return Math.max(250, turnRadius * 1.3, e.speedMps * dt);
}

export function randomPointIn(area: BBox, rng: Rng): LatLon {
  return { lat: rng.range(area.south, area.north), lon: rng.range(area.west, area.east) };
}

/**
 * Advance one entity by dtMs: pick a desired course from its behaviour, then
 * turn, accelerate and climb within its performance limits, then move.
 * Limits on turn rate and acceleration are what make tracks curve and slow
 * down believably instead of snapping between waypoints.
 */
export function advance(e: SimEntity, dtMs: number, now: number, rng: Rng): void {
  const dt = dtMs / 1000;
  if (dt <= 0) return;

  let desiredCourse = e.courseDeg;
  let targetSpeed = e.cruiseSpeedMps;

  if (now < e.dwellUntil) {
    targetSpeed = 0;
  } else {
    const b = e.behaviour;
    switch (b.kind) {
      case 'route': {
        let target = b.points[b.next]!;
        if (distanceM(e.pos, target) < arrivalRadiusM(e, dt)) {
          if (b.next < b.points.length - 1) {
            b.next++;
          } else if (b.mode === 'once') {
            e.done = true;
            return;
          } else if (b.mode === 'loop') {
            b.next = 0;
          } else {
            b.points.reverse();
            b.next = 1;
            if (b.dwellAtEndsMs) {
              e.dwellUntil = now + rng.range(...b.dwellAtEndsMs);
              targetSpeed = 0;
            }
          }
          target = b.points[b.next]!;
        }
        desiredCourse = bearingDeg(e.pos, target);
        // Ferries slow down on the final approach so they stop in port, not on the beach.
        if (b.mode === 'pingpong' && b.next === b.points.length - 1 && now >= e.dwellUntil) {
          targetSpeed = e.cruiseSpeedMps * clamp(distanceM(e.pos, target) / 3000, 0.15, 1);
        }
        break;
      }
      case 'orbit': {
        const d = distanceM(b.center, e.pos);
        const radial = bearingDeg(b.center, e.pos);
        // Fly the tangent, bending inwards when outside the circle and outwards when inside.
        const correction = clamp(((d - b.radiusM) / b.radiusM) * 90, -60, 60);
        desiredCourse = b.clockwise ? radial + 90 + correction : radial - 90 - correction;
        break;
      }
      case 'hold': {
        let target = b.points[b.next]!;
        if (distanceM(e.pos, target) < arrivalRadiusM(e, dt)) {
          b.next = (b.next + 1) % b.points.length;
          // Over the fix again: a lap done, so down a level, or off the bottom towards the runway.
          if (b.next === 1) {
            const level = (e.targetAltitudeM ?? e.altitudeM ?? b.floorM) - HOLD_LEVEL_M;
            if (level < b.floorM - 1) {
              e.behaviour = { kind: 'route', points: b.exit, next: 0, mode: 'once' };
              e.targetAltitudeM = APPROACH_ALTITUDE_M;
              desiredCourse = bearingDeg(e.pos, b.exit[0]!);
              break;
            }
            e.targetAltitudeM = level;
          }
          target = b.points[b.next]!;
        }
        desiredCourse = bearingDeg(e.pos, target);
        break;
      }
      case 'loiter': {
        if (distanceM(e.pos, b.target) < arrivalRadiusM(e, dt)) {
          b.target = randomPointIn(b.area, rng);
          e.cruiseSpeedMps = rng.range(...e.speedRangeMps);
          if (e.altitudeRangeM) e.targetAltitudeM = rng.range(...e.altitudeRangeM);
          if (rng.chance(b.dwellChance)) {
            e.dwellUntil = now + rng.range(...b.dwellMs);
            targetSpeed = 0;
          }
        }
        desiredCourse = bearingDeg(e.pos, b.target);
        break;
      }
    }
  }

  // Turn towards the desired course, limited by turn rate.
  const maxTurn = e.maxTurnRateDps * dt;
  const turn = clamp(headingDelta(e.courseDeg, desiredCourse), -maxTurn, maxTurn);
  // Stationary vessels don't swing around on the spot.
  if (e.speedMps > 0.3 || targetSpeed > 0) e.courseDeg = normalizeDeg(e.courseDeg + turn);

  // Speed and altitude ease towards their targets.
  const maxDv = e.accelMps2 * dt;
  e.speedMps = Math.max(0, e.speedMps + clamp(targetSpeed - e.speedMps, -maxDv, maxDv));
  if (e.altitudeM !== undefined && e.targetAltitudeM !== undefined) {
    const maxDh = e.climbRateMps * dt;
    e.altitudeM += clamp(e.targetAltitudeM - e.altitudeM, -maxDh, maxDh);
  }

  if (e.speedMps > 0) e.pos = destination(e.pos, e.courseDeg, e.speedMps * dt);
}
