/**
 * The camera.
 *
 *   node lib/orbit.test.mts
 *
 * Two checks earn their place. Frame-rate independence, for the same reason
 * the drive has one — a follow written as a fixed fraction per frame is a
 * different camera at 144Hz than at 60Hz, and the person who tuned it is the
 * only one who gets what they tuned. And shortest-way turning, because a swing
 * from +170° to −170° is 20° across the back of the machine or 340° through
 * the front of it, and both are the same angle.
 */

import { readFileSync } from "node:fs";
import * as THREE from "three";
import { machine } from "./assembly.ts";
import {
  DEFAULT_VIEW,
  LIMITS,
  PRESETS,
  fitDistance,
  drag,
  goTo,
  makeOrbit,
  nearestTurn,
  positionOf,
  settled,
  stepOrbit,
  zoom,
  type Orbit,
} from "./orbit.ts";

const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;
let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name.padEnd(50)} ${detail}`);
  } else {
    fail++;
    console.log(`FAIL  ${name.padEnd(50)} ${detail}`);
  }
}

/**
 * An exact number of steps, not an accumulating clock.
 *
 * `for (t = 0; t < seconds; t += 1/hz)` looks equivalent and is not: 1/24 has
 * no exact binary form, so after 24 steps the accumulator lands a hair under 1
 * and a twenty-fifth step runs. That is a 4% longer simulation at 24Hz than at
 * 60Hz, and it reads as the model being frame-rate dependent when the fault is
 * entirely in the harness.
 */
const settle = (o: Orbit, seconds = 3, hz = 60) => {
  let s = o;
  const steps = Math.round(seconds * hz);
  for (let i = 0; i < steps; i++) s = stepOrbit(s, 1 / hz);
  return s;
};

// ===========================================================================
// Frame rate must not change the camera
// ===========================================================================
{
  const target = goTo(makeOrbit(), PRESETS[2]);
  const a = settle(target, 1, 60);
  const b = settle(target, 1, 144);
  const c = settle(target, 1, 24);
  const spread =
    Math.max(a.atAzimuth, b.atAzimuth, c.atAzimuth) -
    Math.min(a.atAzimuth, b.atAzimuth, c.atAzimuth);
  check("one second is one second at any frame rate", spread < 1e-9,
    `${deg(spread).toExponential(1)}° between 24, 60 and 144Hz`);

  const arrived = settle(target, 3);
  check("the camera arrives", settled(arrived),
    `${deg(Math.abs(arrived.azimuth - arrived.atAzimuth)).toExponential(1)}° short after 3s`);
}

// ===========================================================================
// Turning the short way
// ===========================================================================
{
  const near = nearestTurn(170 * (Math.PI / 180), -170 * (Math.PI / 180));
  check("it turns the short way round", Math.abs(deg(near) - 190) < 1e-9,
    `+170° to −170° goes to ${deg(near).toFixed(0)}°, a ${deg(near - 170 * (Math.PI / 180)).toFixed(0)}° move`);

  /* And a preset reached from anywhere never takes more than half a turn. */
  let worst = 0;
  for (let i = 0; i < 72; i++) {
    const from = { ...makeOrbit(), atAzimuth: (i / 72) * TAU - Math.PI };
    for (const p of PRESETS) {
      const to = goTo(from, p);
      worst = Math.max(worst, Math.abs(to.azimuth - from.atAzimuth));
    }
  }
  check("no preset is ever more than half a turn away", worst <= Math.PI + 1e-9,
    `worst swing ${deg(worst).toFixed(1)}°`);
}

// ===========================================================================
// Limits
// ===========================================================================
{
  let o = makeOrbit();
  for (let i = 0; i < 200; i++) o = drag(o, 0, 400, 800, 600);
  check("cannot be dragged under the bed", o.elevation >= LIMITS.minElevation - 1e-12,
    `floor ${deg(LIMITS.minElevation).toFixed(0)}°, reached ${deg(o.elevation).toFixed(1)}°`);

  o = makeOrbit();
  for (let i = 0; i < 200; i++) o = drag(o, 0, -400, 800, 600);
  check("cannot be dragged over the pole", o.elevation <= LIMITS.maxElevation + 1e-12,
    `ceiling ${deg(LIMITS.maxElevation).toFixed(0)}°, reached ${deg(o.elevation).toFixed(1)}°`);

  /* Azimuth is deliberately not clamped: a machine you can only see 300° of is
     a machine with a wrong side. */
  o = makeOrbit();
  for (let i = 0; i < 40; i++) o = drag(o, 300, 0, 800, 600);
  check("azimuth goes all the way round", Math.abs(o.azimuth) > TAU,
    `${deg(o.azimuth).toFixed(0)}° after forty drags`);

  o = makeOrbit();
  for (let i = 0; i < 60; i++) o = zoom(o, 0.8);
  check("cannot be zoomed inside the machine", o.distance >= LIMITS.minDistance - 1e-12,
    `${o.distance.toFixed(3)} against a floor of ${LIMITS.minDistance}`);
  for (let i = 0; i < 120; i++) o = zoom(o, 1.2);
  check("...nor out past the point of it", o.distance <= LIMITS.maxDistance + 1e-12,
    `${o.distance.toFixed(3)}`);
}

// ===========================================================================
// Framing
// ===========================================================================
{
  /* A preset carries one distance and cannot know the shape of the frame it
     lands in. The three-quarter view sat comfortably in the tall workbench
     figure and was cropped top and bottom in the page's wide, short panel —
     measured at NDC y of −1.45 to 1.16, which nothing was reporting because
     the only thing that would have noticed is a person looking at it. */
  const M = machine();
  const radius =
    new THREE.Vector3().subVectors(M.bounds.max, M.bounds.min).length() / 2;

  /* Solve it, then check the geometry it claims: at that distance the sphere
     must subtend no more than the frame's tighter half-angle. */
  const fits = (fov: number, aspect: number) => {
    const d = fitDistance(radius, fov, aspect);
    const vHalf = (fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    return Math.asin(radius / d) <= Math.min(vHalf, hHalf) + 1e-12;
  };

  const shapes: [string, number, number][] = [
    ["page panel", 34, 961 / 520],
    ["bench figure", 34, 1280 / 540],
    ["phone", 40, 327 / 320],
    ["square", 34, 1],
    ["very wide", 34, 3.2],
  ];
  const bad = shapes.filter(([, f, a]) => !fits(f, a)).map(([n]) => n);
  check("the machine fits every frame it is shown in", bad.length === 0,
    bad.length ? bad.join(", ") : `${shapes.length} shapes, radius ${radius.toFixed(2)}`);

  /* The shape that actually failed, against the distance the preset asks for. */
  const need = fitDistance(radius, 34, 961 / 520);
  const preset = PRESETS.find((v) => v.key === "three-quarter")!;
  check("...which the preset distance alone did not", need > preset.distance,
    `needs ${need.toFixed(2)}, preset asks ${preset.distance}`);

  /* And the ceiling has to allow the answer, or the fit is clamped back into
     the crop it was solving. */
  check("the zoom ceiling allows a fitted view", need <= LIMITS.maxDistance,
    `${need.toFixed(2)} against a ceiling of ${LIMITS.maxDistance}`);

  /* `whole` decides whether a view gets reframed, and a flag that drifts from
     what the view actually shows is worse than no flag: mark a detail view
     whole and the camera pulls back until the crown mesh it exists to show is
     a few pixels across; leave a whole view unmarked and it stays cropped.
     So it is checked against where each view is actually pointed. */
  const offCentre = (p: (typeof PRESETS)[number]) =>
    new THREE.Vector3(...p.target).length(); // targets are machine-relative

  const wrong = PRESETS.filter((p) => {
    const atCentre = offCentre(p) < radius * 0.12;
    return !!p.whole !== atCentre;
  }).map((p) => `${p.key}${p.whole ? " marked whole" : " not marked"}`);
  check("every view is marked for what it actually frames", wrong.length === 0,
    wrong.length
      ? wrong.join(", ")
      : `${PRESETS.filter((p) => p.whole).length} whole, ${PRESETS.filter((p) => !p.whole).length} detail`);

  /* And a detail view must stay closer than a fitted whole one, or it is not
     showing a detail of anything. */
  const fittedWhole = fitDistance(radius, 34, 961 / 520);
  const tooFar = PRESETS.filter((p) => !p.whole && p.distance >= fittedWhole).map((p) => p.key);
  check("...and the detail views are actually closer", tooFar.length === 0,
    tooFar.length ? tooFar.join(", ") : `all inside ${fittedWhole.toFixed(2)}`);

  /* A shorter frame must want more distance, not less. */
  const tall = fitDistance(radius, 34, 0.8);
  const wide = fitDistance(radius, 34, 2.4);
  check("a narrower frame pushes the camera back", tall > wide,
    `aspect 0.8 → ${tall.toFixed(2)}, aspect 2.4 → ${wide.toFixed(2)}`);
}

// ===========================================================================
// Every preset is a view of something
// ===========================================================================
{
  const M = machine();
  const span = new THREE.Vector3().subVectors(M.bounds.max, M.bounds.min);
  const radius = span.length() / 2;

  const seen: string[] = [];
  for (const p of PRESETS) {
    const o = settle(goTo(makeOrbit(), p), 4);
    const pos = new THREE.Vector3(...positionOf(o));

    /* Above the bed, or the view is of the underside of a plate. The bed
       sits at the bottom of the bounds, so "above" is relative to that. */
    const bedZ = M.bounds.min.z - (M.bounds.min.z + M.bounds.max.z) / 2;
    const above = pos.z > bedZ + 0.05;
    /* And far enough from its own subject to see it rather than be inside it. */
    const clear = o.atDistance >= LIMITS.minDistance;
    if (!above || !clear) {
      seen.push(`${p.key}: z ${pos.z.toFixed(2)} against bed ${bedZ.toFixed(2)}, d ${o.atDistance.toFixed(2)}`);
    }
  }
  check("every preset sits above the bed, clear of its subject", seen.length === 0,
    seen.length ? seen.join("; ") : `${PRESETS.length} views, machine radius ${radius.toFixed(2)}`);

  /* And they have to be genuinely different views, or they are one button
     pretending to be five. */
  let closest = Infinity;
  let pair = "";
  for (let i = 0; i < PRESETS.length; i++) {
    for (let j = i + 1; j < PRESETS.length; j++) {
      const oa = settle(goTo(makeOrbit(), PRESETS[i]), 4);
      const ob = settle(goTo(makeOrbit(), PRESETS[j]), 4);
      /* Two things make a view distinct: where it looks from, and what it
         looks at. Direction alone called the freewheel a duplicate of the
         output crown — they are 16° apart and half a machine apart, framing
         different parts at half the distance, which is not a duplicate of
         anything. So a pair only counts as too close when BOTH the direction
         and the subject are, and the subject is judged against how much of the
         machine each one actually has in frame. */
      const a = new THREE.Vector3(...positionOf(oa)).sub(new THREE.Vector3(...oa.atTarget));
      const b = new THREE.Vector3(...positionOf(ob)).sub(new THREE.Vector3(...ob.atTarget));
      const angle = a.angleTo(b);
      const apart = new THREE.Vector3(...oa.atTarget).distanceTo(
        new THREE.Vector3(...ob.atTarget),
      );
      /* Targets within a tenth of the nearer view's reach are the same subject. */
      const sameSubject = apart < Math.min(oa.atDistance, ob.atDistance) * 0.1;
      if (sameSubject && angle < closest) {
        closest = angle;
        pair = `${PRESETS[i].key}/${PRESETS[j].key}`;
      }
    }
  }
  check("the presets are distinct views", closest > 25 * (Math.PI / 180),
    `closest pair ${pair} at ${deg(closest).toFixed(0)}° apart`);

  /* The counter-test the loosening needs: two views of the same subject a few
     degrees apart must still be caught, or this now passes for anything. */
  {
    const base = PRESETS.find((v) => v.key === "clutch")!;
    const twin = { ...base, key: "twin", azimuth: base.azimuth + 4 * (Math.PI / 180) };
    const oa = settle(goTo(makeOrbit(), base), 4);
    const ob = settle(goTo(makeOrbit(), twin), 4);
    const a = new THREE.Vector3(...positionOf(oa)).sub(new THREE.Vector3(...oa.atTarget));
    const b = new THREE.Vector3(...positionOf(ob)).sub(new THREE.Vector3(...ob.atTarget));
    const apart = new THREE.Vector3(...oa.atTarget).distanceTo(
      new THREE.Vector3(...ob.atTarget),
    );
    const caught =
      apart < Math.min(oa.atDistance, ob.atDistance) * 0.1 &&
      a.angleTo(b) < 25 * (Math.PI / 180);
    check("...and a real duplicate would still be caught", caught,
      `same target, ${((a.angleTo(b) * 180) / Math.PI).toFixed(1)}° apart`);
  }

  check("the default is the three-quarter", DEFAULT_VIEW.key === "three-quarter",
    DEFAULT_VIEW.label);
}

// ===========================================================================
// The geometry of a position
// ===========================================================================
{
  /* Azimuth zero is the front, which is −Y: the default shot's framing. */
  const front = makeOrbit({ ...DEFAULT_VIEW, azimuth: 0, elevation: 0, distance: 2, target: [0, 0, 0] });
  const p = positionOf(front);
  check("azimuth zero looks from the front", Math.abs(p[0]) < 1e-9 && p[1] < 0,
    `(${p.map((n) => n.toFixed(2)).join(", ")})`);

  const up = makeOrbit({ ...DEFAULT_VIEW, azimuth: 0, elevation: Math.PI / 2, distance: 2, target: [0, 0, 0] });
  const q = positionOf(up);
  check("elevation lifts toward +Z", q[2] > 1.99 && Math.abs(q[1]) < 1e-9,
    `(${q.map((n) => n.toFixed(2)).join(", ")})`);

  /* Distance is distance, whatever the angles. */
  let worst = 0;
  for (let i = 0; i < 40; i++) {
    const o = makeOrbit({
      ...DEFAULT_VIEW,
      azimuth: (i / 40) * TAU,
      elevation: (i / 40) * (LIMITS.maxElevation - LIMITS.minElevation) + LIMITS.minElevation,
      distance: 3.3,
      target: [0, 0, 0],
    });
    worst = Math.max(worst, Math.abs(new THREE.Vector3(...positionOf(o)).length() - 3.3));
  }
  check("distance holds at every angle", worst < 1e-12, `${worst.toExponential(1)} drift`);
}

// ===========================================================================
// The overlay has to be able to receive a drag
// ===========================================================================
{
  /* A source check, and a blunt one, for a bug that cost the whole feature: the
     drag surface was painted BEFORE the canvas, so the canvas sat on top and
     swallowed every pointer event. The figure looked draggable and was not, and
     nothing about the orbit maths was wrong — every test here passed while it
     was completely inert.
     
     The buttons have to come after the overlay in turn, or they stop being
     clickable. So: canvas, then overlay, then controls. */
  /* Every figure, not just the first one. There are three now, and the trap is
     in the ordering rather than in any one file — checking a single scene meant
     the other two could be built inert and nothing would say so.
  
     The marker is `<ViewPicker`, because the buttons themselves moved into a
     shared component. That is also why this check has to be told where to look
     rather than hunting for `PRESETS.map(`: it did, the markup moved, and the
     check went looking for something no longer in the file. */
  /* The workbench figures. The page's own is deliberately not here: it has no
     drag surface and no buttons, because a camera the reader can put anywhere
     is a camera usually pointed at nothing, and that is checked separately
     below. */
  const FIGURES = [
    "../components/geneva/Stage3.tsx",
    "../components/geneva/Stage4.tsx",
  ];

  const layered: string[] = [];
  const clickable: string[] = [];
  for (const f of FIGURES) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    const name = f.split("/").pop()!;
    const canvas = src.lastIndexOf("</Canvas>");
    const overlay = src.indexOf("ref={stage}");
    const buttons = src.indexOf("<ViewPicker");
    if (!(canvas > 0 && overlay > canvas)) layered.push(name);
    if (!(buttons > overlay)) clickable.push(name);
  }

  check("the drag surface is painted after the canvas", layered.length === 0,
    layered.length
      ? `${layered.join(", ")} — the canvas would swallow the drag`
      : `canvas then overlay in ${FIGURES.length} figures`);
  check("...and the controls after that", clickable.length === 0,
    clickable.length
      ? `${clickable.join(", ")} — the overlay would block the buttons`
      : `overlay then buttons in ${FIGURES.length} figures`);

  /* The page's machine is told, not driven by hand. If it ever grows a drag
     surface or a row of camera buttons it has turned back into the widget it
     replaced — a thing to be poked beside some text rather than part of the
     page. Checked across every file that makes it up, because "no controls" is
     a property of the whole stage, and a drag handler added to the wrapper
     would slip past a check that only read the canvas. */
  {
    const SITE = ["Stage.tsx", "StageMachine.tsx", "MachineCanvas.tsx"].map((f) => ({
      f,
      src: readFileSync(new URL(`../components/site/${f}`, import.meta.url), "utf8"),
    }));
    const POKES = ["<ViewPicker", "ref={stage}", "useOrbitKeys", "onPointerDown", "onWheel="];
    const poked = SITE.flatMap(({ f, src }) =>
      POKES.filter((s) => src.includes(s)).map((s) => `${f}: ${s}`),
    );
    check("the site's machine has no controls to poke", poked.length === 0,
      poked.length ? poked.join(", ") : `${SITE.length} files, scroll is the only input`);

    /* Stronger than having no handlers: the whole stage ignores the pointer,
       so a touch that lands on the machine scrolls the page like a touch
       anywhere else. On a phone the machine is the top half of the screen. */
    const stage = SITE.find((x) => x.f === "Stage.tsx")!.src;
    check("...and cannot capture a touch at all", stage.includes("pointer-events-none"),
      "the fixed stage is pointer-events: none");

    const hook = readFileSync(
      new URL("../components/site/useDocumentProgress.ts", import.meta.url),
      "utf8",
    );
    check("...and is driven by the document it sits behind",
      hook.includes("getBoundingClientRect") && hook.includes("readingFrom"),
      "each stage's note measured every frame, not scroll events");
  }

  /* And the overlay must let a one-finger vertical drag through, or the page
     cannot be scrolled past the figure on a phone. */
  const bind = readFileSync(new URL("../components/geneva/useOrbit.ts", import.meta.url), "utf8");
  check("one-finger scrolling still passes through", bind.includes('touchAction = "pan-y"'),
    "touch-action: pan-y on the drag surface");
  check("only a two-finger drag is swallowed",
    bind.includes("e.touches.length !== 2") && bind.includes("e.preventDefault()"),
    "preventDefault is inside the two-finger branch");
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
