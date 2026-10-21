/**
 * The finish, asserted.
 *
 *   node lib/finish.test.mts
 *
 * Materials are a matter of taste and these are not tests of taste. They are
 * tests of the two things that went wrong while the taste was being decided,
 * both of which produce a picture that looks plausible until you compare it
 * with what it is supposed to be:
 *
 *   a near-black matte bed rendering as mid grey, because sRGB values were
 *   being lit and then gamma-encoded a second time on the way out
 *
 *   a matte surface picking up a mirror-bright rim, because plain Schlick
 *   fresnel climbs to 1 at grazing angles whatever the roughness
 *
 * Both made the bed the brightest object in frame, which is a strange way to
 * light a machine.
 */

import * as THREE from "three";
import { readFileSync, readdirSync } from "node:fs";
import {
  AMBIENT,
  BACKDROP,
  EXPOSURE,
  FILL,
  FINISH,
  GROUND,
  KEY,
  RIM,
  SKY,
  hexToRgb,
  shininessFor,
} from "./finish.ts";
import { render, shadeFace, type Scene } from "./render.mts";
import { inflateSync } from "node:zlib";
import { LIGHTS, VIEW, sceneAt } from "./parts.ts";
import { bakeRoughness, grainAt, roughnessAt } from "./grain.ts";
import { flywheelShape } from "./flywheel.ts";
import { machine, FLYWHEEL_R } from "./assembly.ts";

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

const scene: Scene = {
  parts: [],
  ambient: AMBIENT,
  sky: hexToRgb(SKY),
  ground: hexToRgb(GROUND),
  background: hexToRgb(BACKDROP),
  lights: [KEY, FILL, RIM].map((l) => ({
    dir: l.dir,
    colour: hexToRgb(l.colour),
    intensity: l.intensity,
  })),
};

const eye = new THREE.Vector3(-2, -4.6, 1.7);
const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Shade a surface with a given normal, sitting at the origin. */
const shadeAt = (
  finish: (typeof FINISH)[string],
  normal: [number, number, number],
  at: [number, number, number] = [0, 0, 0],
) =>
  shadeFace(
    new THREE.Vector3(...normal).normalize(),
    new THREE.Vector3(...at),
    eye,
    finish,
    scene,
  );

// ===========================================================================
// Exposure and range
// ===========================================================================
{
  const bedUp = shadeAt(FINISH.bed, [0, 0, 1]);
  const crossUp = shadeAt(FINISH.cross, [0, 0, 1]);

  /* Everything here is RELATIVE to the scene's own range. Absolute thresholds
     were fine while the exposure was fixed and became noise the moment it
     moved: lifting the machine so it could be read on an ordinary screen
     failed three checks that had nothing to say about whether it was right.
     What must hold is the ordering, not the numbers. */
  const white = Math.max(
    ...Object.values(FINISH).flatMap((f) =>
      ([[0, 0, 1], [0, -1, 0], [-0.5, -0.5, 0.7]] as [number, number, number][]).map(
        (n) => lum(shadeAt(f, n)),
      ),
    ),
  );

  /* The bed must sit at the bottom of the range. Lit as an un-linearised sRGB
     value it came out brighter than most of the machine, which is the failure
     this is here to catch. */
  check("the bed sits at the bottom of the range", lum(bedUp) < white * 0.45,
    `${lum(bedUp).toFixed(3)} against a ${white.toFixed(3)} white point`);

  /* And the parts standing on it have to separate from it, which is the whole
     of the clarity problem: two surfaces at the same value have no edge
     between them however sharp the geometry is. */
  check("the plates sit clear of the bed", lum(crossUp) > lum(bedUp) * 1.6,
    `cross ${lum(crossUp).toFixed(3)} against bed ${lum(bedUp).toFixed(3)}, ${(lum(crossUp) / lum(bedUp)).toFixed(2)}:1`);

  /* Grazing angles are where a fresnel that ignores roughness does its damage.
     A matte surface seen nearly edge-on should not light up like a polished
     one seen the same way. */
  const bedGrazing = shadeAt(FINISH.bed, [0, -0.06, 0.06]);
  const brassFace = shadeAt(FINISH.brass, [0, 0, 1]);
  const brassGrazing = shadeAt(FINISH.brass, [0, -0.06, 0.06]);
  check("a matte surface has no mirror rim", lum(bedGrazing) < lum(brassGrazing) * 0.85,
    `bed ${lum(bedGrazing).toFixed(3)} against brass ${lum(brassGrazing).toFixed(3)}`);

  /* And a polished one does, or the fresnel is doing nothing at all. */
  check("a polished one does", lum(brassGrazing) > lum(brassFace),
    `${lum(brassFace).toFixed(3)} facing, ${lum(brassGrazing).toFixed(3)} grazing`);

  /* Nothing should clip: a tone curve that lands everything on 1.0 has thrown
     away the shape of the thing. */
  let clipped = 0;
  let samples = 0;
  for (const f of Object.values(FINISH)) {
    for (const n of [
      [0, 0, 1],
      [0, -1, 0],
      [1, 0, 0],
      [-0.5, -0.5, 0.7],
      [0.4, 0.6, 0.7],
    ] as [number, number, number][]) {
      const c = shadeAt(f, n);
      samples++;
      if (Math.max(...c) > 0.995) clipped++;
    }
  }
  check("nothing blows out to white", clipped === 0, `${clipped} of ${samples} samples clipped`);

  check("exposure is a single number", EXPOSURE > 0.5 && EXPOSURE < 4, `${EXPOSURE}`);
}

