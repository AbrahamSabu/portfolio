/**
 * The camera, framed.
 *
 *   node lib/director.test.mts
 *
 * The page cannot be relied on to take a screenshot in this setup, and even
 * when it can, a screenshot is one width. The failure this exists for is a
 * view that looks right in the frame it was tuned in and loses its subject in
 * another — which is exactly what happened when the detail presets, tuned for
 * a landscape panel on an earlier page, met a well that is narrower than it is
 * tall at every width between 768 and 1024.
 *
 * So: every stage, at both ends of its drift, at every well shape the page
 * produces, projected with a real three.js camera. The points that must be in
 * frame are the stage's own labels — a label pointing at something off the
 * edge of the glass is worse than no label.
 */

import * as THREE from "three";
import { machine } from "./assembly.ts";
import { STAGES } from "./build.ts";
import { FOV, cameraPosition, shotFor } from "./director.ts";
import { anchorPoint } from "./story.ts";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name.padEnd(58)} ${detail}`);
  } else {
    fail++;
    console.log(`FAIL  ${name.padEnd(58)} ${detail}`);
  }
}

/* Width over height of the well, measured off the page at these viewports.
   The well is 43% wide from 768, 48% from 1024 and 52% from 1280, and the full
   height; on a phone it is the full width and 46% of the height. */
const WELLS: [string, number][] = [
  ["768 x 900", (768 * 0.43) / 900],
  ["820 x 700", (820 * 0.43) / 700],
  ["1024 x 768", (1024 * 0.48) / 768],
  ["1280 x 800", (1280 * 0.52) / 800],
  ["1440 x 700", (1440 * 0.52) / 700],
  ["1920 x 1080", (1920 * 0.52) / 1080],
  /* On a phone the well is a band from under the 52px header to 46% of the
     screen — wide and short, which is where labels are most likely to run off
     its edge. */
  ["phone 375 x 812", 375 / (812 * 0.46 - 52)],
  ["phone 360 x 640", 360 / (640 * 0.46 - 52)],
  ["phone 414 x 896", 414 / (896 * 0.46 - 52)],
];

const M = machine();
const mid = new THREE.Vector3().addVectors(M.bounds.min, M.bounds.max).multiplyScalar(0.5);
const corners: THREE.Vector3[] = [];
for (const x of [M.bounds.min.x, M.bounds.max.x])
  for (const y of [M.bounds.min.y, M.bounds.max.y])
    for (const z of [M.bounds.min.z, M.bounds.max.z]) corners.push(new THREE.Vector3(x, y, z).sub(mid));

const project = (p: THREE.Vector3, cam: THREE.PerspectiveCamera) => p.clone().project(cam);

// ===========================================================================
// Every stage's subject is in frame, everywhere
// ===========================================================================
{
  /* Labels need room for their words as well as their dot, so they have to sit
     inside the middle 88% of the frame, not merely on the glass. */
  const LABEL = 0.88;

  for (const [si, stage] of STAGES.entries()) {
    let worstLabel = 0;
    let worstWhole = 0;
    let where = "";
    for (const [name, aspect] of WELLS) {
      /* Both ends of the drift: just after the stage takes focus, and seated. */
      for (const within of [0.002, 1]) {
        const shot = shotFor({ index: si, within }, aspect);
        const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.05, 100);
        cam.up.set(0, 0, 1);
        cam.position.set(...cameraPosition(shot));
        cam.lookAt(...shot.target);
        cam.updateMatrixWorld(true);
        cam.updateProjectionMatrix();

        for (const a of stage.anchors) {
          const v = project(new THREE.Vector3(...anchorPoint(a)), cam);
          const e = Math.max(Math.abs(v.x), Math.abs(v.y));
          if (v.z > 1) worstLabel = Infinity;
          if (e > worstLabel) {
            worstLabel = e;
            where = `"${a.label}" at ${name}`;
          }
        }
        if (shot.preset.whole) {
          for (const c of corners) {
            const v = project(c, cam);
            worstWhole = Math.max(worstWhole, Math.abs(v.x), Math.abs(v.y));
          }
        }
      }
    }
    check(`${stage.key}: every label in frame at every well`, worstLabel <= LABEL,
      `worst ${worstLabel.toFixed(2)} of ${LABEL} — ${where}`);
    if (shotFor({ index: si, within: 1 }, 1).preset.whole) {
      check(`${stage.key}: ...and the whole machine`, worstWhole <= 1,
        `bounding box reaches ${worstWhole.toFixed(2)} of 1.00`);
    }
  }
}

// ===========================================================================
// A detail view is still a detail
// ===========================================================================
{
  /* Backing a detail off for a narrow well is right up to the point where it
     stops being a detail. If it ends up further away than the whole-machine
     fit, the camera is showing the whole machine with the subject somewhere
     in it — the view has lost the one thing it was for. */
  const lost: string[] = [];
  for (const [si, stage] of STAGES.entries()) {
    for (const [name, aspect] of WELLS) {
      const shot = shotFor({ index: si, within: 1 }, aspect);
      if (shot.preset.whole) continue;
      const whole = shotFor({ index: 0, within: 1 }, aspect).distance;
      if (shot.distance >= whole) lost.push(`${stage.key} at ${name}`);
    }
  }
  check("every detail view is closer than the whole machine", lost.length === 0,
    lost.length ? lost.join(", ") : "at every well shape");
}

// ===========================================================================
// The camera settles while the words are read
// ===========================================================================
{
  /* The drift runs while parts arrive and stops when they are seated, so a
     note is read with the camera still. Seated is within = 1, and anything
     past it must not keep swinging. */
  const moving = STAGES.filter((_, si) =>
    shotFor({ index: si, within: 1 }, 0.8).azimuth !== shotFor({ index: si, within: 5 }, 0.8).azimuth,
  ).map((s) => s.key);
  check("the camera is still once a stage is seated", moving.length === 0,
    moving.length ? moving.join(", ") : "drift ends with the landing");
}

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
