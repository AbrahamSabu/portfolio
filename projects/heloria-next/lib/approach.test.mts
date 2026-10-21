/**
 * Nothing passes through anything on its way in.
 *
 *   node lib/approach.test.mts
 *
 * Every part slides onto its shaft, and every one of them — in the order the
 * page fits them, from the side `lib/approach.ts` says — is swept along its
 * whole path against everything already fitted. Judged by the ring each part
 * sweeps as it turns, so the answer holds at whatever angle the machine
 * happens to be at when a reader scrolls: see `lib/clearance.ts`.
 *
 * Before this existed the assembly put the input pinion through the spur gear
 * beside it, pushed shafts through the solid middles of the gears they carry,
 * and brought the output hub in through the standard. Two of those were only
 * found by building this check, and the geometry had to change to pass it:
 * every part was given a bore, the shafts were made to run through what they
 * carry, and the second stage's crank was found to pass through the output
 * shaft on every revolution of the running machine.
 */

import { BUILD_ORDER, STAGES, installAt, type PartKey } from "./build.ts";
import { APPROACH, APPROACH_LENGTH } from "./approach.ts";
import { DESIGNED, SEATS, envelopes, hitsOnTheWay, meets } from "./clearance.ts";
import { sceneAt } from "./parts.ts";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name.padEnd(56)} ${detail}`);
  } else {
    fail++;
    console.log(`FAIL  ${name.padEnd(56)} ${detail}`);
  }
}

const env = envelopes(sceneAt(1.5 * Math.PI * 2));

// ===========================================================================
// Every part, its whole path, clear
// ===========================================================================
{
  const missing = BUILD_ORDER.filter((k) => !APPROACH[k] || !env.has(k));
  check("every part has an approach and a shape", missing.length === 0,
    missing.length ? missing.join(", ") : `${BUILD_ORDER.length} parts`);

  const blocked: string[] = [];
  for (let i = 0; i < BUILD_ORDER.length; i++) {
    const key = BUILD_ORDER[i];
    const hits = hitsOnTheWay(key, APPROACH[key], env, BUILD_ORDER.slice(0, i));
    if (hits.length) blocked.push(`${key} through ${hits.join(", ")}`);
  }
  check("no part passes through anything on its way in", blocked.length === 0,
    blocked.length ? blocked.join("; ") : `${BUILD_ORDER.length} paths of ${APPROACH_LENGTH} clear`);

  /* And they come from far enough to be seen coming — not a twitch into
     place, which is what a short slide looks like at any scroll speed. */
  const short = BUILD_ORDER.filter((k) => APPROACH[k].length < 0.4);
  check("...and each one travels far enough to be seen arriving", short.length === 0,
    short.length ? short.join(", ") : `every part slides ${APPROACH_LENGTH} along its shaft`);
}

// ===========================================================================
// The exemptions are earning their place
// ===========================================================================
{
  /* A pair allowed to touch that never does is an exemption covering
     nothing, and the next thing to go wrong between those two parts would be
     waved through. Every one has to be a contact that really happens. */
  const touches = (a: PartKey, b: PartKey) =>
    (env.get(a) ?? []).some((x) => (env.get(b) ?? []).some((y) => x.kind === "ring" && meets(x, y, 0)));

  const idleSeats = SEATS.filter(([a, b]) => !touches(a, b)).map(([a, b]) => `${a}/${b}`);
  check("every seat is really a seat", idleSeats.length === 0,
    idleSeats.length ? `never touching: ${idleSeats.join(", ")}` : SEATS.map(([a, b]) => `${a} in ${b}`).join("; "));

  const idle = DESIGNED.filter(([a, b]) => !touches(a, b) && !touches(b, a)).map(([a, b]) => `${a}/${b}`);
  check("every designed contact really is one", idle.length === 0,
    idle.length ? `never touching: ${idle.join(", ")}` : `${DESIGNED.length} meshes, Genevas and the clutch`);
}

// ===========================================================================
// ...and the check would notice
// ===========================================================================
{
  /* The two mistakes the assembly actually made, put back. A clearance check
     that passes both of these is not checking clearance. */
  const order = [...BUILD_ORDER];
  const swap = (a: PartKey, b: PartKey) => {
    const i = order.indexOf(a);
    const j = order.indexOf(b);
    [order[i], order[j]] = [order[j], order[i]];
  };
  swap("pinionIn", "spurLow");
  const pin = hitsOnTheWay("pinionIn", APPROACH.pinionIn, env, order.slice(0, order.indexOf("pinionIn")));
  check("it catches the pinion fitted after the spur in front of it", pin.includes("spurLow"),
    `would pass through ${pin.join(", ") || "nothing"}`);

  const i = BUILD_ORDER.indexOf("shaftCross2");
  const out = hitsOnTheWay("shaftCross2", { dir: 1, length: APPROACH_LENGTH }, env, BUILD_ORDER.slice(0, i));
  check("...and the output shaft brought in through the standard", out.includes("standard"),
    `would pass through ${out.join(", ") || "nothing"}`);
}

// ===========================================================================
// One at a time
// ===========================================================================
{
  /* Every path above is checked against the parts already seated. That is
     only the whole truth if no two parts are ever moving at once — two
     parts sliding together can meet in a way neither meets anything seated.
     And it is what makes each one watchable. */
  let overlap = 0;
  let worst = "";
  for (let k = 0; k <= 6000; k++) {
    const p = k / 6000;
    const moving = BUILD_ORDER.filter((part) => {
      const a = installAt(p, part);
      return a > 1e-6 && a < 1 - 1e-6;
    });
    if (moving.length > 1) {
      overlap++;
      worst = moving.join(" + ");
    }
  }
  check("no two parts are ever moving at once", overlap === 0,
    overlap ? `${overlap} of 6000 positions, e.g. ${worst}` : `${STAGES.length} stages, ${BUILD_ORDER.length} parts, strictly in turn`);
}

console.log("");
if (fail) {
  console.log(`${fail} FAILED, ${pass} passed`);
  process.exit(1);
}
console.log(`all ${pass} checks passed`);
