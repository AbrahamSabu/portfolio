/**
 * Does a part hit anything on its way in?
 *
 * Node-side only: this builds on `lib/parts.ts`, which extrudes every part,
 * and the page has no business doing that twice. The page reads the result —
 * a fixed table in `lib/approach.ts` — and `approach.test.mts` holds that
 * table to this.
 *
 * ── Envelopes, not shapes ────────────────────────────────────────────────────
 *
 * Every moving part turns while it slides, and the angle it is at when a
 * reader happens to scroll is anybody's. So each part is judged by the ring
 * it sweeps as it turns — the annulus between its nearest and furthest point
 * from its shaft's axis, over its length along that axis — which is true at
 * every angle at once. A gear on its own shaft is then automatically clear of
 * that shaft: its bore is outside the shaft's radius. The bed and the
 * standard do not turn, and are boxes.
 *
 * Conservative on purpose. Two parts whose envelopes are clear cannot touch;
 * two whose envelopes meet may still miss, and the only pairs allowed to meet
 * are the ones designed to — a mesh, a Geneva engaging, a clutch — each named
 * in DESIGNED with the test that already holds it to its geometry.
 */

import * as THREE from "three";
import type { PartKey } from "./build.ts";
import type { Tagged } from "./parts.ts";

export type Ring = {
  kind: "ring";
  key: PartKey;
  /** the shaft's frame: local Z is the axis the part turns on and slides along */
  frame: THREE.Matrix4;
  inv: THREE.Matrix4;
  rIn: number;
  rOut: number;
  z0: number;
  z1: number;
};
export type Box = { kind: "box"; key: PartKey; min: THREE.Vector3; max: THREE.Vector3 };
export type Envelope = Ring | Box;

/** How close two envelopes may come before they count as touching. */
export const TOUCH = 2e-3;

/**
 * Pairs that are meant to occupy each other's envelopes, and why that is not
 * a collision. Each is already held to its real geometry elsewhere; what this
 * file adds is only that nothing ELSE touches.
 */
export const DESIGNED: [PartKey, PartKey, string][] = [
  ["spurTop", "spurLow", "a spur mesh — gears.test.mts"],
  ["pinionIn", "crownIn", "a crown mesh — crownMounted.test.mts"],
  ["crownOut", "pinionOut", "a crown mesh — crownMounted.test.mts"],
  ["pin1", "cross1", "the pin runs in the slots — geneva.test.mts"],
  ["disc1", "cross1", "the disc runs in the crescents — geneva.test.mts"],
  ["pin2", "cross2", "the pin runs in the slots — geneva.test.mts"],
  ["disc2", "cross2", "the disc runs in the crescents — geneva.test.mts"],
  ["star", "hub", "the rollers run on the hub's race — freewheel.test.mts"],
];

/**
 * A part that ends up seated IN another — a shaft in its hole in the base
 * plate, the output shaft in the standard's bearing.
 *
 * Different from DESIGNED, which are pairs that run in each other: a seat may
 * only be entered at the very end of the approach. Contact any earlier means
 * the part is passing through its host to get there — a shaft sliding in
 * through the standard rather than into it — which is exactly the kind of
 * thing this file exists to stop.
 */
export const SEATS: [PartKey, PartKey, string][] = [
  ["shaftDriver1", "bed", "stands in a bore in the base plate"],
  ["shaftCross1", "bed", "stands in a bore in the base plate"],
  ["shaftCross2", "standard", "runs in the standard's bearing — which is what the standard is for"],
];

/** How much of the approach, at its end, may be spent inside a seat. */
export const SEAT_ENTRY = 0.25;

const seatOf = (a: PartKey, b: PartKey) => SEATS.some(([x, y]) => x === a && y === b);

export const designed = (a: PartKey, b: PartKey) =>
  DESIGNED.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** The envelopes of every tagged part, grouped by the name it is installed under. */
