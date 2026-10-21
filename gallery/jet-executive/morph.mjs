/* Re-expresses the three traced outlines on one shared x-grid so the fleet
   selector can morph between them.

   Correspondence is the whole problem with path morphing: interpolating two
   paths with different point counts makes the outline writhe. Every vehicle
   here splits into an x-monotonic top run and an x-monotonic bottom run over
   the same x range, so sampling both at identical normalised x positions makes
   nose map to nose and roof to roof by construction, and the morph collapses to
   interpolating two arrays of y values. */
import fs from "node:fs";

const art = JSON.parse(fs.readFileSync("car-art.json", "utf8"));

const N = 97;                    // grid columns
const X0 = 20, X1 = 400;
const VB_W = 420, VB_H = 192;
const GROUND = 170;              // every vehicle sits on this line

const parse = d => d.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number)
  .reduce((a, v, i) => (i % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []).filter(p => p.length === 2);

/* y at a given x along a monotonic run (direction-agnostic) */
function sampleRun(run, x) {
  const asc = run[run.length - 1][0] >= run[0][0];
  const r = asc ? run : run.slice().reverse();
  if (x <= r[0][0]) return r[0][1];
  if (x >= r[r.length - 1][0]) return r[r.length - 1][1];
  for (let i = 1; i < r.length; i++) {
    if (r[i][0] >= x) {
      const [ax, ay] = r[i - 1], [bx, by] = r[i];
      const t = (bx - ax) === 0 ? 0 : (x - ax) / (bx - ax);
      return ay + (by - ay) * t;
    }
  }
  return r[r.length - 1][1];
}

const out = {};
for (const [key, svg] of Object.entries(art)) {
  const pts = parse(svg.match(/class="body" d="([^"]+)"/)[1]);
  let iMax = 0;
  pts.forEach((p, i) => { if (p[0] > pts[iMax][0]) iMax = i; });
  const topRun = pts.slice(0, iMax + 1);
  const botRun = pts.slice(iMax);

  const tyres = [...svg.matchAll(/class="tyre" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
    .map(m => ({ cx: +m[1], cy: +m[2], r: +m[3] }));
  const road = Math.max(...tyres.map(t => t.cy + t.r));
  const dy = GROUND - road;                       // sit every vehicle on one road

  const top = [], bot = [];
  for (let i = 0; i < N; i++) {
    const x = X0 + (X1 - X0) * i / (N - 1);
    top.push(+(sampleRun(topRun, x) + dy).toFixed(2));
    bot.push(+(sampleRun(botRun, x) + dy).toFixed(2));
  }

  // glass: the run of the roofline sitting above the belt, as grid indices
  const roof = Math.min(...top), floor = Math.max(...bot);
  const beltFrac = key === "sprinter" ? 0.40 : 0.44;
  const belt = roof + (floor - roof) * beltFrac;
  let g0 = -1, g1 = -1;
  for (let i = 0; i < N; i++) {
    if (top[i] < belt) { if (g0 < 0) g0 = i; g1 = i; }
  }

  out[key] = {
    top, bot,
    belt: +belt.toFixed(2),
    glass: [g0, g1],
    wheels: tyres.map(t => ({ cx: +t.cx.toFixed(1), cy: +(t.cy + dy).toFixed(1), r: +t.r.toFixed(1) })),
  };
}

/* ---- dimensional correction ------------------------------------------------
   Drawn length is fixed at 380 for every vehicle, so drawn height must equal
   380 / (length-to-height ratio). The E-Class photo is very slightly off
   perpendicular, which leaves the trace ~9% tall against published figures, so
   scale it about the road line to match. The S-Class is then that corrected
   E-Class at its own ratio, with the wheels spread to its own wheelbase share
   — a real proportional difference rather than a redrawn shape.
     W213 E-Class  4923 / 1468 = 3.354,  wheelbase share 0.597
     W223 S-Class  5289 / 1503 = 3.519,  wheelbase share 0.608
   The Sprinter is left as traced: that photo is square-on, so its proportions
   are already the vehicle's own. */
const LEN = X1 - X0;
function scaleY(v, k) {
  const f = y => +(GROUND - (GROUND - y) * k).toFixed(2);
  return {
    top: v.top.map(f), bot: v.bot.map(f), belt: f(v.belt), glass: v.glass.slice(),
    wheels: v.wheels.map(w => ({ cx: w.cx, cy: f(w.cy), r: +(w.r * k).toFixed(1) })),
  };
}
function spreadWheels(v, k) {
  const mid = (X0 + X1) / 2;
  return { ...v, wheels: v.wheels.map(w => ({ ...w, cx: +(mid + (w.cx - mid) * k).toFixed(1) })) };
}
{
  const e = out["e-class"];
  const drawnH = Math.max(...e.bot.concat(e.wheels.map(w => w.cy + w.r))) - Math.min(...e.top);
  out["e-class"] = scaleY(e, (LEN / 3.354) / drawnH);
  out["s-class"] = spreadWheels(scaleY(out["e-class"], 3.354 / 3.519), 0.608 / 0.597);
}

/* the E-Class, rendered statically — what shows before (or without) JavaScript */
function toPaths(v) {
  const xs = i => (X0 + (X1 - X0) * i / (N - 1));
  const body = v.top.map((y, i) => (i ? "L" : "M") + xs(i).toFixed(1) + " " + y.toFixed(1)).join(" ")
    + " " + v.bot.map((y, i) => "L" + xs(N - 1 - i).toFixed(1) + " " + v.bot[N - 1 - i].toFixed(1)).join(" ") + " Z";
  const [g0, g1] = v.glass;
  let glass = "";
  if (g0 >= 0 && g1 > g0) {
    glass = v.top.slice(g0, g1 + 1).map((y, i) => (i ? "L" : "M") + xs(g0 + i).toFixed(1) + " " + y.toFixed(1)).join(" ")
      + ` L${xs(g1).toFixed(1)} ${v.belt.toFixed(1)} L${xs(g0).toFixed(1)} ${v.belt.toFixed(1)} Z`;
  }
  return { body, glass };
}

const def = toPaths(out["e-class"]);
const w = out["e-class"].wheels;
const staticSvg = `
      <svg class="fleet__svg" viewBox="0 0 ${VB_W} ${VB_H}" role="img" aria-label="Line drawing of the selected vehicle in side profile">
        <path class="ground" d="M8 ${GROUND} H412"/>
        <path class="body" d="${def.body}"/>
        <path class="glass" d="${def.glass}"/>
        ${w.map(t => `<circle class="tyre" cx="${t.cx}" cy="${t.cy}" r="${t.r}"/>`).join("")}
        ${w.map(t => `<circle class="hub" cx="${t.cx}" cy="${t.cy}" r="${(t.r * 0.44).toFixed(1)}"/>`).join("")}
      </svg>`;

fs.writeFileSync("morph-data.json", JSON.stringify({ N, X0, X1, VB_W, VB_H, GROUND, v: out }));
fs.writeFileSync("morph-static.html", staticSvg);
console.log("grid", N, "columns; vehicles:", Object.keys(out).join(", "));
for (const [k, v] of Object.entries(out))
  console.log("  " + k.padEnd(9), "roof", Math.min(...v.top).toFixed(0),
    "glass idx", v.glass.join("-"), "wheels", v.wheels.map(x => x.cx).join("/"));
console.log("payload", (fs.statSync("morph-data.json").size / 1024).toFixed(1), "KB");