// ===========================================================================
// The ember is the only colour
// ===========================================================================
{
  const sat = (c: [number, number, number]) => {
    const mx = Math.max(...c);
    const mn = Math.min(...c);
    return mx < 1e-6 ? 0 : (mx - mn) / mx;
  };
  const roller = sat(shadeAt(FINISH.roller, [0, -1, 0]));
  const others = Object.entries(FINISH)
    .filter(([k]) => k !== "roller")
    .map(([k, f]) => [k, sat(shadeAt(f, [0, -1, 0]))] as const);
  const worst = others.sort((a, b) => b[1] - a[1])[0];

  check("the roller is the most saturated thing in frame", roller > worst[1] * 1.2,
    `roller ${roller.toFixed(3)}, next is ${worst[0]} at ${worst[1].toFixed(3)}`);

  const brass = sat(shadeAt(FINISH.brass, [0, -1, 0]));
  const cross = sat(shadeAt(FINISH.cross, [0, -1, 0]));
  check("brass reads warmer than steel", brass > cross * 1.5,
    `brass ${brass.toFixed(3)}, steel ${cross.toFixed(3)}`);
}

// ===========================================================================
// Sanity on the palette itself
// ===========================================================================
{
  const bad = Object.entries(FINISH).filter(
    ([, f]) =>
      f.roughness < 0 || f.roughness > 1 || f.metalness < 0 || f.metalness > 1,
  );
  check("every finish is in range", bad.length === 0,
    bad.length ? bad.map(([k]) => k).join(", ") : `${Object.keys(FINISH).length} finishes`);

  check("shininess is floored", shininessFor(0.99) >= 2,
    `roughness 0.99 → ${shininessFor(0.99).toFixed(2)}`);
  check("...and rises as roughness falls", shininessFor(0.2) > shininessFor(0.6) * 10,
    `${shininessFor(0.2).toFixed(0)} against ${shininessFor(0.6).toFixed(1)}`);

  /* One palette, not two. A scene file that writes its own material has
     quietly forked the finish, and the stills stop describing the page.
     
     Stage1 and Stage2 are exempt on purpose: they are the earlier steps, still
     on the bench, and their bare wireframe and placeholder grey are the point
     of them. Anything else with its own material is a fork. */
  const EARLIER_STEPS = new Set(["Finish.tsx", "Stage1.tsx", "Stage2.tsx"]);
  /* Both directories. The machine used to render only from the bench; it is on
     the page now too, and a guard that watches the place a thing used to live
     is a guard that stops working the moment it moves. */
  const DIRS = ["../components/geneva/", "../components/site/"];
  const offenders: string[] = [];
  for (const d of DIRS) {
    const dir = new URL(d, import.meta.url);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".tsx") || EARLIER_STEPS.has(f)) continue;
      if (readFileSync(new URL(f, dir), "utf8").includes("meshStandardMaterial")) {
        offenders.push(f);
      }
    }
  }
  check("no scene writes its own material", offenders.length === 0,
    offenders.length ? offenders.join(", ") : `all materials come from lib/finish.ts (${DIRS.length} directories)`);

  /* three.js MULTIPLIES a material's roughness by its roughness map. Ours
     stores absolute roughness, so the material's own value has to be 1 or it
     is applied twice — which squared every metal on the page, turned ground
     shafts at 0.3 into mirrors at 0.09, and left 46% of the machine under 0.1
     luminance on the real canvas while every still said 0%.

     A source check, because nothing in node can run the shader, and the
     rendered-darkness check below cannot see it: the software rasteriser
     reads the map as the absolute value it is, which is exactly why the two
     renderers disagreed without anything failing. */
  const metal = readFileSync(new URL("../components/geneva/Finish.tsx", import.meta.url), "utf8");
  check("the page does not square the roughness", /roughness=\{\s*map\s*\?\s*1\s*:/.test(metal),
    "roughness is 1 whenever the map carries it");

  /* The canvas is full-bleed behind the whole document, so the page's own
     background and the renderer's clear colour are the same surface as far as
     a reader is concerned. Two constants in two languages describing one
     surface is exactly the kind of pair that drifts, and the failure is a
     visible rectangle where the machine is. */
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const voidColour = css.match(/--color-void:\s*(#[0-9a-fA-F]{6})/)?.[1];
  check("the page background is the canvas clear colour",
    voidColour?.toLowerCase() === BACKDROP.toLowerCase(),
    `--color-void ${voidColour ?? "not found"} against BACKDROP ${BACKDROP}`);
}

// ===========================================================================
// Grain
// ===========================================================================
{
  /* Grain is a deviation, not a value: a finish's own roughness must stay the
     thing that decides what it is. If the swing is comparable to the base, a
     polished part goes matte in patches and stops reading as one material. */
  for (const [name, f] of Object.entries(FINISH)) {
    const kind = f.grain ?? "none";
    if (kind === "none") continue;
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < 400; i++) {
      const u = (i % 20) / 20 - 0.5;
      const v = Math.floor(i / 20) / 20 - 0.5;
      const r = roughnessAt(f.roughness, kind, u, v);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    check(`${name}: grain deviates without taking over`,
      hi - lo < f.roughness * 0.75 && hi <= 0.99 && lo >= 0.03,
      `${lo.toFixed(3)}..${hi.toFixed(3)} around ${f.roughness}`);
  }

  /* Turning marks are concentric, which is a statement about two directions
     rather than one: the variation round a circle has to be small COMPARED TO
     the variation along a radius. An absolute threshold says nothing, because
     a surface with no marks at all passes it. */
  const r = 0.31;
  const around = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return grainAt("turned", Math.cos(a) * r, Math.sin(a) * r);
  });
  const across = Array.from({ length: 64 }, (_, i) =>
    grainAt("turned", 0.1 + (i / 64) * 0.02, 0),
  );
  void around;
  const swing = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  check("the grain varies at all", swing(across) > 0.5,
    `${swing(across).toFixed(3)} along a radius`);

  /* Concentric means two radial profiles taken at different angles agree. A
     correlation, not a spread: the marks are allowed to sit under some noise,
     they are not allowed to BE the noise. */
  const profile = (angle: number) =>
    Array.from({ length: 128 }, (_, i) => {
      const rr = 0.18 + (i / 128) * 0.03;
      return grainAt("turned", Math.cos(angle) * rr, Math.sin(angle) * rr);
    });
  const a1 = profile(0.4);
  const a2 = profile(2.1);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const m1 = mean(a1);
  const m2 = mean(a2);
  let cov = 0;
  let v1 = 0;
  let v2 = 0;
  for (let i = 0; i < a1.length; i++) {
    cov += (a1[i] - m1) * (a2[i] - m2);
    v1 += (a1[i] - m1) ** 2;
    v2 += (a2[i] - m2) ** 2;
  }
  const corr = cov / Math.sqrt(v1 * v2);
  check("turning marks are concentric", corr > 0.7,
    `${corr.toFixed(3)} correlation between radial profiles 97° apart`);

  /* The bake is what three.js gets; it has to match what the rasteriser
     computes, or the page and the stills disagree about the surface. */
  const baked = bakeRoughness("turned", 0.4, 64, 1.6);
  let worst = 0;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const u = (x / 64 - 0.5) * 1.6;
      const v = (y / 64 - 0.5) * 1.6;
      const direct = roughnessAt(0.4, "turned", u, v);
      worst = Math.max(worst, Math.abs(baked[y * 64 + x] / 255 - direct));
    }
  }
  check("the baked map matches the function", worst < 1 / 255 + 1e-9,
    `worst disagreement ${(worst * 255).toFixed(3)} of 255`);
}

