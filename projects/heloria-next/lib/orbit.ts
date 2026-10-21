/**
 * The camera: where it is, what it looks at, and how it gets moved.
 *
 * The figure used to lean a few degrees toward the pointer, which is enough to
 * prove the machine has depth and nowhere near enough to look at anything. The
 * whole point of turning the drive through two right angles is that there are
 * three families of axis to see, and you cannot see a crown mesh from the one
 * angle that happens to be the default.
 *
 * ── Spherical, about a target ────────────────────────────────────────────────
 *
 * Azimuth is measured from the front, which is −Y: at zero you are looking at
 * the machine head on, the way the default shot frames it. Elevation is from
 * the bed plane upward. Everything is stored twice — a target and a current
 * value that chases it — so a drag feels like moving something with weight, and
 * jumping to a named view coasts rather than cutting.
 *
 * ── Why elevation is clamped and azimuth is not ──────────────────────────────
 *
 * Azimuth wraps: going all the way round is meaningful, and a machine you can
 * only see 300° of is a machine with a wrong side. Elevation does not. Below
 * about 4° you are underneath the bed looking at its back face, and above 85°
 * the up vector degenerates and the view rolls unpredictably as it crosses the
 * pole. Neither is a view of anything.
 */

import * as THREE from "three";
import { FLYWHEEL_R, machine } from "./assembly.ts";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export type Orbit = {
  /** where the camera is heading */
  azimuth: number;
  elevation: number;
  distance: number;
  /** what it is heading to look at, relative to the machine's centre */
  target: [number, number, number];
  /** where it is now — all of the above, chased */
  atAzimuth: number;
  atElevation: number;
  atDistance: number;
  atTarget: [number, number, number];
};

export type OrbitLimits = {
  minElevation: number;
  maxElevation: number;
  minDistance: number;
  maxDistance: number;
  /** seconds for the camera to close most of the gap to its target */
  follow: number;
};

export const LIMITS: OrbitLimits = {
  minElevation: 4 * DEG,
  maxElevation: 84 * DEG,
  minDistance: 0.9,
  /* 14. The ceiling has been raised twice for the same reason: it has to clear
     whatever the fit actually asks for, or it silently clamps the camera back
     into the crop the fit was solving. 6.5 was too low for a wide frame, 9 was
     too low once the machine was re-laid upright and grew half as tall again.
     There is no cost to headroom here — nothing drives the camera to the
     ceiling except a fit that needs it. */
  maxDistance: 14,
  follow: 0.16,
};

/**
 * How far back a sphere of `radius` has to be to fit the frame.
 *
 * A preset carries one distance, and one distance cannot know the shape of the
 * frame it will be shown in. The same three-quarter view that sits comfortably
 * in a tall workbench figure is cropped top and bottom in a wide, short panel
 * on a page — measured at NDC y of −1.45 to 1.16, so nearly a third of the
 * machine was outside the glass with nothing reporting it.
 *
 * Vertical field of view is the camera's; the horizontal one follows from the
 * aspect. Whichever is tighter is the one that crops, so that is the one to
 * solve against.
 */
export function fitDistance(
  radius: number,
  fovDeg: number,
  aspect: number,
  /* 1.18 of air, not 1.08. A browser window that is not full screen is shorter
     as well as narrower, and at the tighter margin the machine was touching the
     edges of the glass before anyone had resized anything. */
  margin = 1.18,
) {
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 1e-6));
  return (radius * margin) / Math.sin(Math.min(vHalf, hHalf));
}

export type Preset = {
  key: string;
  label: string;
  hint: string;
  azimuth: number;
  elevation: number;
  distance: number;
  /**
   * True when this view's subject is the whole machine.
   *
   * Such a view has to be reframed for whatever panel it lands in — see
   * `fitDistance`. A detail view must not be: cropping into a crown mesh is
   * the entire point of one, and "fitting" it would pull the camera back until
   * the thing it exists to show is four pixels across.
   */
  whole?: boolean;
  /**
   * What the camera looks AT, relative to the machine's centre.
   *
   * Not a nicety. A preset that picks only an angle and orbits the whole
   * machine cannot show a detail: "look at the input crown" from across the
   * assembly is the same wide shot with its subject a third of the way up the
   * left edge, and pulling closer without moving the target simply crops the
   * wrong thing. The first version did exactly that and framed the flywheel.
   */
  target: [number, number, number];
};

