/**
 * Geneva drive — machined part profiles.
 *
 * Step 2. Every profile here is a closed 2D outline meant to be extruded; the
 * dimensions come from `geneva.ts` so a change to the kinematics moves the metal
 * with it. Nothing in this file knows about materials or rendering.
 *
 * Two depths, not one. The cross and the locking disc are coplanar — they have
 * to be, or the disc cannot sit in the crescent — and they overlap in plan by
 * design, the overlap resolved by the crescent and the gate. The crank runs
 * below that plane and only the pin crosses it. See the driver section.
 */

import * as THREE from "three";
import {
  crankRadius,
  engageHalfAngle,
  slotRadius,
  type GenevaSpec,
} from "./geneva.ts";

export type Dims = {
  /** cross rim radius (= slotRadius) */
  rim: number;
  /** crank radius — where the pin sits */
  crank: number;
  /** centre distance */
  centres: number;
  /** locking disc radius, shared with the cross's crescents */
  lock: number;
  /** half the slot width; also the radius of the slot's root fillet */
  slotHalf: number;
  /** how far in the slot floor sits from the cross centre */
  slotRoot: number;
  /** half-angle of the gate cut out of the locking disc */
  gateHalf: number;
  /** half-width of the crank arm */
  armHalf: number;
  /** pin radius */
  pin: number;
  /** plate thickness */
  thickness: number;
  /**
   * Shaft radius.
   *
   * Bounded by the slot, not by taste. On a four-slot cross the slot floor sits
   * at 0.263c and a shaft proportional to the locking disc never comes near it;
   * on a three-slot cross the crank is *larger* than the cross, the floor drops
   * to 0.104c, and the same proportion puts a 0.109c shaft straight through it.
   * Whichever is smaller wins.
   */
  shaft: number;
  /** running clearance cut into mating surfaces */
  clearance: number;
  /**
   * Chamfer width — and a number every clearance above has to be sized against.
   *
   * `ExtrudeGeometry`'s bevel grows a profile *outward*: ask for a 0.006 bevel
   * and the part comes back 0.006 larger all round, the pocket 0.006 smaller.
   * So a chamfer spends 2·bevel of every gap between two mating parts, and the
   * first version of this spent more than it had — an 0.008 crescent clearance
   * became a 0.004 overlap, and an 0.007 slot clearance became 0.001. Solid
   * metal through solid metal, and invisible to every 2D check, because those
   * measure the outline before it is extruded.
   */
  bevel: number;
};

/**
 * Dimensions for a spec.
 *
 * `lock` is the one free choice, and it is bounded on both sides. Too large and
 * the crescent it cuts swallows the slot mouths; too small and the lock is a
 * token. At 0.52·c the crescent ends fall about 8° clear of the slot walls,
 * which reads as a real tooth of metal between them. It was 0.55 while the
 * crescent clearance was 0.008; widening that clearance to pay for the chamfers
 * grew the crescent, and the tooth had to be bought back here.
 */