// ===========================================================================
// The flywheel actually has spokes
// ===========================================================================
{
  const M = machine();
  const s = flywheelShape(FLYWHEEL_R, 6, M.d1.shaft * 0.52);
  check("the flywheel is spoked", s.holes.length === 7,
    `${s.holes.length} holes — six spokes and a bore`);

  /* It was not, for the whole build: a hub boss larger than the rim bore makes
     every spoke hole inside-out, and `THREE.Path` answers that by producing no
     holes at all. It now refuses. */
  let threw = false;
  try {
    flywheelShape(FLYWHEEL_R, 6, M.d1.shaft * 1.1);
  } catch {
    threw = true;
  }
  check("...and a hub that leaves no room is refused", threw,
    "silently returned a plain disc before");
}

// ===========================================================================
// Nothing in the machine reads as black
// ===========================================================================
/*
 * Sampling finishes tells you what a surface COULD look like. It does not tell
 * you what is on screen, because what is on screen depends on which way each
 * face happens to point — and the parts that went black were black for a
 * reason no per-finish check could see: at metalness 1 there is no diffuse
 * term, so a face turned away from the key shows the environment and nothing
 * else, and the lower half of the environment was near black. Every crank
 * flank, every plate underside and the whole standard were reflecting a void.
 *
 * So this renders the machine and counts pixels. A shape whose interior sits
 * under about 0.1 relative luminance has no form: you can see that something
 * is there and not what it is.
 */
{
  /* Small. The point is a population of pixels, not a picture, and the full
     1280x800 still takes long enough to make people stop running the tests. */
  const W = 320;
  const H = 200;
  const png = render(
    { parts: sceneAt(1.5 * Math.PI * 2), background: hexToRgb(BACKDROP), ...LIGHTS },
    { ...VIEW, width: W, height: H },
  );

  /* The renderer writes one unfiltered scanline per row, so the decode is an
     inflate and a stride. Reading back what was written is the only way to
     ask a question about the image rather than about the inputs. */
  const idat: Buffer[] = [];
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o);
    if (png.toString("ascii", o + 4, o + 8) === "IDAT") {
      idat.push(png.subarray(o + 8, o + 8 + len));
    }
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const bg = hexToRgb(BACKDROP).map((v) => Math.round(v * 255));
  const machine: number[] = [];
  let p = 0;
  for (let y = 0; y < H; y++) {
    p++; // filter byte
    for (let x = 0; x < W; x++, p += 3) {
      const r = raw[p];
      const g = raw[p + 1];
      const b = raw[p + 2];
      /* The backdrop is not a part and has no duty to be grey. */
      if (Math.abs(r - bg[0]) < 3 && Math.abs(g - bg[1]) < 3 && Math.abs(b - bg[2]) < 3) continue;
      machine.push((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
    }
  }
  machine.sort((a, b) => a - b);

  check("the machine fills a useful part of the frame", machine.length > W * H * 0.15,
    `${((100 * machine.length) / (W * H)).toFixed(1)}% of pixels`);

  /* Not zero: a chamfer seen exactly edge-on is allowed to be a dark line, and
     a shadow has to be able to be a shadow. The threshold is set from
     measurement rather than taste — 3.1% with the old palette, 0.4% with only
     the environment put back, 0.00% as it stands — so it catches the
     environment on its own, which is the single change that did most of the
     work and would therefore be the easiest to undo by accident. */
  const black = machine.filter((v) => v < 0.1).length / machine.length;
  check("no part of it renders as black", black < 0.002,
    `${(black * 100).toFixed(2)}% of machine pixels under 0.1`);

  /* And the bulk of it has to sit somewhere you can read form, not merely
     above the floor. The median was 0.26 when half the machine was a
     silhouette; a lit object belongs near the middle of the range. */
  const median = machine[Math.floor(machine.length / 2)];
  check("...and the bulk of it is properly lit", median > 0.44,
    `median ${median.toFixed(3)}`);

  /* The bed is the exception that makes the rest work: it is the surface the
     machine is seen AGAINST, and greying both sides of an edge removes the
     edge. Checked here rather than by sampling, because it is a claim about
     what the two look like side by side. */
  const bedUp2 = lum(shadeAt(FINISH.bed, [0, 0, 1]));
  const frameUp = lum(shadeAt(FINISH.frame, [0, 0, 1]));
  check("the standard still stands clear of the bed", frameUp > bedUp2 * 1.8,
    `frame ${frameUp.toFixed(3)} against bed ${bedUp2.toFixed(3)}`);
}

// ===========================================================================

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
