/**
 * The flywheel.
 *
 * Its job is contrast. Everything downstream of it stops — that is the whole
 * point of a Geneva — so something upstream has to visibly never be able to,
 * and a heavy rim turning evenly is the most direct way to say so.
 *
 * The spokes are cut as holes rather than the wheel being drawn as spokes,
 * because a rim has to be continuous or it is a fan. `THREE.Path` holes in a
 * `Shape` extrude as real voids, which is what lets light through them and
 * makes the rotation legible; a solid disc at constant speed is invisible.
 *
 * (A ratchet and pawl lived here too. The pawl read as a pinball flipper, so it
 * went — and the ratchet without it was a cog with nothing to say.)
 */

import * as THREE from "three";

const TAU = Math.PI * 2;

export function flywheelShape(
  radius: number,
  spokes = 6,
  hub = 0.1,
): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, radius, 0, TAU, false);

  const rimIn = radius * 0.74;
  const hubOut = hub * 1.9;
  const gap = ((TAU / spokes) * 0.34) / 2; // half the angular width of a spoke

  /* A spoke hole runs from the hub boss out to the inside of the rim, so the
     boss has to be smaller than that. It was not: a 0.12 hub on a 0.30 wheel
     put `hubOut` at 0.228 against a `rimIn` of 0.222, which makes every hole
     inside-out. `THREE.Path` does not complain about that — it produces a
     shape with no holes in it at all, and the flywheel renders as a plain disc
     that happens to cost six times the vertices. */
  if (hubOut >= rimIn) {
    throw new Error(
      `flywheel hub ${hub} leaves no room for spokes: boss ${hubOut.toFixed(3)} >= rim bore ${rimIn.toFixed(3)}`,
    );
  }

  for (let i = 0; i < spokes; i++) {
    const c = (i / spokes) * TAU + TAU / (spokes * 2);
    const from = c + gap;
    const to = c + TAU / spokes - gap;
    const hole = new THREE.Path();
    hole.absarc(0, 0, hubOut, from, to, false);
    hole.absarc(0, 0, rimIn, to, from, true);
    hole.closePath();
    s.holes.push(hole);
  }

  const bore = new THREE.Path();
  bore.absarc(0, 0, hub, 0, TAU, true);
  s.holes.push(bore);

  return s;
}