export function dims(spec: GenevaSpec, thickness = 0.09, bevel = 0.006): Dims {
  const rim = slotRadius(spec);
  const crank = crankRadius(spec);
  return {
    rim,
    crank,
    centres: spec.centres,
    lock: spec.centres * 0.52,
    /* pin + bevel + a gap you can just see. The roller is deliberately close
       in the slot — a running fit is what the real thing has, and a loose one
       reads as a peg rattling in a groove — but "close" has to clear the
       chamfer first or it is not a fit, it is an overlap. */
    slotHalf: spec.centres * 0.068,
    /* The pin reaches its deepest at mid-index, a distance (c − a) from the
       cross centre, and this is where the floor's fillet is centred — just
       inside that, so the pin runs on the walls and never bottoms out.

       0.004c, not 0.03c. The floor bows a whole fillet radius below this, so
       the old figure cut the three-slot cross's slots to within 0.028 of its
       centre while the pin never came nearer than 0.063: 0.035 of floor that
       nothing ever touched, and exactly the metal a shaft needs. The cross had
       been drawn solid with its shaft passing through it, because there was
       no room for a bore. Now the pin clears the floor by about 0.014 and the
       cross takes a real one. */
    slotRoot: spec.centres - crank - spec.centres * 0.004,
    /* The gate has to pass the cross's rim for the whole engagement, plus
       clearance either side. */
    gateHalf: engageHalfAngle(spec) + 0.12,
    /* From the floor that is actually cut — a fillet radius below the root —
       leaving a real wall between the bore and the slot. It was sized from the
       root, which is the fillet's centre, and on a three-slot cross that put
       the shaft through the bottom of every slot; the cross only survived by
       having no bore at all. Stage 1 is unaffected: the first term wins. */
    shaft: Math.min(
      spec.centres * 0.52 * 0.21,
      (spec.centres - crank - spec.centres * 0.004 - spec.centres * 0.068) * 0.62,
    ),
    armHalf: spec.centres * 0.082,
    pin: spec.centres * 0.054,
    thickness,
    /* Nothing in a real mechanism is a zero-gap fit, and nothing rendered as
       one looks real either: coincident surfaces z-fight and read as parts
       melting into each other. The crescent is cut this much larger than the
       disc it holds — 2·bevel to pay for the two chamfers facing each other
       across the gap, and about a plate-thickness-eighth left over so the gap
       survives as a dark line rather than closing to a seam. */
    clearance: spec.centres * 0.024,
    bevel,
  };
}

/* ------------------------------------------------------------------ helpers */

/** Where two circles cross: radius `r0` about the origin, `r1` about (d, 0). */
function circleIntersect(r0: number, r1: number, d: number) {
  const x = (d * d + r0 * r0 - r1 * r1) / (2 * d);
  const ySq = r0 * r0 - x * x;
  if (ySq <= 0) return null;
  return { x, y: Math.sqrt(ySq) };
}

const TAU = Math.PI * 2;

/* -------------------------------------------------------------------- cross */

/**
 * The Maltese cross.
 *
 * Walked once round the perimeter, alternating: rim, slot in, root fillet, slot
 * out, rim, crescent. The crescent is the part worth reading twice — it is an
 * arc about the *driver's* axis, a distance `centres` away, because it is cut
 * by the locking disc rather than turned about the cross's own centre. Drawing
 * it about the cross centre gives a shape that looks plausible and cannot
 * actually hold the disc.
 */
