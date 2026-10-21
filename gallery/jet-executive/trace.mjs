/* Traces a car silhouette out of a photograph.
   ffmpeg decodes to raw RGB; everything else is plain arrays.
   Usage: node trace.mjs <image> <seeds "x,y;x,y"> <tol> <closeR> <eps> <out.png> */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [imgPath, seedSpec, tolS, closeS, epsS, overlayOut, mode = "sill", tyreRatioS = "0"] = process.argv.slice(2);
const TYRE_RATIO = +tyreRatioS;   // real tyre diameter / real vehicle height
const TOL = +tolS, CLOSE = +closeS, EPS = +epsS;
const W = 720;

const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
  "-show_entries", "stream=width,height", "-of", "csv=p=0", imgPath]).toString().trim().split(",");
const H = Math.round(+probe[1] * W / +probe[0]);

const raw = execFileSync("ffmpeg", ["-v", "error", "-i", imgPath,
  "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
  { maxBuffer: 1 << 28 });

const px = (x, y) => { const i = (y * W + x) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };

/* ---- flood fill from seeds ---- */
const seeds = seedSpec.split(";").map(s => s.split(",").map(Number))
  .map(([fx, fy]) => [Math.round(fx * W), Math.round(fy * H)]);
const seedCols = seeds.map(([x, y]) => px(x, y));
const near = (x, y) => {
  const [r, g, b] = px(x, y);
  for (const [cr, cg, cb] of seedCols)
    if (Math.abs(r - cr) + Math.abs(g - cg) + Math.abs(b - cb) < TOL) return true;
  return false;
};
const mask = new Uint8Array(W * H);
if (mode === "dark") {
  /* Dark vehicle on a consistently lighter background: a global luminance
     threshold plus the largest connected blob beats seeded flood fill, which
     leaks wherever a shadow happens to match the paint. TOL is the cut-off. */
  const th = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = px(x, y);
    if (r * 0.299 + g * 0.587 + b * 0.114 < TOL) th[y * W + x] = 1;
  }
  const seen = new Uint8Array(W * H);
  let best = null;
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!th[p0] || seen[p0]) continue;
    const comp = [];
    const st = [p0];
    while (st.length) {
      const p = st.pop();
      if (seen[p] || !th[p]) continue;
      seen[p] = 1; comp.push(p);
      const x = p % W, y = (p / W) | 0;
      if (x > 0) st.push(p - 1);
      if (x < W - 1) st.push(p + 1);
      if (y > 0) st.push(p - W);
      if (y < H - 1) st.push(p + W);
    }
    if (!best || comp.length > best.length) best = comp;
  }
  if (best) for (const p of best) mask[p] = 1;
}
const stack = mode === "dark" ? [] : seeds.map(([x, y]) => y * W + x);
while (stack.length) {
  const p = stack.pop();
  if (mask[p]) continue;
  const x = p % W, y = (p / W) | 0;
  if (!near(x, y)) continue;
  mask[p] = 1;
  if (x > 0) stack.push(p - 1);
  if (x < W - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - W);
  if (y < H - 1) stack.push(p + W);
}

/* ---- morphological close (separable, so it stays fast) ---- */
function pass(src, r, grow) {
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = grow ? 0 : 1;
    for (let d = -r; d <= r; d++) {
      const nx = x + d;
      const s = (nx < 0 || nx >= W) ? 0 : src[y * W + nx];
      if (grow) { if (s) { v = 1; break; } } else if (!s) { v = 0; break; }
    }
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = grow ? 0 : 1;
    for (let d = -r; d <= r; d++) {
      const ny = y + d;
      const s = (ny < 0 || ny >= H) ? 0 : tmp[ny * W + x];
      if (grow) { if (s) { v = 1; break; } } else if (!s) { v = 0; break; }
    }
    out[y * W + x] = v;
  }
  return out;
}
let m = mask;
if (CLOSE > 0) { m = pass(m, CLOSE, true); m = pass(m, CLOSE, false); }

