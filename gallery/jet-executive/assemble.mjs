/* Turns the traced outlines into the CAR_ART block used by build.mjs. */
import fs from "node:fs";

const ec = JSON.parse(fs.readFileSync("out_eclass.json", "utf8"));
const sp = JSON.parse(fs.readFileSync("out_sprint.json", "utf8"));

const parse = d => d.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number)
  .reduce((a, v, i) => (i % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []).filter(p => p.length === 2);
const toPath = pts => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + " Z";

/* ---- S-Class: proportional derivation from the traced E-Class -------------
   Published kerb dimensions (mm):
     W213 E-Class : length 4923, height 1468, wheelbase 2939
     W223 S-Class : length 5289, height 1503, wheelbase 3216  (long wheelbase)
   Normalised to equal drawn height, the S-Class is ~4.9% longer overall and
   carries ~6.9% more wheelbase, with only ~2% more overhang. Stretch the
   traced E-Class piecewise on those three ratios rather than inventing a
   shape: the result is a real S-Class proportion, not a guess. */
const E = { L: 4923, H: 1468, WB: 2939 };
const S = { L: 5289, H: 1503, WB: 3216 };
const eLH = E.L / E.H, sLH = S.L / S.H;
const eWB = (E.WB / E.L) * eLH, sWB = (S.WB / S.L) * sLH;
const kWheelbase = sWB / eWB;
const kOverhang = (sLH - sWB) / (eLH - eWB);

const ecPts = parse(ec.d);
/* A single uniform horizontal stretch. A piecewise map would model the longer
   wheelbase too, but it kinks any wheel arch it passes through, and the
   length-to-height ratio is what actually reads at this size. */
const kX = sLH / eLH;
const anchor = Math.min(...ecPts.map(p => p[0]));
const stretch = ([x, y]) => [anchor + (x - anchor) * kX, y];
const scPtsRaw = ecPts.map(stretch);
const scWheelsRaw = ec.wheels.map(w => ({ cx: stretch([w.cx, 0])[0], cy: w.cy, r: w.r }));
const sxMin = Math.min(...scPtsRaw.map(p => p[0])), sxMax = Math.max(...scPtsRaw.map(p => p[0]));
const k = 380 / (sxMax - sxMin);
const fix = ([x, y]) => [20 + (x - sxMin) * k, y];
const scPts = scPtsRaw.map(fix);
const scWheels = scWheelsRaw.map(w => ({ cx: fix([w.cx, 0])[0], cy: w.cy, r: w.r * k }));

/* ---- shared furniture: greenhouse derived from the traced roofline ---- */
function build(name, ptsIn, wheels, label, beltFrac, tyreK) {
  /* Number plates and shadow fringes leave a few points hanging below the sill.
     The sill is the 97th percentile of the traced Y values, so clamping to it
     removes those without touching the wheel arches, which sit above it. */
  const sorted = ptsIn.map(p => p[1]).slice().sort((x, y) => x - y);
  const sillY = sorted[Math.floor(sorted.length * 0.97)];
  const pts = ptsIn.map(([x, y]) => [x, Math.min(y, sillY)]);
  const ys = pts.map(p => p[1]);
  const roof = Math.min(...ys);
  const bottom = Math.max(...ys);
  const belt = roof + (bottom - roof) * beltFrac;

  // Tyres: what the detector finds is the rim or a conservative tyre edge, so
  // bring it up to a real sidewall.
  const wh = wheels.map(w => ({ ...w, r: w.r * tyreK }));

  /* The glass is the run of the traced top contour that sits above the belt —
     i.e. the actual roofline of this car, not a drawn approximation. */
  const half = Math.ceil(pts.length / 2);
  const topRun = pts.slice(0, half);
  let seg = [], best = [];
  for (const p of topRun) {
    if (p[1] < belt) seg.push(p);
    else { if (seg.length > best.length) best = seg; seg = []; }
  }
  if (seg.length > best.length) best = seg;
  const glass = best.length > 2
    ? "M" + best.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L")
      + ` L${best[best.length - 1][0].toFixed(1)} ${belt.toFixed(1)} L${best[0][0].toFixed(1)} ${belt.toFixed(1)} Z`
    : null;

  const road = Math.max(...wh.map(w => w.cy + w.r));
  const vbH = Math.ceil(road + 14);
  return `
    <svg viewBox="0 0 420 ${vbH}" role="img" aria-label="${label}">
      <path class="ground" d="M8 ${road.toFixed(0)} H412"/>
      <path class="body" d="${toPath(pts)}"/>
      ${glass ? `<path class="glass" d="${glass}"/>` : ""}
      ${wh.map(w => `<circle class="tyre" cx="${w.cx.toFixed(1)}" cy="${w.cy.toFixed(1)}" r="${w.r.toFixed(1)}"/>`).join("")}
      ${wh.map(w => `<circle class="hub" cx="${w.cx.toFixed(1)}" cy="${w.cy.toFixed(1)}" r="${(w.r * 0.44).toFixed(1)}"/>`).join("")}
    </svg>`;
}

const art = {
  "e-class": build("e-class", ecPts, ec.wheels,
    "Line drawing of a Mercedes-Benz E-Class saloon in side profile", 0.44, 1.0),
  "s-class": build("s-class", scPts, scWheels,
    "Line drawing of a Mercedes-Benz S-Class saloon in side profile", 0.44, 1.0),
  sprinter: build("sprinter", parse(sp.d), sp.wheels,
    "Line drawing of a Mercedes-Benz Sprinter van in side profile", 0.40, 1.0),
};

fs.writeFileSync("car-art.json", JSON.stringify(art, null, 2));
console.log("kWheelbase", kWheelbase.toFixed(4), "kOverhang", kOverhang.toFixed(4));
console.log("E-Class L/H", eLH.toFixed(3), "-> S-Class L/H", sLH.toFixed(3));
for (const [k2, v] of Object.entries(art)) console.log(k2, "svg", v.length, "chars");