export function crossShape(spec: GenevaSpec, d: Dims, bore?: number): THREE.Shape {
  const n = spec.slots;
  const step = TAU / n;
  const s = new THREE.Shape();

  /**
   * Everything on this profile is placed relative to the DRIVER, which sits at
   * local π — not relative to local zero.
   *
   * At rest two slots must straddle the line of centres at ±step/2, with a
   * crescent on it for the locking disc to sit in. Measured from zero, that is
   * `step/2 + i·step`, and it happens to come out right whenever n is even,
   * because π is then a whole number of steps. For odd n it is half a step out:
   * a three-slot cross gets a slot pointing straight down the line of centres
   * at rest and no slot where the pin actually arrives, so the pin spends every
   * index buried in metal.
   *
   * For even n this offset changes nothing at all — which is why it survived
   * four slots without complaint.
   */
  const base = Math.PI;

  // half-angle subtended at the cross centre by a slot wall meeting the rim
  const slotHalfAng = Math.asin(d.slotHalf / d.rim);

  /* Crescent: the locking disc, radius d.lock, centred d.centres away. Where
     its circle crosses the rim gives the crescent's two ends. */
  const cresR = d.lock + d.clearance; // cut proud of the disc, never equal to it
  const hit = circleIntersect(d.rim, cresR, d.centres);
  if (!hit) throw new Error("locking disc does not reach the cross rim");
  const cresHalfAng = Math.atan2(hit.y, hit.x); // about the cross centre

  // the same two points, as bearings about the driver's axis
  const cresFromDriver = Math.atan2(hit.y, hit.x - d.centres);

  const at = (r: number, a: number) =>
    [Math.cos(a) * r, Math.sin(a) * r] as const;

  // start on the rim, just after crescent 0 (which is centred on bearing 0)
  let a0 = base + cresHalfAng;
  s.moveTo(...at(d.rim, a0));

  for (let i = 0; i < n; i++) {
    const slot = base + step / 2 + i * step; // slot centreline
    const nextCres = base + (i + 1) * step; // next crescent centreline

    // rim up to the slot's trailing wall
    s.absarc(0, 0, d.rim, a0, slot - slotHalfAng, false);

    // down one wall, round the root, back up the other
    const wall = slot - Math.PI / 2; // wall direction, perpendicular to centreline
    const rootC = at(d.slotRoot, slot);
    s.lineTo(
      rootC[0] + Math.cos(wall) * d.slotHalf,
      rootC[1] + Math.sin(wall) * d.slotHalf,
    );
    /* Clockwise, so the fillet bows *inward*, toward the cross centre. Swept
       the other way it bulges back out toward the rim and leaves a lump of
       metal standing in the slot to radius 0.325 — and the pin reaches 0.293,
       so it ploughed through that lump for the middle fifth of every index.
       The slot then bottoms at slotRoot − slotHalf, not at slotRoot. */
    s.absarc(rootC[0], rootC[1], d.slotHalf, wall, wall + Math.PI, true);

    // rim onward to where the next crescent begins
    s.absarc(0, 0, d.rim, slot + slotHalfAng, nextCres - cresHalfAng, false);

    /* The crescent itself, swept about the driver's axis.

       Two arcs join the same pair of endpoints on that circle and only one of
       them is the pocket: the near arc passes through the bearing pointing from
       the driver *towards* the cross, reaching in to radius (centres − lock);
       the far arc bulges out to (centres + lock), which for these dimensions is
       1.55 — more than twice the cross's own rim. Both close the outline, and
       the wrong one only shows up as a profile point far outside the envelope,
       which is why there is a check for exactly that. Clockwise from the lower
       endpoint keeps it on the near side. */
    const dc = at(d.centres, nextCres);
    s.absarc(
      dc[0],
      dc[1],
      cresR,
      nextCres - cresFromDriver,
      nextCres + cresFromDriver,
      true,
    );

    a0 = nextCres + cresHalfAng;
  }

  s.closePath();
  return withBore(s, bore);
}

/* ------------------------------------------------------------------- driver */

/**
 * The driver is two parts at two depths, and that is not a detail.
 *
 * The locking disc must be coplanar with the cross — that is the only way its
 * rim can sit in the cross's crescent. But the crank reaches out to radius
 * `crank`, well past the disc, and the arm carrying it is *wider than a slot*
 * (0.075c against a slot half-width of 0.062c). Put the arm in the cross's
 * plane, as the first version of this did, and every index drives it straight
 * through the slot walls.
 *
 * So: disc coplanar with the cross, crank below it, and only the pin — which is
 * narrower than the slot — rises through the plane to do the work. That is also
 * how the real mechanism is made, for the same reason.
 */

/**
 * Cut a bore for the shaft a part turns on.
 *
 * Every part here was solid where its shaft passes — the shaft was simply
 * drawn through it. Seated, that reads as a keyed fit. Sliding on, it reads as
 * a shaft growing out of the face of a gear, which is what the assembly showed
 * until `lib/clearance.ts` measured it. Optional, so a shape drawn for a
 * figure with no shaft stays as it was.
 */