/* ---- column envelope ---- */
const cols = [];
for (let x = 0; x < W; x++) {
  let t = -1, b = -1, n = 0;
  for (let y = 0; y < H; y++) if (m[y * W + x]) { if (t < 0) t = y; b = y; n++; }
  if (t >= 0 && n > 3) cols.push([x, t, b]);
}
if (!cols.length) { console.log(JSON.stringify({ error: "empty mask" })); process.exit(0); }

const top = cols.map(c => [c[0], c[1]]);
const bot = cols.map(c => [c[0], c[2]]);

/* ---- Ramer–Douglas–Peucker ---- */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1, dy = y2 - y1, den = Math.hypot(dx, dy) || 1;
  let maxD = -1, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / den;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  return [pts[0], pts[pts.length - 1]];
}
/* ---- wheels: dark, roughly round blobs in the lower band of the photo ----
   The paintwork flood stops at the tyres and any contrasting lower cladding,
   so the wheels have to be found separately and the sill inferred from them. */
const bodyMinX = Math.min(...cols.map(c => c[0]));
const bodyMaxX = Math.max(...cols.map(c => c[0]));
const dark = new Uint8Array(W * H);
for (let y = Math.floor(H * 0.45); y < H; y++) {
  for (let x = bodyMinX; x <= bodyMaxX; x++) {
    const [r, g, b] = px(x, y);
    if (r * 0.299 + g * 0.587 + b * 0.114 < 78) dark[y * W + x] = 1;
  }
}
/* Hough-style circle search: score candidate circles by how much of their rim
   falls on dark pixels. Far steadier than blob shapes, which merge tyre and
   shadow into something that is no longer round. */
const isDark = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : dark[y * W + x];
function bestCircle(loX, hiX) {
  let best = null;
  const rMin = Math.round(H * 0.055), rMax = Math.round(H * 0.17);
  for (let r = rMin; r <= rMax; r += 1) {
    for (let cx = loX + r; cx <= hiX - r; cx += 2) {
      for (let cy = Math.round(H * 0.55); cy < H - r * 0.35; cy += 2) {
        let on = 0, tot = 0;
        for (let a = 0; a < 360; a += 12) {
          const t = a * Math.PI / 180;
          tot++;
          if (isDark(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r))) on++;
        }
        // require a solid interior too, so plain shadow patches do not win
        let inOn = 0, inTot = 0;
        for (let a = 0; a < 360; a += 30) {
          const t = a * Math.PI / 180;
          inTot++;
          if (isDark(Math.round(cx + Math.cos(t) * r * 0.55), Math.round(cy + Math.sin(t) * r * 0.55))) inOn++;
        }
        const score = (on / tot) * 0.65 + (inOn / inTot) * 0.35;
        if (!best || score > best.score) best = { cx, cy, r, score };
      }
    }
  }
  return best && best.score > 0.72 ? best : null;
}
/* Bright alloy wheels read far more reliably than tyres on a dark car, where
   bodywork, tyre and shadow are all the same near-black. Find the bright discs,
   then infer the tyre from them. */
