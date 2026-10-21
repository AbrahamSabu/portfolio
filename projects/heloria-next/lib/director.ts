/**
 * Where the camera is, as a function of how far down the page the reader is.
 *
 * Pure, and kept out of the component on purpose: framing is the thing most
 * likely to be quietly wrong — a label off the edge of a narrow well, a detail
 * view cropped in a frame of a shape nobody tried — and a pure function can be
 * checked for every stage at every well shape in node, where a browser pane in
 * this setup cannot reliably be made to take a screenshot at all.
 *
 * ── One view per stage, fitted to the well ───────────────────────────────────
 *
 * A stage names a preset. Whole-machine presets are fitted to the frame they
 * land in, because one distance cannot know the shape of the frame. Detail
 * presets keep their own distance — cropping in is what they are for — but
 * back off in proportion when the well is narrower than square, which it
 * always is between 768 and 1024: at the old fixed distance a detail tuned in
 * a landscape panel lost both sides of its subject.
 */

import * as THREE from "three";
import { machine } from "./assembly.ts";
import { STAGES, type Reading, type Stage } from "./build.ts";
import { type Preset } from "./orbit.ts";
import { anchorPoint, viewFor } from "./story.ts";

const DEG = Math.PI / 180;

/** The page's field of view. The canvas is created with this. */
export const FOV = 34;

/**
 * How far the camera swings across a stage, in degrees.
 *
 * Only while the stage's parts are arriving: the drift follows `within`, which
 * stops at 1 when the parts are seated, so the camera settles while the note
 * is read. A camera still moving while somebody reads is a second
 * thing to watch; one that never moves during assembly makes the parts' own
 * motion the only depth cue there is.
 */
export const DRIFT = 10;

/**
 * The aspect the detail presets were framed for.
 *
 * Below it, a detail view backs off in proportion to how much narrower the
 * well is. Set from the framing check in `director.test.mts` rather than by
 * eye — which is how the numbers in `orbit.ts` came to be tuned for a panel
 * shape this site does not have.
 */
export const DETAIL_ASPECT = 1.0;

export type Shot = {
  index: number;
  stage: Stage;
  preset: Preset;
  azimuth: number;
  elevation: number;
  distance: number;
  target: [number, number, number];
};

/**
 * The shot for the stage being read.
 *
 * Takes the focus rather than working it out from progress: which stage the
 * reader is on is decided by where its note is on the page, in `readingFrom`,
 * and a second opinion derived here would be a second place for the camera
 * and the words to disagree.
 */
export function shotFor(focus: Reading["focus"], aspect: number, fov = FOV): Shot {
  const index = Math.min(STAGES.length - 1, Math.max(0, focus.index));
  const stage = STAGES[index];
  const within = Math.min(1, Math.max(0, focus.within));
  const preset = viewFor(stage.view);
  const a = Math.max(aspect, 1e-3);
  const azimuth = preset.azimuth + (within - 0.5) * DRIFT * DEG;

  if (preset.whole) {
    /* Fitted to the machine's box as this camera sees it, not to a sphere
       round it. The sphere is right for every angle at once and therefore
       generous for each one: from overhead the machine's footprint is a
       fraction of it, and the first Geneva came out as a speck. */
    const target = wholeTarget();
    return {
      index,
      stage,
      preset,
      azimuth,
      elevation: preset.elevation,
      distance: fitPoints(CORNERS(), target, azimuth, preset.elevation, a, fov, WHOLE_FILL),
      target,
    };
  }

  return {
    index,
    stage,
    preset,
    azimuth,
    elevation: preset.elevation,
    distance: preset.distance * Math.max(1, DETAIL_ASPECT / a),
    target: subjectOf(stage, preset),
  };
}

/**
 * The shot once the build is over: the whole machine, from three-quarters.
 *
 * Without it the page ended on a close-up of the freewheel, the last part in,
 * and the reader who scrolled to the bottom never saw what all the parts made.
 * `index` is -1 so no stage's labels are shown over the finished machine.
 */
export function finishedShot(aspect: number, fov = FOV): Shot {
  const preset = viewFor("three-quarter");
  const target = wholeTarget();
  return {
    index: -1,
    stage: STAGES[STAGES.length - 1],
    preset,
    azimuth: preset.azimuth,
    elevation: preset.elevation,
    distance: fitPoints(CORNERS(), target, preset.azimuth, preset.elevation, Math.max(aspect, 1e-3), fov, WHOLE_FILL),
    target,
  };
}

/**
 * How much of the frame a whole-machine view fills: its box reaches this
 * fraction of the way to the edge. Room left for labels, which hang off the
 * side of their dot.
 */
export const WHOLE_FILL = 0.86;