export function withBore<T extends THREE.Shape>(shape: T, bore?: number): T {
  if (!bore || bore <= 0) return shape;
  const hole = new THREE.Path();
  hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

/** The locking disc: a full disc with the gate cut out of it. Cross plane. */
export function lockDiscShape(spec: GenevaSpec, d: Dims): THREE.Shape {
  const s = new THREE.Shape();
  const hub = d.lock * 0.26;
  const at = (r: number, a: number) =>
    [Math.cos(a) * r, Math.sin(a) * r] as const;

  s.moveTo(...at(d.lock, d.gateHalf));
  s.absarc(0, 0, d.lock, d.gateHalf, -d.gateHalf + TAU, false);
  s.lineTo(...at(hub, -d.gateHalf));
  s.absarc(0, 0, hub, -d.gateHalf, d.gateHalf, true);
  s.closePath();
  return s;
}

/** The crank: hub, arm, pin boss. Runs below the cross plane. */
export function crankShape(spec: GenevaSpec, d: Dims, bore?: number): THREE.Shape {
  const s = new THREE.Shape();
  const hub = d.lock * 0.34;

  s.moveTo(0, hub);
  // the long way round the hub, so the arm leaves from the far side
  s.absarc(0, 0, hub, Math.PI / 2, -Math.PI / 2, false);
  s.lineTo(d.crank, -d.armHalf);
  s.absarc(d.crank, 0, d.armHalf, -Math.PI / 2, Math.PI / 2, false);
  s.closePath();
  return withBore(s, bore);
}

/**
 * Extrude a profile, centred on its own thickness.
 *
 * `bevel` must be the same number the clearances in `dims()` were sized
 * against — pass `d.bevel`. Raising it here alone re-opens the interference it
 * was paid for.
 */
export function extrude(
  shape: THREE.Shape,
  thickness: number,
  bevel = 0.006,
  curveSegments = 64,
) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    /* 64 is right for a cross's rim or a locking disc, where a single arc
       sweeps most of a revolution. It is absurd for a gear, where every one of
       36 tooth tips is its own arc a few degrees wide — that alone was 43,000
       vertices for one wheel. Curvature per arc is what matters, not polish. */
    curveSegments,
  });
  g.translate(0, 0, -thickness / 2);
  g.computeVertexNormals();
  return g;
}

/* --------------------------------------------------------------------- depth */

export type Depths = {
  /** mid-plane of the crank plate */
  crank: number;
  /** crank plate thickness */
  crankT: number;
  /** length and mid-point of the stud that carries the roller */
  studLen: number;
  studMid: number;
  /** the roller's length; it is centred on the cross plane */
  rollerLen: number;
  /** mid-plane of the bearing bosses */
  plinth: number;
};

/**
 * Where each part sits through the thickness.
 *
 * This lived inside the renderer until the pin turned out to be lying on its
 * side. It is geometry — it decides which parts can touch and which cannot —
 * so it belongs where the tests and the drawings can reach it, not in a
 * `useMemo`. The cross plate is the datum, centred on z = 0.
 *
 * The locking disc shares that plate's plane, because that is the only way its
 * rim reaches into the crescent. The crank runs clear below it, because the arm
 * carrying the pin is wider than a slot and would otherwise mill through the
 * slot walls. Only the roller crosses the datum, and only the roller is sized
 * to fit a slot.
 */
export function depths(d: Dims): Depths {
  const crankT = d.thickness * 0.78;
  const gap = d.thickness * 0.14;
  const crank = -d.thickness / 2 - gap - crankT / 2;
  const studTop = d.thickness / 2 + d.thickness * 0.18;
  const studBottom = crank - crankT / 2;
  return {
    crank,
    crankT,
    studLen: studTop - studBottom,
    studMid: (studTop + studBottom) / 2,
    /* Standing a little proud of the plate top and bottom is what makes the
       roller read as a separate turned part rather than a coloured patch. */
    rollerLen: d.thickness + d.thickness * 0.24,
    plinth: studBottom - d.thickness * 0.5,
  };
}

/**
 * A cylinder standing along Z, which is the only way one is ever wanted here.
 *
 * `CylinderGeometry` builds along Y. Every profile in this project lies in XY
 * with its thickness along Z, and every `rotation.z` turns about that same Z —
 * so a bare cylinder dropped among these plates lies *flat in their plane*. The
 * crank pin did exactly that for a whole step: a rod on its side, scything
 * through the cross once a revolution, under fifty passing checks, invisible in
 * plan because a sideways pin and an upright one are the same circle from above.
 *
 * One builder, so there is one place for that rotation to be right. Both
 * renderers had their own copy of it; a third was about to be written.
 */
export function axleGeometry(radius: number, length: number, segments = 20) {
  const g = new THREE.CylinderGeometry(radius, radius, length, segments);
  g.rotateX(Math.PI / 2);
  return g;
}