function brightWheels() {
  const br = new Uint8Array(W * H);
  const yLo = Math.floor(H * 0.55), xPad = Math.round((bodyMaxX - bodyMinX) * 0.07);
  for (let y = yLo; y < H; y++)
    for (let x = bodyMinX + xPad; x <= bodyMaxX - xPad; x++) {
      const [r, g, b] = px(x, y);
      if (r * 0.299 + g * 0.587 + b * 0.114 > 135) br[y * W + x] = 1;
    }
  const seen = new Uint8Array(W * H), out = [];
  for (let y = yLo; y < H; y++) for (let x = bodyMinX + xPad; x <= bodyMaxX - xPad; x++) {
    const p0 = y * W + x;
    if (!br[p0] || seen[p0]) continue;
    let n = 0, x0 = x, x1 = x, y0 = y, y1 = y;
    const st = [p0];
    while (st.length) {
      const p = st.pop();
      if (seen[p] || !br[p]) continue;
      seen[p] = 1; n++;
      const cx = p % W, cy = (p / W) | 0;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      if (cx > bodyMinX + xPad) st.push(p - 1);
      if (cx < bodyMaxX - xPad) st.push(p + 1);
      if (cy > yLo) st.push(p - W);
      if (cy < H - 1) st.push(p + W);
    }
    const w = x1 - x0, h = y1 - y0, ar = w / Math.max(1, h);
    if (n > W * H * 0.0008 && ar > 0.62 && ar < 1.6 && w > W * 0.03)
      out.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: (w + h) / 4, n });
  }
  const sp = bodyMaxX - bodyMinX;
  const pick = (lo, hi) => out.filter(b => b.cx >= lo && b.cx <= hi).sort((a, b) => b.n - a.n)[0];
  return [pick(bodyMinX, bodyMinX + sp * 0.5), pick(bodyMinX + sp * 0.5, bodyMaxX)]
    .filter(Boolean).sort((a, b) => a.cx - b.cx);
}

const span = bodyMaxX - bodyMinX;
let wheelBlobs;
if (mode === "alloy") {
  wheelBlobs = brightWheels().map(w => ({ ...w, r: w.r * 1.58 }));  // bright face -> tyre
} else {
  wheelBlobs = [
    bestCircle(bodyMinX, Math.round(bodyMinX + span * 0.5)),
    bestCircle(Math.round(bodyMinX + span * 0.5), bodyMaxX),
  ].filter(Boolean).map(w => ({ ...w, r: w.r * 1.18 })).sort((a, b) => a.cx - b.cx);
}

/* A true side elevation has both wheels the same size; the per-axle difference
   is only lens perspective in the source photo. Average it out. */
const axle = wheelBlobs.length ? wheelBlobs.reduce((a, w) => a + w.cy, 0) / wheelBlobs.length : Math.max(...bot.map(p => p[1]));
let wheelR = wheelBlobs.length ? wheelBlobs.reduce((a, w) => a + w.r, 0) / wheelBlobs.length : 20;

/* Prefer the published proportion over whatever the detector measured. With
   overall height H = (axle + r) - roof and a target ratio p = 2r/H, this solves
   exactly for r, so the tyres, the arches and the ride height all agree. */
if (TYRE_RATIO > 0) {
  const roofY = Math.min(...top.map(p => p[1]));
  const solved = TYRE_RATIO * (axle - roofY) / (2 - TYRE_RATIO);
  if (isFinite(solved) && solved > 4) wheelR = solved;
}
wheelBlobs.forEach(w => { w.r = wheelR; w.cy = axle; });
const sillY = Math.min(axle - wheelR * 0.52, H - 2);

/* Median-smooth the roofline before simplifying: wing mirrors, aerials and
   roof beacons are one-off protrusions on this particular vehicle, not part of
   the model's shape, and a median window removes them without rounding off
   genuine features like the windscreen rake. */
function medianSmooth(pts, k) {
  const half = k >> 1;
  return pts.map((p, i) => {
    const win = [];
    for (let j = Math.max(0, i - half); j <= Math.min(pts.length - 1, i + half); j++) win.push(pts[j][1]);
    win.sort((a, b) => a - b);
    return [p[0], win[win.length >> 1]];
  });
}
const topSimp = rdp(medianSmooth(top, 21), EPS);

