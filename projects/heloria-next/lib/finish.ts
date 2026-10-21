/**
 * The finish: one palette, one light rig, read by both renderers.
 *
 * The scene on the page uses three.js. The stills in `lib/shot.mts` use the
 * software rasteriser, because the preview pane in this setup will not
 * composite a WebGL frame. If those two carried their own copies of the
 * materials they would drift within a day and the stills would stop being
 * evidence, so the numbers live here and nowhere else.
 *
 * ── The idea ─────────────────────────────────────────────────────────────────
 *
 * Anodised steel against brass, lit hard from one side. Hard is the operative
 * word: this machine is nothing but chamfers, tooth flanks and the edges of
 * slots, and those are only visible where a sharp light grazes them. A soft,
 * even wash renders the whole thing as one grey shape with holes in it, which
 * is exactly what the placeholder finish looked like.
 *
 * ── Why an environment at all ────────────────────────────────────────────────
 *
 * A metal is a mirror. Give `metalness: 1` nothing to reflect and it renders
 * black — which is why every "why is my metal black" answer is "you forgot the
 * environment map". A plain vertical gradient is enough, so long as it is cool:
 * see SKY.
 */

import type { Grain } from "./grain.ts";

export type Finish = {
  /** base colour, hex */
  colour: string;
  roughness: number;
  metalness: number;
  /** the marks the making process left — see lib/grain.ts */
  grain?: Grain;
  /** emissive lift, for the one part that is meant to glow slightly */
  emissive?: string;
  emissiveIntensity?: number;
};

/**
 * A value ladder, not a set of colours.
 *
 * The first pass put nearly every part inside a narrow band of dark grey, and
 * the result was legible only as a silhouette: where two parts met they had the
 * same value and the boundary simply vanished. So the palette is spread
 * deliberately from the bed at the bottom to the slow stage at the top, with
 * roughly a stop between neighbours, and the two accents — brass and ember —
 * sitting outside the ladder on colour rather than on brightness.
 *
 * The parts that matter are the lightest. The bed is near black, so the machine
 * reads as standing on a panel rather than embedded in one.
 */