export function envelopes(parts: Tagged[]): Map<PartKey, Envelope[]> {
  const out = new Map<PartKey, Envelope[]>();
  const v = new THREE.Vector3();
  for (const part of parts) {
    if (!part.key) continue;
    const pos = part.geometry.attributes.position;
    let env: Envelope;
    if (part.frame) {
      const inv = part.frame.clone().invert();
      const local = inv.clone().multiply(part.matrix);
      let rIn = Infinity;
      let rOut = 0;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(local);
        const r = Math.hypot(v.x, v.y);
        rIn = Math.min(rIn, r);
        rOut = Math.max(rOut, r);
        z0 = Math.min(z0, v.z);
        z1 = Math.max(z1, v.z);
      }
      /* The nearest vertex to the axis is only the inner edge if there is
         nothing between it and the axis. A cross cut from a solid disc has
         no bore — its nearest vertex is the bottom of a slot — and reading
         that as a hole let a shaft pass through it unremarked. */
      if (axisInside(part.geometry, local, (z0 + z1) / 2)) rIn = 0;
      env = { kind: "ring", key: part.key, frame: part.frame, inv, rIn, rOut, z0, z1 };
    } else {
      const box = new THREE.Box3();
      for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(part.matrix));
      env = { kind: "box", key: part.key, min: box.min.clone(), max: box.max.clone() };
    }
    const list = out.get(part.key) ?? [];
    list.push(env);
    out.set(part.key, list);
  }
  return out;
}

/**
 * Is the shaft's axis inside this part's material, at height `z`?
 *
 * Parity of a ray from the axis outward against the part's own triangles:
 * odd, and the axis is in solid metal. Every part here is a closed mesh —
 * an extrusion or a cylinder — so the parity is well defined.
 */
function axisInside(g: THREE.BufferGeometry, local: THREE.Matrix4, z: number) {
  const pos = g.attributes.position;
  const index = g.index;
  const n = index ? index.count : pos.count;
  /* Slightly off any symmetry line, so the ray does not graze a vertex. */
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, z), new THREE.Vector3(1, 0.0137, 0.0071).normalize());
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let crossings = 0;
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(local);
    b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1).applyMatrix4(local);
    c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2).applyMatrix4(local);
    if (ray.intersectTriangle(a, b, c, false, hit)) crossings++;
  }
  return crossings % 2 === 1;
}

const axisOf = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixColumn(m, 2).normalize();
const originOf = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m);

/** World bounding box of a ring slid `u` along its own axis. */
function ringBox(r: Ring, u: number) {
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  for (const x of [-r.rOut, r.rOut])
    for (const y of [-r.rOut, r.rOut])
      for (const z of [r.z0 + u, r.z1 + u]) box.expandByPoint(p.set(x, y, z).applyMatrix4(r.frame));
  return box;
}

const overlap1 = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0) > TOUCH;

/**
 * Do two envelopes meet, with `a` slid `u` along its own axis?
 *
 * Exact for two rings on parallel axes — two annuli a known distance apart,
 * over two lengths along the same line. Otherwise their world boxes, which
 * is conservative and is all the shapes here need: every axis in this machine
 * runs along a world axis, so a ring's box is its cylinder with the corners
 * filled in.
 */