/**
 * What a detail view looks at: the middle of the things its stage names.
 *
 * Not simply the preset's target, which is one part. A stage that names two —
 * the gearing names the crown and the spur pair beside it — aimed at one of
 * them cropped the other off the edge of the frame. Labels with a sideways
 * offset are left out: that offset moves the words, not the part.
 */
function subjectOf(stage: Stage, preset: Preset): [number, number, number] {
  const points = stage.anchors.filter((a) => !a.offset).map(anchorPoint);
  if (points.length === 0) return [...preset.target];
  const n = points.length;
  return [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
    points.reduce((s, p) => s + p[2], 0) / n,
  ];
}

/**
 * Where a whole-machine shot aims: the middle of everything it fits, bed and
 * standard included. Aiming at the mechanism's own centre, with the bed
 * running well past it on one side, left the fitted frame lopsided — the
 * machine pushed to one edge and the fit pulled back to keep the far end in.
 */
function wholeTarget(): [number, number, number] {
  const box = new THREE.Box3().setFromPoints(CORNERS());
  const c = box.getCenter(new THREE.Vector3());
  return [c.x, c.y, c.z];
}

/** The machine's bounding box corners, in the scene's centred coordinates. */
let corners: THREE.Vector3[] | null = null;
function CORNERS() {
  if (corners) return corners;
  const M = machine();
  const mid = new THREE.Vector3().addVectors(M.bounds.min, M.bounds.max).multiplyScalar(0.5);
  corners = [];
  for (const x of [M.bounds.min.x, M.bounds.max.x])
    for (const y of [M.bounds.min.y, M.bounds.max.y])
      for (const z of [M.bounds.min.z, M.bounds.max.z])
        corners.push(new THREE.Vector3(x, y, z).sub(mid));

  /* The bed and the standard as well. `bounds` is the mechanism only, and the
     camera fitted to it put the bed's far end and the standard past the edge
     of the frame — so the first thing on the page, a plate and a post with
     nothing on them yet, was the one shot that cropped its own subject, and
     the finished machine ended with its bearing post sliced off. The bed's
     top face is enough for it: the underside is never in view from above. */
  const { bed, post } = M;
  for (const x of [bed.cx - bed.w / 2, bed.cx + bed.w / 2])
    for (const y of [bed.cy - bed.d / 2, bed.cy + bed.d / 2])
      corners.push(new THREE.Vector3(x, y, 0).sub(mid));
  for (const x of [post.x - post.w / 2, post.x + post.w / 2])
    for (const y of [post.y - post.d / 2, post.y + post.d / 2])
      corners.push(new THREE.Vector3(x, y, post.h).sub(mid));
  return corners;
}

const probe = new THREE.PerspectiveCamera();
const v = new THREE.Vector3();

/**
 * The distance at which a set of points just fills `fill` of the frame.
 *
 * Bisection on the real projection rather than a formula, because the shape
 * that has to fit is a box seen at an angle, which has no closed form worth
 * the trouble — and forty projections of eight points is nothing.
 */
export function fitPoints(
  points: THREE.Vector3[],
  target: [number, number, number],
  azimuth: number,
  elevation: number,
  aspect: number,
  fov: number,
  fill: number,
) {
  probe.fov = fov;
  probe.aspect = aspect;
  probe.near = 0.01;
  probe.far = 200;
  probe.up.set(0, 0, 1);
  probe.updateProjectionMatrix();

  let lo = 0.2;
  let hi = 80;
  for (let k = 0; k < 44; k++) {
    const d = (lo + hi) / 2;
    const ce = Math.cos(elevation);
    probe.position.set(
      target[0] + Math.sin(azimuth) * ce * d,
      target[1] - Math.cos(azimuth) * ce * d,
      target[2] + Math.sin(elevation) * d,
    );
    probe.lookAt(target[0], target[1], target[2]);
    probe.updateMatrixWorld(true);
    let worst = 0;
    for (const p of points) {
      v.copy(p).project(probe);
      /* Behind the camera, or past the near plane: far too close. */
      if (v.z > 1 || v.z < -1) {
        worst = Infinity;
        break;
      }
      worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y));
    }
    if (worst > fill) lo = d;
    else hi = d;
  }
  return hi;
}

/** Where a shot puts the camera, in the scene's coordinates. */
export function cameraPosition(s: Shot): [number, number, number] {
  const ce = Math.cos(s.elevation);
  return [
    s.target[0] + Math.sin(s.azimuth) * ce * s.distance,
    s.target[1] - Math.cos(s.azimuth) * ce * s.distance,
    s.target[2] + Math.sin(s.elevation) * s.distance,
  ];
}
