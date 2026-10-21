/**
 * Stills of the machine, from the same numbers the scene uses.
 *
 *   node lib/shot.mts [driverRevolutions ...]
 *   node lib/shot.mts --view <preset> | --stage <stage> [--well WxH] [--finished]
 *
 * The parts themselves are in `lib/parts.ts`; this is the command line.
 */

import { mkdirSync } from "node:fs";

import { BACKDROP, hexToRgb } from "./finish.ts";
import { PRESETS, lookAtOf, makeOrbit, positionOf } from "./orbit.ts";
import { render, write } from "./render.mts";
import { STAGES, installAt } from "./build.ts";
import { cameraPosition, finishedShot, shotFor } from "./director.ts";
import { LIGHTS, VIEW, mid, sceneAt } from "./parts.ts";
import { APPROACH } from "./approach.ts";
import * as THREE from "three";

const TAU = Math.PI * 2;


/**
 * `--at x,y,z --look x,y,z --fov n` frames a detail instead of the machine.
 *
 * Judging a finish from one wide shot is guesswork: a chamfer is four pixels
 * across at that distance and a spoke can be missing entirely without anything
 * looking wrong. Close-ups are how the questions get settled.
 */
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const triple = (s: string | undefined) =>
  s ? (s.split(",").map(Number) as [number, number, number]) : undefined;

const at = triple(flag("at"));
const look = triple(flag("look"));
const fov = flag("fov") ? Number(flag("fov")) : undefined;
if (at) VIEW.from = at;
if (look) VIEW.to = look;
if (fov) VIEW.fov = fov;

/* `--view <key>` frames from one of the page's named views, so a preset can be
   checked against what it claims to show rather than trusted. */
const viewKey = flag("view");
if (viewKey) {
  const preset = PRESETS.find((v) => v.key === viewKey);
  if (!preset) {
    throw new Error(
      `no view "${viewKey}"; try ${PRESETS.map((v) => v.key).join(", ")}`,
    );
  }
  /* The scene shifts the machine so its centre is the origin; the stills leave
     it where it is and point the camera at `mid`. So a preset's position, which
     is relative to the machine's centre, has to be carried over by the same
     offset or `--view` frames empty space beside the machine. */
  const o = makeOrbit(preset);
  const from = positionOf(o);
  const to = lookAtOf(o);
  VIEW.from = [from[0] + mid.x, from[1] + mid.y, from[2] + mid.z];
  VIEW.to = [to[0] + mid.x, to[1] + mid.y, to[2] + mid.z];
}

/* Positional arguments are frame numbers; a flag and the value after it are
   not. Skipping only the `--` tokens reads `--fov 30` as a request to render
   revolution 30. */
/* `--stage <key>` draws the machine as it stands once that stage is seated —
   only the parts installed by then — from the camera the page uses for it,
   solved by the same `shotFor` for a well of `--well WxH` (default 666x800,
   the well at 1280x800). The page's own canvas cannot be relied on to give
   up a screenshot in this setup; this is the picture of what it shows. */
const stageKey = flag("stage");
const wellArg = flag("well");
/* `--through t`, with `--stage`: the stage caught part way, 0..1, each part
   still arriving offset along its own approach exactly as the page moves it.
   A seated still cannot show whether anything passes through anything. */
const through = flag("through") ? Number(flag("through")) : undefined;
const FLAGS = new Set(["--at", "--look", "--fov", "--view", "--stage", "--well", "--through"]);
const argv = process.argv.slice(2);
const revs: number[] = [];
for (let i = 0; i < argv.length; i++) {
  if (FLAGS.has(argv[i])) {
    i++;
    continue;
  }
  const n = Number(argv[i]);
  if (!Number.isNaN(n)) revs.push(n);
}
if (stageKey) {
  const si = STAGES.findIndex((s) => s.key === stageKey);
  if (si < 0) throw new Error(`no stage "${stageKey}"; try ${STAGES.map((s) => s.key).join(", ")}`);
  const [w, h] = (wellArg ?? "666x800").split("x").map(Number);
  const progress = (si + (through ?? 1)) / STAGES.length;
  /* `--finished`: the page's closing frame instead of the stage's own — the
     still that stands in for the machine where there is no WebGL. */
  const finished = process.argv.includes("--finished");
  const shot = finished ? finishedShot(w / h) : shotFor({ index: si, within: 1 }, w / h);
  const from = cameraPosition(shot);
  /* The page centres the machine on its bounds; the stills leave it where it
     is, so the page's camera is carried over by the same offset. */
  const view = {
    ...VIEW,
    width: w,
    height: h,
    fov: 34,
    from: [from[0] + mid.x, from[1] + mid.y, from[2] + mid.z] as [number, number, number],
    to: [shot.target[0] + mid.x, shot.target[1] + mid.y, shot.target[2] + mid.z] as [number, number, number],
  };
  const parts = sceneAt(1.5 * TAU)
    .map((part) => {
      if (!part.key) return part;
      const at = installAt(progress, part.key);
      if (at <= 0.002) return null;
      if (at >= 0.999) return part;
      /* Slid back along its own axis, in its shaft's frame — or straight up,
         for the bed and the standard, which are on no shaft. */
      const a = APPROACH[part.key];
      const off = (1 - at) * a.dir * a.length;
      if (!part.frame) return { ...part, matrix: new THREE.Matrix4().makeTranslation(0, 0, Math.abs(off)).multiply(part.matrix) };
      const local = part.frame.clone().invert().multiply(part.matrix);
      return { ...part, matrix: part.frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, off)).multiply(local) };
    })
    .filter((part): part is NonNullable<typeof part> => part !== null);
  const png = render({ parts, background: hexToRgb(BACKDROP), ...LIGHTS }, view);
  const dir = new URL("../renders/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  const name = finished ? "finished.png" : through === undefined ? `stage-${si + 1}-${stageKey}.png` : `stage-${si + 1}-${stageKey}-${String(through).replace(".", "_")}.png`;
  write(new URL(name, dir), png);
  console.log(`wrote renders/${name}  ${parts.length} parts, view "${shot.preset.key}", d ${shot.distance.toFixed(2)}`);
  process.exit(0);
}

for (const rev of revs.length ? revs : [1.5]) {
  const png = render(
    { parts: sceneAt(rev * TAU), background: hexToRgb(BACKDROP), ...LIGHTS },
    VIEW,
  );
  /* `renders/`, not `public/`. These are diagnostics — a picture of the
     machine at one instant, taken to check something — and `public/` is the
     site's asset directory, so leaving them there ships stale images of a
     superseded machine to anyone who loads the page. */
  const dir = new URL("../renders/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  /* The angle is always in the name. Keying the file on the view alone meant
     four frames of a sequence overwrote each other and the last one left
     standing looked like the answer — which is a poor way to check that
     something moves. Only the single-frame case gets the short name. */
  const stamp = String(rev).replace(".", "_");
  const name =
    viewKey === undefined
      ? `shot-${stamp}.png`
      : revs.length > 1
        ? `view-${viewKey}-${stamp}.png`
        : `view-${viewKey}.png`;
  write(new URL(name, dir), png);
  console.log(`wrote renders/${name}  (${(png.length / 1024).toFixed(0)} kB)`);
}