export const FINISH: Record<string, Finish> = {
  /* ── Why these are not the colours they were ─────────────────────────────
  
     Two things were making machined steel read as painted plastic.
  
     The hues carried an olive cast — #7a776f and #807b70 are warm greys, and a
     warm grey is what paint looks like. Bare steel is neutral to slightly cool;
     the only warmth in a machine like this belongs to the brass.
  
     And every metal sat at metalness 0.82 to 0.9, which is not a thing that
     exists. A surface is either a conductor or it is not: bare metal is 1.0,
     and the in-between values were quietly mixing in a dielectric diffuse
     response — exactly the flat, chalky look they produced. Anything genuinely
     part-way is a coating, and none of these are coated.
  
     Value separation between parts is kept, because it is what lets a crank be
     read against the plate behind it. It is just done with real differences —
     blued steel really is darker than ground steel — rather than by tinting.

     The albedos are also lighter than the old ones by a clear margin, and that
     is a consequence rather than a preference: a surface at metalness 1 has no
     diffuse response at all, so everything it shows is reflected light. Keeping
     the old values at true metalness produced a machine that had gone several
     stops darker, which is the opposite of what was wanted. */

  /** The Geneva plates: cross and locking disc, turned steel.
  
      Roughness 0.44, not 0.32. A faced steel plate is not a mirror, and at the
      lower value a plate turned square-on to the key blew out to white — which
      reads as paper, not metal. The sampled clipping check missed it because it
      samples normals rather than the one orientation that catches the key
      flat. */
  cross: { colour: "#b2b7bc", roughness: 0.5, metalness: 1.0, grain: "turned" },
  /** the slow stage, brighter again: it is the payoff and should read first */
  crossSlow: {
    colour: "#c4cad0",
    roughness: 0.42,
    metalness: 1.0,
    grain: "turned",
  },
  /** Cranks: darker than the plate they cross, so an arm is unmistakably in
      front of it — but grey steel now rather than blued.

      At #6b7074 the arms and the star rendered as black shapes, and a black
      shape has no form: you could not see that a crank is a bar with a boss on
      one end, only that something was missing from the plate behind it. The
      separation that mattered was always the DIFFERENCE from the plate, not the
      darkness, and 50 levels below `cross` does that as well as 100 did. */
  crank: { colour: "#8d9399", roughness: 0.5, metalness: 1.0, grain: "cast" },
  /** shafts: ground, and darker than anything mounted on them */
  shaft: { colour: "#a4a9ae", roughness: 0.3, metalness: 1.0, grain: "ground" },
  /** The right-angle drive.

      Lighter than it was, because a metal at metalness 1 wears its environment:
      against a cool sky the old value landed on olive, and olive is what brass
      looks like when it is dirty. */
  brass: { colour: "#e6bf6c", roughness: 0.22, metalness: 1.0, grain: "turned" },
  /** the input spur pair: steel, so the crowns stay special */
  spur: { colour: "#b8bdc2", roughness: 0.4, metalness: 1.0, grain: "turned" },
  /** Cast iron — its whole job is to be heavy, and it should look it.

      Heavy, not black. At #787e83 and roughness 0.8 its face came out
      charcoal, which was tolerable while the flywheel was one part among many
      in a wide shot and is not now that a whole stage is a close-up of it.
      Still the darkest metal on the machine, and still matte next to the
      turned plates; it just reads as iron rather than as a hole. */
  iron: { colour: "#8b9196", roughness: 0.66, metalness: 1.0, grain: "cast" },
  /** the rollers, and the only colour in the machine */
  roller: {
    colour: "#ff682c",
    roughness: 0.26,
    metalness: 0.45,
    grain: "turned",
    emissive: "#ff682c",
    emissiveIntensity: 0.16,
  },
  /** The standard: a painted frame casting, not a moving part.

      It used to share the crank's finish, which made the one tall vertical
      object in the machine a black column — the single darkest shape in frame
      and the first thing the eye went to. It is also the one part here that
      would really be painted rather than left bare, so a mid grey at low
      metalness is both clearer and more honest. Frame is frame; mechanism is
      bare steel; you can now tell which is which at a glance. */
  /* Darker again, #767c81 → #50565b. At low metalness the paint shows its
     albedo straight, and under the 2.05 exposure the old value came out
     nearly white: a bright, flat, featureless bar — the one part with no
     detail on it — was the brightest thing in every wide shot. Machine-tool
     grey, so it reads as a painted casting and stays behind the mechanism. */
  frame: { colour: "#50565b", roughness: 0.7, metalness: 0.18, grain: "cast" },
  /** The bed: matte and neutral, so the machine stands on it rather than in it.

      The one surface here that is genuinely not metal, and the only one whose
      metalness should be near zero — which also makes it the one surface that
      takes the warm key as diffuse colour rather than reflecting it. That is
      why the albedo is cool: at a neutral value the warm key came back as
      brown, and a brown slab under a steel machine reads as a wooden bench.

      It stays the darkest thing in frame on purpose. The parts were lifted off
      black; the surface behind them was not, because contrast is what makes a
      part legible and greying both sides of an edge removes the edge. */
  bed: { colour: "#0f1317", roughness: 0.96, metalness: 0.05, grain: "cast" },
};

export type LightRig = {
  dir: [number, number, number];
  colour: string;
  intensity: number;
};

/**
 * Key low and from the left, so it rakes across the tooth flanks rather than
 * washing down onto the faces.
 *
 * 27° or so, not 40°. At the higher angle it strikes the plate faces nearly
 * square, so every flat top in the machine blows out together and the chamfers,
 * which are what there is to look at, get nothing.
 */