export function meets(a: Envelope, b: Envelope, u: number): boolean {
  if (a.kind === "ring" && b.kind === "ring") {
    const da = axisOf(a.frame);
    const db = axisOf(b.frame);
    const dot = da.dot(db);
    if (Math.abs(dot) > 0.9999) {
      const p = originOf(b.frame).applyMatrix4(a.inv);
      const d = Math.hypot(p.x, p.y);
      const [b0, b1] = dot > 0 ? [p.z + b.z0, p.z + b.z1] : [p.z - b.z1, p.z - b.z0];
      if (!overlap1(a.z0 + u, a.z1 + u, b0, b1)) return false;
      if (d >= a.rOut + b.rOut - TOUCH) return false;
      /* One inside the other's bore. */
      if (d + b.rOut <= a.rIn + TOUCH) return false;
      if (d + a.rOut <= b.rIn + TOUCH) return false;
      return true;
    }
  }
  if (a.kind === "box" && u !== 0) throw new Error("a box does not slide");
  const boxA = a.kind === "ring" ? ringBox(a, u) : new THREE.Box3(a.min.clone(), a.max.clone());
  const boxB = b.kind === "ring" ? ringBox(b, 0) : new THREE.Box3(b.min.clone(), b.max.clone());
  const lo = boxA.min.clone().max(boxB.min);
  const hi = boxA.max.clone().min(boxB.max);
  if (hi.x - lo.x <= TOUCH || hi.y - lo.y <= TOUCH || hi.z - lo.z <= TOUCH) return false;

  /* The boxes meet. Whether the solids do is settled by sampling the region
     they share and asking each envelope whether a point is inside it — exact
     to the grid, and still true at every angle, because a ring's membership
     does not depend on where round it the part happens to be. A box round a
     ring is mostly air at its corners, and judging by boxes alone condemned
     the second Geneva's disc for passing near a post it never reaches. */
  const N = 18;
  const p = new THREE.Vector3();
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      for (let k = 0; k < N; k++) {
        p.set(
          lo.x + ((i + 0.5) / N) * (hi.x - lo.x),
          lo.y + ((j + 0.5) / N) * (hi.y - lo.y),
          lo.z + ((k + 0.5) / N) * (hi.z - lo.z),
        );
        if (inside(a, p, u) && inside(b, p, 0)) return true;
      }
  return false;
}

const q = new THREE.Vector3();
/** Is a world point inside an envelope, the ring slid `u` along its axis? */
function inside(e: Envelope, p: THREE.Vector3, u: number) {
  if (e.kind === "box") {
    return p.x > e.min.x + TOUCH && p.x < e.max.x - TOUCH && p.y > e.min.y + TOUCH &&
      p.y < e.max.y - TOUCH && p.z > e.min.z + TOUCH && p.z < e.max.z - TOUCH;
  }
  q.copy(p).applyMatrix4(e.inv);
  const r = Math.hypot(q.x, q.y);
  return q.z > e.z0 + u + TOUCH && q.z < e.z1 + u - TOUCH && r > e.rIn + TOUCH && r < e.rOut - TOUCH;
}

export type Approach = { dir: 1 | -1; length: number };

/**
 * What a part would hit arriving along its axis from `dir`, over `length`,
 * with everything in `present` already fitted.
 *
 * Sampled along the path finely enough that no envelope in this machine —
 * the thinnest is a plate a few hundredths thick — can be stepped over.
 */
export function hitsOnTheWay(
  key: PartKey,
  approach: Approach,
  env: Map<PartKey, Envelope[]>,
  present: PartKey[],
): string[] {
  /* Boxes — the bed and the standard — are not on a shaft. They come down
     from above, which is how the page moves them: straight down in world Z. */
  const mine = (env.get(key) ?? []).map((e) => e);
  const hits = new Set<string>();
  const STEPS = 160;
  for (let s = 0; s <= STEPS; s++) {
    const u = approach.dir * approach.length * (s / STEPS);
    for (const other of present) {
      if (other === key || designed(key, other)) continue;
      /* A seat may be touched only while the part is entering it. */
      if (seatOf(key, other) && s / STEPS <= SEAT_ENTRY) continue;
      for (const a of mine) {
        if (a.kind === "box") {
          const lifted: Box = {
            ...a,
            min: a.min.clone().setZ(a.min.z + Math.abs(u)),
            max: a.max.clone().setZ(a.max.z + Math.abs(u)),
          };
          for (const b of env.get(other) ?? []) if (meets(lifted, b, 0)) hits.add(other);
          continue;
        }
        for (const b of env.get(other) ?? []) if (meets(a, b, u)) hits.add(other);
      }
    }
  }
  return [...hits];
}