let outline, wheelsOut;
if (mode === "real" || mode === "dark") {
  /* Dark vehicle: the flood already swallowed the tyres, so the traced
     underside IS the real one — wheels included. Use it as-is and read the
     wheel positions back out of the dips. */
  const botS = medianSmooth(bot, 5);
  outline = topSimp.concat(rdp(botS.slice().reverse(), EPS));
  const road = botS.reduce((a, p) => Math.max(a, p[1]), 0);
  const dips = [];
  let run = null;
  for (const [x, y] of botS) {
    if (y > road - 4) { if (!run) run = { x0: x, x1: x }; else run.x1 = x; }
    else if (run) { if (run.x1 - run.x0 > W * 0.02) dips.push(run); run = null; }
  }
  if (run && run.x1 - run.x0 > W * 0.02) dips.push(run);
  dips.sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
  const two = dips.slice(0, 2).sort((a, b) => a.x0 - b.x0);
  const rr = two.length ? two.reduce((a, d) => a + (d.x1 - d.x0) / 2, 0) / two.length : 20;
  wheelsOut = two.map(d => ({ cx: (d.x0 + d.x1) / 2, cy: road - rr, r: rr }));
} else {
  /* Light or two-tone vehicle: the flood stops at the paint, so run the bottom
     along the sill and arch it over each detected wheel. */
  const xR = topSimp[topSimp.length - 1][0], xL = topSimp[0][0];
  const bottom = [[xR, sillY]];
  for (const w of wheelBlobs.slice().sort((a, b) => b.cx - a.cx)) {
    const ar = w.r * 1.16;
    bottom.push([w.cx + ar, sillY]);
    for (let a = 0; a <= 180; a += 12) {
      const t = a * Math.PI / 180;
      bottom.push([w.cx + Math.cos(t) * ar, Math.min(sillY, w.cy - Math.sin(t) * ar)]);
    }
    bottom.push([w.cx - ar, sillY]);
  }
  bottom.push([xL, sillY]);
  outline = topSimp.concat(bottom);
  wheelsOut = wheelBlobs;
}

/* ---- normalise to a 420-wide viewBox ---- */
const extra = (wheelsOut || []).flatMap(w => [[w.cx - w.r, w.cy - w.r], [w.cx + w.r, w.cy + w.r]]);
const allPts = outline.concat(extra);
const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
const S = 380 / (maxX - minX);
const PX = x => +(20 + (x - minX) * S).toFixed(1);
const PY = y => +(16 + (y - minY) * S).toFixed(1);
const d = outline.map((p, i) => (i ? "L" : "M") + PX(p[0]) + " " + PY(p[1])).join(" ") + " Z";

const wheels = wheelsOut.map(w => ({
  cx: PX(w.cx), cy: PY(w.cy), r: +(w.r * S).toFixed(1)
}));

/* ---- overlay png so the fit can be eyeballed ---- */
if (overlayOut) {
  // solid silhouette on black: the shape is what matters, not the photo
  const ov = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { ov[i*3]=11; ov[i*3+1]=11; ov[i*3+2]=13; }
  const put=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return;const i=(y*W+x)*3;ov[i]=216;ov[i+1]=169;ov[i+2]=74;};
  const line=(a,b)=>{const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let t=0;t<=n;t++){const u=t/n;for(let o=-1;o<=1;o++){put(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u+o);put(a[0]+(b[0]-a[0])*u+o,a[1]+(b[1]-a[1])*u);}}};
  for(let i=0;i<outline.length;i++) line(outline[i], outline[(i+1)%outline.length]);
  for(const w of wheelsOut){for(let a=0;a<360;a++){const t=a*Math.PI/180;for(let o=-1;o<=1;o++)put(w.cx+Math.cos(t)*(w.r+o), w.cy+Math.sin(t)*(w.r+o));}}
  const tmp = overlayOut + ".raw";
  fs.writeFileSync(tmp, ov);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
    "-s", `${W}x${H}`, "-i", tmp, overlayOut]);
  fs.unlinkSync(tmp);
}

console.log(JSON.stringify({
  src: imgPath, imgW: W, imgH: H,
  maskPx: m.reduce((a, v) => a + v, 0),
  coveragePct: +(100 * m.reduce((a, v) => a + v, 0) / (W * H)).toFixed(1),
  outlinePoints: outline.length,
  aspect: +((maxX - minX) / (maxY - minY)).toFixed(2),
  wheels, d
}, null, 1));