export const KEY: LightRig = {
  dir: [-0.7, -0.56, 0.44],
  colour: "#fff3e6",
  intensity: 3.5,
};

/** Cool, weak, and opposite the key, so the shadow side is not simply black. */
export const FILL: LightRig = {
  dir: [0.8, -0.32, 0.5],
  colour: "#8ea9c4",
  intensity: 1.15,
};

/**
 * The rim does most of the work of making the machine readable.
 *
 * It comes from behind and above, so it draws a bright line down the far edge
 * of every part. That line is what separates one dark shape from the dark shape
 * behind it — without it the whole assembly reads as a single silhouette,
 * however carefully the values are laid out.
 */
export const RIM: LightRig = {
  dir: [0.2, 0.88, 0.43],
  colour: "#ffd3ac",
  intensity: 2.1,
};

/**
 * Ambient, and it does most of the work of making the shadow side readable.
 *
 * At 0.2 every surface turned away from the key fell to near black, so half of
 * every part was simply missing and the machine read as a few lit edges
 * floating in the dark. The environment was raised with it: a metal has no
 * diffuse response, so for the unlit side of a polished part the environment is
 * the only thing there is.
 */
export const AMBIENT = 0.42;

/**
 * The environment: cool above, grey below.
 *
 * Cool, and that is the whole reason steel looks like steel here. A metal
 * reflects its surroundings almost entirely, so a warm environment turns every
 * grey part bronze and the brass stops being distinguishable from the plates
 * beside it. Warmth belongs in the key light, where it lands on facing surfaces
 * only and leaves the shadow side cold — which is what makes a chamfer read.
 *
 * Less blue than it was, though, and that is the difference between cool and
 * tinted. At #72808f the brass came back olive and the steel came back the
 * colour of a swimming pool; the hue is still on the cold side of neutral,
 * which is all that was ever needed to keep the brass separate.
 */
export const SKY = "#7e878f";

/**
 * The lower half of the environment, and the reason half the machine was black.
 *
 * At metalness 1 there is no diffuse term: a face reflects the environment and
 * nothing else. Every surface turned downwards or sideways — the flanks of the
 * standard, the sides of every crank, the underside of every plate — was
 * therefore showing #1b1e22 and reading as a hole. Nothing was wrong with those
 * parts' colours; they simply had nothing to be a colour OF.
 *
 * A real machine sits over a floor that bounces, so this is the one number that
 * makes the whole assembly legible at once rather than part by part.
 */
export const GROUND = "#4b5158";

/**
 * Exposure, applied before the tone curve.
 *
 * One number, so that changing how bright the machine is does not mean
 * rebalancing three lights against each other. It went from 1.45 to 2.05 for
 * one reason: the machine was legible on a calibrated screen in a dark room
 * and nowhere else. A value ladder only helps if the whole ladder is somewhere
 * you can actually see it.
 */
export const EXPOSURE = 2.05;

/**
 * Background behind the machine, and the page's own background.
 *
 * One number, in one place, because the canvas is full-bleed behind the whole
 * document: if the page and the clear colour disagree by even a little there
 * is a visible rectangle where the canvas is. `--color-void` in globals.css is
 * this value and must stay this value.
 */
export const BACKDROP = "#101315";

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/**
 * Blinn-Phong exponent standing in for a roughness.
 *
 * The usual mapping, 2/α⁴ − 2. It is not physically the same thing as a GGX
 * lobe and does not need to be: its job is to put the highlight in the right
 * place and make it the right size, so a still tells the truth about where the
 * light lands.
 */
export const shininessFor = (roughness: number) => {
  const a = Math.max(0.045, roughness);
  /* Floored at 2. Below that the lobe is wider than a hemisphere and the
     normalisation stops meaning anything — a roughness of 0.96 gives an
     exponent of 0.36, which spreads a "highlight" evenly over a whole surface
     and lights a matte bed like a mirror. */
  return Math.min(2048, Math.max(2, 2 / (a * a * a * a) - 2));
};