/**
 * Where a part sits relative to the machine's centre.
 *
 * The scene shifts the whole assembly so its bounding-box centre is the origin,
 * so a target has to be expressed in those coordinates rather than in the
 * machine's own.
 */
function centredOn(frame: THREE.Matrix4, along: number): [number, number, number] {
  const M = machine();
  const mid = new THREE.Vector3()
    .addVectors(M.bounds.min, M.bounds.max)
    .multiplyScalar(0.5);
  const p = new THREE.Vector3(0, 0, along).applyMatrix4(frame).sub(mid);
  return [p.x, p.y, p.z];
}

const midpoint = (
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/**
 * Named views, because dragging to a useful angle is a skill and finding the
 * one that shows a crown mesh is a lucky accident.
 *
 * The distances are set against the SUBJECT, not the machine. A crown is about
 * 0.4 across and the cross it hides under is 1.4, so framing tight on the crown
 * crops into the cross and the shot becomes a close-up of a plate with some
 * gold at the edge. Far enough to see what the part is bolted to.
 *
 * Each exists to show something the default cannot: the right-angle drives are
 * invisible from the front, the slow stage reads as a sliver end-on, and the
 * four levels of the stack only make sense from low down.
 */
function buildPresets(): Preset[] {
  const M = machine();
  return [
    {
      key: "three-quarter",
      whole: true,
      label: "Three-quarter",
      hint: "the whole machine",
      azimuth: -26 * DEG,
      elevation: 31 * DEG,
      distance: 4.3,
      target: [0, 0, 0],
    },
    {
      key: "input",
      label: "Input crown",
      hint: "the first right angle",
      azimuth: -62 * DEG,
      elevation: 13 * DEG,
      distance: 2.35,
      target: centredOn(M.frames.driver1.matrix, M.z.crownIn),
    },
    {
      key: "flywheel",
      label: "Flywheel",
      hint: "the heavy wheel",
      /* Its own view, because it never had one. The flywheel stage borrowed
         "input", which aims at the input crown gear — and the framing check in
         director.test.mts found the flywheel projecting at 1.67, well off the
         glass. The stage about the heavy wheel was watching a different part.

         A little off the shaft's axis: a wheel only reads as a wheel from near
         its face, and dead on it the spokes are all that shows. */
      azimuth: -34 * DEG,
      elevation: 18 * DEG,
      /* From the wheel's own size, not tuned: the rim with a little air round
         it, in a square frame. Narrower wells back off from here. */
      distance: fitDistance(FLYWHEEL_R * 1.6, 34, 1),
      target: centredOn(M.frames.inputTop.matrix, M.z.flywheel),
    },
    {
      key: "output",
      label: "Output crown",
      hint: "the second, and the layshaft",
      azimuth: 46 * DEG,
      elevation: 17 * DEG,
      distance: 2.45,
      target: centredOn(M.frames.cross1.matrix, M.z.crownOut),
    },
    {
      key: "slow",
      label: "Slow stage",
      hint: "three slots, on edge",
      /* From the inboard side, looking back along the layshaft.
      
         It used to sit at +16°, which is the freewheel's side — and once the
         output hub was enlarged to read as the machine's destination, it filled
         this frame completely and hid the cross this view exists to show. The
         beat is about the Geneva, so the camera belongs where the Geneva is
         not behind anything. The hub ends up as a ring framing it, which is
         better than either part alone. */
      azimuth: -55 * DEG,
      elevation: 22 * DEG,
      distance: 3.0,
      target: centredOn(M.frames.cross2.matrix, M.z.datum2),
    },
    {
      key: "clutch",
      label: "Freewheel",
      hint: "six rollers, one way",
      /* Close, and nearly square on. The cam is a 15% change in radius and the
         rollers shuttle six degrees — at the three-quarter distance the whole
         clutch is a ring with some orange in it, and at a steep angle the
         relief pockets foreshorten into nothing. */
      /* Swung well off the shaft's axis. A wheel wants to be seen face-on, but
         the bearing that carries an overhung wheel is necessarily outboard of
         it — which is to say directly between the reader and the payoff. Viewed
         a little off-axis the standard falls beside the hub instead of through
         the middle of it, and the wheel still reads as a wheel. */
      azimuth: 18 * DEG,
      elevation: 12 * DEG,
      /* 2.9. Was 1.21 when the hub was small, then 2.6, now a little more again
         for the off-axis angle. The output hub was enlarged to
         read as the machine's destination and is now 1.6 times the diameter it
         was, so the old distance cropped it to a few spokes. Far enough that it
         reads as a wheel; close enough that a 0.03 roller is still a legible
         object rather than an orange speck. */
      distance: 2.9,
      target: centredOn(M.frames.cross2.matrix, M.z.freewheel),
    },
    {
      key: "geneva",
      label: "First Geneva",
      hint: "arm, disc and four slots",
      /* The stage that carries the page's central claim — the wheel waits,
         then snaps a whole quarter, and never rests half way — used to be
         watched from "plan": the whole machine from nearly overhead, fitted
         to a sphere. From above, the machine's footprint is a fraction of that
         sphere, and the Geneva came out as a speck in the middle of an empty
         frame. The claim is only checkable if you can see the slots.

         Aimed between the arm's shaft and the wheel's, from high enough that
         the slots read as slots and low enough that the pin reads as standing
         up out of the plate. */
      azimuth: -18 * DEG,
      elevation: 54 * DEG,
      /* The mechanism's own extent: the centre distance, plus the wheel's rim
         on one side and the arm's reach on the other, halved for a radius. */
      distance: fitDistance(
        (M.d1.centres + M.d1.rim + Math.max(M.d1.crank, M.d1.lock)) / 2,
        34,
        1,
        1.12,
      ),
      target: midpoint(
        centredOn(M.frames.driver1.matrix, M.z.datum1),
        centredOn(M.frames.cross1.matrix, M.z.datum1),
      ),
    },
    {
      key: "plan",
      whole: true,
      label: "Plan",
      hint: "straight down on stage 1",
      azimuth: -8 * DEG,
      elevation: 78 * DEG,
      distance: 3.7,
      target: [0, 0, 0],
    },
    {
      key: "level",
      whole: true,
      label: "Bed level",
      hint: "all four levels of the stack",
      azimuth: -14 * DEG,
      elevation: 6 * DEG,
      distance: 3.9,
      target: [0, 0, 0],
    },
  ];
}

export const PRESETS: Preset[] = buildPresets();
export const DEFAULT_VIEW = PRESETS[0];

export function makeOrbit(p: Preset = DEFAULT_VIEW): Orbit {
  return {
    azimuth: p.azimuth,
    elevation: p.elevation,
    distance: p.distance,
    target: [...p.target],
    atAzimuth: p.azimuth,
    atElevation: p.elevation,
    atDistance: p.distance,
    atTarget: [...p.target],
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Aim at a named view. The camera coasts there rather than cutting. */
export function goTo(o: Orbit, p: Preset, l: OrbitLimits = LIMITS): Orbit {
  return aimAt(o, p, {}, l);
}

/**
 * A preset, with parts of it overridden.
 *
 * For a camera that is being told a story rather than clicked to: a beat wants
 * its view's subject and elevation, but its own distance (because the panel
 * decides that) and a slow drift across its azimuth (because a camera parked
 * dead still for a screen of scrolling reads as a paused video).
 *
 * Sets the *target* fields only. The easing in `stepOrbit` is what turns a new
 * aim every frame into one continuous move, which is why this can be called
 * from a frame loop without the camera juddering between beats.
 */
export function aimAt(
  o: Orbit,
  p: Preset,
  over: { azimuth?: number; distance?: number; lift?: number } = {},
  l: OrbitLimits = LIMITS,
): Orbit {
  /* `lift` drops the look-at point, which raises the subject in frame.
  
     Backwards-feeling but right: whatever the camera is pointed at lands in the
     middle of the picture, so to put the machine above centre you aim below it.
     The page needs this and the workbench does not — a figure with a column of
     text over its lower half wants its subject in the upper two thirds, and one
     sitting on its own panel wants it centred. */
  const lift = over.lift ?? 0;
  return {
    ...o,
    azimuth: nearestTurn(o.atAzimuth, over.azimuth ?? p.azimuth),
    elevation: clamp(p.elevation, l.minElevation, l.maxElevation),
    distance: clamp(over.distance ?? p.distance, l.minDistance, l.maxDistance),
    target: [p.target[0], p.target[1], p.target[2] - lift],
  };
}

/**
 * The equivalent of `to` that is closest to where the camera already is.
 *
 * Without this, swinging from +170° to −170° takes the long way: 340° through
 * the front of the machine rather than 20° across the back. Both are the same
 * angle and only one of them looks deliberate.
 */
export function nearestTurn(from: number, to: number) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return from + d;
}

/** Drag: pixels to radians, scaled so a drag across the figure is a half turn. */
export function drag(
  o: Orbit,
  dx: number,
  dy: number,
  width: number,
  height: number,
  l: OrbitLimits = LIMITS,
): Orbit {
  return {
    ...o,
    azimuth: o.azimuth + (dx / Math.max(1, width)) * Math.PI,
    elevation: clamp(
      o.elevation - (dy / Math.max(1, height)) * Math.PI * 0.8,
      l.minElevation,
      l.maxElevation,
    ),
  };
}

/** Pinch or a zoom button. Multiplicative, so it feels the same at any range. */
export function zoom(o: Orbit, factor: number, l: OrbitLimits = LIMITS): Orbit {
  return {
    ...o,
    distance: clamp(o.distance * factor, l.minDistance, l.maxDistance),
  };
}

/**
 * Chase the target by `dt`.
 *
 * `1 − exp(−dt/τ)` rather than a fixed fraction per frame, for the same reason
 * the drive uses it: a fixed fraction is a different camera at 144Hz than at
 * 60Hz, and whoever tunes the feel tunes it only for their own screen.
 */
export function stepOrbit(o: Orbit, dt: number, l: OrbitLimits = LIMITS): Orbit {
  if (!(dt > 0)) return o;
  const k = 1 - Math.exp(-dt / l.follow);
  return {
    ...o,
    atAzimuth: o.atAzimuth + (o.azimuth - o.atAzimuth) * k,
    atElevation: o.atElevation + (o.elevation - o.atElevation) * k,
    atDistance: o.atDistance + (o.distance - o.atDistance) * k,
    atTarget: [
      o.atTarget[0] + (o.target[0] - o.atTarget[0]) * k,
      o.atTarget[1] + (o.target[1] - o.atTarget[1]) * k,
      o.atTarget[2] + (o.target[2] - o.atTarget[2]) * k,
    ],
  };
}

/**
 * Camera position for the current state.
 *
 * Azimuth 0 is the front, −Y. Elevation lifts toward +Z, which is up for this
 * machine — its bed lies in the XY plane.
 */
export function positionOf(o: Orbit): [number, number, number] {
  const ce = Math.cos(o.atElevation);
  const se = Math.sin(o.atElevation);
  return [
    o.atTarget[0] + Math.sin(o.atAzimuth) * ce * o.atDistance,
    o.atTarget[1] - Math.cos(o.atAzimuth) * ce * o.atDistance,
    o.atTarget[2] + se * o.atDistance,
  ];
}

/** What the camera should be pointed at right now. */
export const lookAtOf = (o: Orbit): [number, number, number] => [...o.atTarget];

/** True when the camera has effectively arrived, for pausing a render loop. */
export function settled(o: Orbit, eps = 1e-4) {
  return (
    Math.abs(o.azimuth - o.atAzimuth) < eps &&
    Math.abs(o.elevation - o.atElevation) < eps &&
    Math.abs(o.distance - o.atDistance) < eps &&
    o.target.every((v, i) => Math.abs(v - o.atTarget[i]) < eps)
  );
}
