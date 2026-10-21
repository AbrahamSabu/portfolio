/* =============================================================================
   Heloria Labs — motion system
   anime.js v4.5.0, vendored (MIT). No build step, no framework.

   Triggering strategy:
     · a passive scroll listener — for the vine. Growth is keyed to the page's
                             y position, not to arc length along the stem, so
                             the tip always sits where you are reading.
     · cached document offsets — for the scrubbed Kríos word reveal and the
       parallax layers, both driven from scrollY with no per-frame layout reads.
     · IntersectionObserver — for one-shot reveals, where a precise visibility
                             threshold matters more than scrubbing.

   Everything degrades: if this module never boots, the inline guard in <head>
   strips .js after 2.5s and the page renders fully visible and static.
   ========================================================================== */

import {
  animate, createTimeline, createTimer, spring, createDrawable,
  createMotionPath, stagger, splitText, utils
} from '/assets/vendor/anime.esm.min.js';

const root = document.documentElement;
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVGNS = 'http://www.w3.org/2000/svg';

clearTimeout(window.__heloriaFallback);

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

const main    = $('#main');
const vineSvg = $('#vine');

/* ----------------------------------------------------------- geometry */

const PETAL   = 'M0 0 C -11 8, -13 28, 0 38 C 13 28, 11 8, 0 0 Z';
const LEAF    = 'M0 0 C -6 7, -7 20, 0 30 C 7 20, 6 7, 0 0 Z';
const THORN   = 'M0 -2.5 Q 6 -3, 10 -10 Q 5.5 -3.5, 0 2.5 Z';
const TENDRIL = 'M0 0 C 9 -7, 20 -6, 24 3 C 28 12, 19 18, 13 13 C 8 9, 11 3, 16 5';

/* A lily tepal. PETAL is a rounded oval; this is narrow at the base, widest
   about a third of the way down and drawn to a point — which, with the stamens
   below, is what makes the hero read as a lily rather than a generic bloom. */
const LILY = 'M0 0 C -6.5 9, -9 22, -4 32 C -2.5 36, -1 38.5, 0 40 '
           + 'C 1 38.5, 2.5 36, 4 32 C 9 22, 6.5 9, 0 0 Z';
const LILY_VEIN = 'M0 4 C 0.6 14, 0.6 26, 0 36';

/* Three outer tepals with three more set between them, the way a lily is
   actually arranged, rather than a ring of identical petals. */
const LILY_OUTER = [0, 120, 240];
const LILY_INNER = [60, 180, 300];
const LILY_STAMENS = [30, 90, 150, 210, 270, 330];

/* What the growing tip wakes as it passes. Deliberately excludes .k-badge:
   that logo already carries a heavy recolour filter of its own. */
const IGNITE = [
  '.sec-title', '.eyebrow', '.stage-num', '.stage-icon', '.stage h3',
  '.chips li', '.contact-mail', '.person-mark', '.feature-head',
  '.tenet-glyph', '.tenets h3', '.arc-n', '.arc-steps h3', '.reach h3'
].join(', ');

const OUTER_ANGLES = [0, 72, 144, 216, 288];
const INNER_ANGLES = [36, 108, 180, 252, 324];

const isMobile = () => document.documentElement.clientWidth < 768;

function el(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  (parent || vineSvg).appendChild(n);
  return n;
}

/** centre of an element, in <main>'s coordinate space */
function pointOf(node) {
  const r = node.getBoundingClientRect();
  const m = main.getBoundingClientRect();
  return { x: r.left - m.left + r.width / 2, y: r.top - m.top + r.height / 2 };
}

/**
 * Centripetal Catmull-Rom through pts → smooth cubic bezier.
 *
 * The uniform form takes each tangent from the raw neighbour difference, which
 * falls apart when consecutive spacings differ a lot — and they differ hugely
 * here, where a spiral sampled every ~6px sits between sway points hundreds of
 * pixels apart. The result was cusps and little self-intersecting loops at the
 * curl entries. Centripetal parameterisation (alpha = 0.5) weights the tangents
 * by distance and is provably free of both.
 */
function splinePath(pts, alpha = 0.5) {
  if (pts.length < 2) return '';
  const n = pts.length;
  const mirror = (a, b) => ({ x: 2 * a.x - b.x, y: 2 * a.y - b.y });
  const w = (a, b) => Math.pow(Math.hypot(b.x - a.x, b.y - a.y), alpha) || 1e-6;

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    // extrapolate past the ends rather than duplicating, which would give a
    // zero-length span and blow up the weights
    const p0 = i > 0 ? pts[i - 1] : mirror(pts[0], pts[1]);
    const p3 = i + 2 < n ? pts[i + 2] : mirror(pts[n - 1], pts[n - 2]);

    const d1 = w(p0, p1), d2 = w(p1, p2), d3 = w(p2, p3);
    const d1s = d1 * d1, d2s = d2 * d2, d3s = d3 * d3;

    const c1 = 3 * d1 * (d1 + d2);
    const c2 = 3 * d3 * (d3 + d2);
    const b1x = (d1s * p2.x - d2s * p0.x + (2 * d1s + 3 * d1 * d2 + d2s) * p1.x) / c1;
    const b1y = (d1s * p2.y - d2s * p0.y + (2 * d1s + 3 * d1 * d2 + d2s) * p1.y) / c1;
    const b2x = (d3s * p1.x - d2s * p3.x + (2 * d3s + 3 * d3 * d2 + d2s) * p2.x) / c2;
    const b2y = (d3s * p1.y - d2s * p3.y + (2 * d3s + 3 * d3 * d2 + d2s) * p2.y) / c2;

    d += ` C ${b1x.toFixed(2)} ${b1y.toFixed(2)}, ${b2x.toFixed(2)} ${b2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/* Guarantee the finished stem sits inside the page.

   `inset` only constrains the control *points*. A centripetal spline bows well
   past them on the sharp reversals — about 25px at a phone width — so the vine
   was reaching x = -13 on a 375px screen and clipping flat against the edge,
   which reads as a straight scar where a curl should be.

   A cubic Bezier is affine-equivariant: scaling every control-point x about a
   fixed point scales the curve's own extent by exactly the same factor. So
   measure the true extrema (endpoints plus the roots of the derivative), then
   map them into the band. The correction is typically under 4%, which is
   invisible, and it is correct at any viewport width rather than tuned for one. */
function fitPathX(d, lo, hi) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 8) return d;
  const v = nums.map(Number);

  // x-extent of one cubic: the two endpoints, plus any turning point inside 0..1
  const ext = (p0, p1, p2, p3) => {
    let a = Math.min(p0, p3), b = Math.max(p0, p3);
    const at = t => { const u = 1 - t;
      return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3; };
    const hit = t => { if (t > 0 && t < 1) { const x = at(t);
      if (x < a) a = x; if (x > b) b = x; } };
    // B'(t) = 0  ->  t^2(c1-2c2+c3) + 2t(c2-c1) + c1 = 0, c = successive deltas
    const c1 = p1 - p0, c2 = p2 - p1, c3 = p3 - p2;
    const A = c1 - 2*c2 + c3, B = 2*(c2 - c1), C = c1;
    if (Math.abs(A) < 1e-9) { if (Math.abs(B) > 1e-9) hit(-C / B); }
    else { const disc = B*B - 4*A*C;
      if (disc >= 0) { const s = Math.sqrt(disc);
        hit((-B + s) / (2*A)); hit((-B - s) / (2*A)); } }
    return [a, b];
  };

  let px = v[0], min = v[0], max = v[0];
  for (let i = 2; i + 5 < v.length; i += 6) {
    const [a, b] = ext(px, v[i], v[i + 2], v[i + 4]);
    if (a < min) min = a;
    if (b > max) max = b;
    px = v[i + 4];
  }
  if (min >= lo && max <= hi) return d;

  const span = max - min, room = hi - lo;
  const s = span > room ? room / span : 1;
  const off = s < 1 ? lo - min * s
            : min < lo ? lo - min
            : hi - max;

  // every even-indexed number in the string is an x
  let k = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, m =>
    ((k++ % 2) === 0 ? (+m * s + off) : +m).toFixed(2));
}

/** angle of the path at `len`, in degrees */
function tangentAngle(path, len, total) {
  const a = path.getPointAtLength(Math.max(0, len - 2));
  const b = path.getPointAtLength(Math.min(total, len + 2));
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

/** fraction of total length where the path passes closest to pt */
/* A stand-in for a measured <path>, with the two methods the rest of this file
   asks of one.

   The centreline is never drawn — it exists only to be measured. But measuring
   it through the SVG geometry engine was the single slowest thing on the page:
   getPointAtLength on a path this long costs milliseconds *per call*, and the
   build makes thousands of them (1600 for the curvature pass, ~1000 for the
   ribbon, 681 for the y table, 300 for every fractionAt). That is seconds of
   blocked main thread before anything appears, and it is why the no-flash
   guard's 2.5s deadline kept firing on slower loads.

   So flatten the spline once, in plain JS, into a polyline with a cumulative
   length table. Every later query is a binary search and a lerp. The `d` here
   is one this file generated, so the grammar is known: `M x y` followed by
   absolute `C` triples. */
function makeFlatPath(d, step = 2.5) {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (n.length < 8) {
    const x = n[0] || 0, y = n[1] || 0;
    return { getTotalLength: () => 0, getPointAtLength: () => ({ x, y }) };
  }

  const xs = [n[0]], ys = [n[1]], cum = [0];
  let px = n[0], py = n[1], total = 0;

  for (let i = 2; i + 5 < n.length; i += 6) {
    const x1 = n[i], y1 = n[i + 1], x2 = n[i + 2], y2 = n[i + 3], x3 = n[i + 4], y3 = n[i + 5];
    /* the control polygon is an upper bound on the curve's length, which is a
       good enough budget for how finely to chop this segment */
    const poly = Math.hypot(x1 - px, y1 - py)
               + Math.hypot(x2 - x1, y2 - y1)
               + Math.hypot(x3 - x2, y3 - y2);
    const steps = Math.max(3, Math.min(96, Math.ceil(poly / step)));
    for (let s = 1; s <= steps; s++) {
      const tt = s / steps, u = 1 - tt;
      const uu = u * u, tt2 = tt * tt;
      const x = uu * u * px + 3 * uu * tt * x1 + 3 * u * tt2 * x2 + tt2 * tt * x3;
      const y = uu * u * py + 3 * uu * tt * y1 + 3 * u * tt2 * y2 + tt2 * tt * y3;
      total += Math.hypot(x - xs[xs.length - 1], y - ys[ys.length - 1]);
      xs.push(x); ys.push(y); cum.push(total);
    }
    px = x3; py = y3;
  }

  const last = xs.length - 1;
  return {
    getTotalLength() { return total; },
    getPointAtLength(L) {
      if (!(L > 0)) return { x: xs[0], y: ys[0] };
      if (L >= total) return { x: xs[last], y: ys[last] };
      let lo = 0, hi = last;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= L) lo = mid; else hi = mid;
      }
      const span = cum[hi] - cum[lo] || 1;
      const f = (L - cum[lo]) / span;
      return { x: xs[lo] + (xs[hi] - xs[lo]) * f, y: ys[lo] + (ys[hi] - ys[lo]) * f };
    }
  };
}

function fractionAt(path, total, pt) {
  let best = 0, bestD = Infinity;
  const samples = 300;
  for (let i = 0; i <= samples; i++) {
    const p = path.getPointAtLength(total * i / samples);
    const d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
    if (d < bestD) { bestD = d; best = i / samples; }
  }
  return best;
}

const RIB = 420;   // default ribbon outline samples

/**
 * Choose where to sample the centreline: densely through the curls, sparsely
 * along the straight runs.
 *
 * Uniform arc-length sampling spends most of its budget on the long easy
 * stretches and arrives at a tight loop with only a handful of points, which is
 * exactly where the outline needs them. Walking a blend of distance and turning
 * (`ds + S·dθ`) and then stepping through it evenly puts the samples where the
 * curve actually bends, at no extra cost.
 */
function curvatureSamples(path, total, count, S = 150) {
  const M = 1600;
  const pts = new Array(M + 1);
  for (let i = 0; i <= M; i++) pts[i] = path.getPointAtLength(total * i / M);

  const cum = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) {
    const ds = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    let dth = 0;
    if (i > 1) {
      const a1 = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x);
      const a2 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
      dth = Math.abs(a2 - a1);
      if (dth > Math.PI) dth = 2 * Math.PI - dth;
    }
    cum[i] = cum[i - 1] + ds + S * dth;
  }

  const out = new Array(count + 1);
  const grand = cum[M] || 1;
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const target = grand * k / count;
    while (j < M && cum[j + 1] < target) j++;
    const span = (cum[j + 1] - cum[j]) || 1;
    out[k] = total * (j + (target - cum[j]) / span) / M;
  }
  out[count] = total;
  return out;
}

/**
 * Walk the centreline and offset each sample along its normal by a width that
 * tapers from wBase to wTip, giving the two edges of a stem-shaped ribbon.
 *
 * Returns the edges as pre-rendered path fragments so that drawing only the
 * grown portion is string concatenation rather than geometry work — the stem
 * used to be revealed with a full-page SVG <mask>, which re-rasterised an area
 * the size of the whole document on every frame and was the single most
 * expensive thing on the page on a phone.
 */
/**
 * Turn a run of points into per-segment cubic fragments, so a sliced path can be
 * assembled by string concatenation and still be a curve. frag[i] moves from
 * P[i-1] to P[i]; centripetal weighting, same as splinePath.
 */
function bezierFrags(P) {
  const n = P.length;
  const mirror = (a, b) => ({ x: 2 * a.x - b.x, y: 2 * a.y - b.y });
  const w = (a, b) => Math.pow(Math.hypot(b.x - a.x, b.y - a.y), 0.5) || 1e-6;
  const out = new Array(n);
  for (let i = 1; i < n; i++) {
    const p1 = P[i - 1], p2 = P[i];
    const p0 = i - 2 >= 0 ? P[i - 2] : mirror(P[0], P[1]);
    const p3 = i + 1 < n ? P[i + 1] : mirror(P[n - 1], P[n - 2]);
    const d1 = w(p0, p1), d2 = w(p1, p2), d3 = w(p2, p3);
    const d1s = d1 * d1, d2s = d2 * d2, d3s = d3 * d3;
    const c1 = 3 * d1 * (d1 + d2), c2 = 3 * d3 * (d3 + d2);
    const b1x = (d1s * p2.x - d2s * p0.x + (2 * d1s + 3 * d1 * d2 + d2s) * p1.x) / c1;
    const b1y = (d1s * p2.y - d2s * p0.y + (2 * d1s + 3 * d1 * d2 + d2s) * p1.y) / c1;
    const b2x = (d3s * p1.x - d2s * p3.x + (2 * d3s + 3 * d3 * d2 + d2s) * p2.x) / c2;
    const b2y = (d3s * p1.y - d2s * p3.y + (2 * d3s + 3 * d3 * d2 + d2s) * p2.y) / c2;
    out[i] = ` C ${b1x.toFixed(1)} ${b1y.toFixed(1)}, ${b2x.toFixed(1)} ${b2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return out;
}

/**
 * Walk the centreline and offset each sample along its normal by a width that
 * tapers from wBase to wTip, giving the two edges of a stem-shaped ribbon.
 *
 * Both edges are emitted as cubic fragments, not line segments. The centreline
 * was always a smooth spline, but the ribbon actually drawn on top of it used to
 * be a polygon — and around a tight curl the straight hops between samples were
 * plainly visible as flat facets. Curved edges are smooth however coarsely the
 * centreline is sampled, which also means far fewer samples are needed.
 */
function taperedRibbon(path, total, wBase, wTip, samples = RIB) {
  const lengths = curvatureSamples(path, total, samples);
  const L = [], R = [], C = [];
  for (let i = 0; i <= samples; i++) {
    const len = lengths[i];
    const t = len / total;          // taper follows real distance, not index
    const p = path.getPointAtLength(len);
    const a = path.getPointAtLength(Math.max(0, len - 1));
    const b = path.getPointAtLength(Math.min(total, len + 1));
    const dx = b.x - a.x, dy = b.y - a.y;
    const m = Math.hypot(dx, dy) || 1;
    const nx = -dy / m, ny = dx / m;
    // organic wobble so the edge is never mechanically parallel
    const w = (wBase + (wTip - wBase) * Math.pow(t, 0.7)) * (1 + 0.07 * Math.sin(t * 19));
    L.push({ x: p.x + nx * w / 2, y: p.y + ny * w / 2 });
    R.push({ x: p.x - nx * w / 2, y: p.y - ny * w / 2 });
    C.push({ x: p.x, y: p.y });
  }

  const Rrev = R.slice().reverse();
  return {
    samples,
    L, R, C,
    head: `M ${L[0].x.toFixed(1)} ${L[0].y.toFixed(1)}`,
    Lfrag: bezierFrags(L),
    // fragments for walking the right edge backwards, from the tip to the base
    Rfrag: bezierFrags(Rrev)
  };
}

/* Sliced by range rather than always from the base.
   The grown stem is drawn as two paths: a settled body that only changes every
   few samples, and a short piece at the tip that changes every frame. The
   ribbon's bounding box is the height of the whole document, so rewriting its
   `d` invalidated a page-sized raster region on every single frame. Splitting it
   keeps that invalidation down to the length of the tip. */

function edgeRange(rib, a, b) {
  if (b <= a) return '';
  let d = `M ${rib.L[a].x.toFixed(1)} ${rib.L[a].y.toFixed(1)}`;
  for (let i = a + 1; i <= b; i++) d += rib.Lfrag[i];
  return d;
}

/* The live tip, taken to an exact fractional sample and tapered to a point.

   ribbonRange below ends on a whole sample and closes with a straight `L`
   across the ribbon's full width. For the settled chunks that is invisible --
   they always end on a chunk boundary. For the growing tip it was not: the end
   was placed at Math.round(p * samples) while the tip marker was placed at the
   exact fraction, so at ~35px between samples the ribbon finished with a blunt
   square cut up to half a sample away from the marker. And because the path was
   only rewritten when the rounded index changed, the ribbon sat frozen between
   crossings while the marker kept gliding -- which is what read as an orange
   square with the tip trailing behind it.

   Ending at the marker's own point makes the two agree by construction, at any
   sampling density. */
function ribbonRangeTip(rib, a, bf, tip) {
  const n = rib.samples;
  const bi = Math.max(a + 1, Math.min(n, Math.floor(bf)));
  let d = `M ${rib.L[a].x.toFixed(1)} ${rib.L[a].y.toFixed(1)}`;
  for (let i = a + 1; i <= bi; i++) d += rib.Lfrag[i];
  // close on the marker rather than straight across, so the stem comes to a point
  d += ` L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;
  d += ` L ${rib.R[bi].x.toFixed(1)} ${rib.R[bi].y.toFixed(1)}`;
  for (let j = n - bi + 1; j <= n - a; j++) d += rib.Rfrag[j];
  return d + ' Z';
}

function edgeRangeTip(rib, a, bf, tip) {
  const n = rib.samples;
  const bi = Math.max(a + 1, Math.min(n, Math.floor(bf)));
  let d = `M ${rib.L[a].x.toFixed(1)} ${rib.L[a].y.toFixed(1)}`;
  for (let i = a + 1; i <= bi; i++) d += rib.Lfrag[i];
  return d + ` L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;
}

function ribbonRange(rib, a, b) {
  if (b <= a) return '';
  const n = rib.samples;
  let d = `M ${rib.L[a].x.toFixed(1)} ${rib.L[a].y.toFixed(1)}`;
  for (let i = a + 1; i <= b; i++) d += rib.Lfrag[i];
  // straight across the tip, then back down the far edge
  d += ` L ${rib.R[b].x.toFixed(1)} ${rib.R[b].y.toFixed(1)}`;
  for (let j = n - b + 1; j <= n - a; j++) d += rib.Rfrag[j];
  return d + ' Z';
}

/* ------------------------------------------------------------ splitting
   Class names emitted by splitText are internal, so nothing here depends on
   them: we hide the parent in CSS, split, hide the pieces via utils.set,
   then bring the parent back. No flash, no coupling. */

function splitInto(node, mode) {
  try {
    const s = splitText(node, mode === 'chars' ? { chars: true, words: true } : { words: true });
    const parts = mode === 'chars' ? s.chars : s.words;
    if (!parts || !parts.length) return null;
    utils.set(parts, { opacity: 0 });
    utils.set(node, { opacity: 1 });
    return parts;
  } catch (err) {
    utils.set(node, { opacity: 1 });
    return null;
  }
}

/* =========================================================== hero flower */

function buildHeroFlower() {
  const svg = $('#heroFlower');
  if (!svg) return;
  const outer = $('.hf-outer', svg);
  const inner = $('.hf-inner', svg);

  const mk = (parent, angles, scale) => angles.map(a => {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('transform', `rotate(${a})${scale ? ` scale(${scale})` : ''}`);
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', LILY);
    p.setAttribute('fill', 'currentColor');
    g.appendChild(p);
    // the crease down the middle, which is most of what gives a tepal its form
    const v = document.createElementNS(SVGNS, 'path');
    v.setAttribute('d', LILY_VEIN);
    v.setAttribute('fill', 'none');
    v.setAttribute('stroke', 'currentColor');
    v.setAttribute('stroke-width', '1.1');
    v.setAttribute('stroke-linecap', 'round');
    v.setAttribute('opacity', '0.3');
    g.appendChild(v);
    /* Speckles down the throat of each tepal. This is the detail that stops it
       reading as a generic six-pointed flower — a lily's markings sit low on
       the tepal and thin out toward the tip. */
    [[-2.6, 9, 1.15], [2.4, 12.5, 1], [-3.4, 16, 1.1],
     [3.2, 19.5, 0.95], [-2.2, 23, 0.85], [2.6, 26, 0.7]].forEach(([sx, sy, sr]) => {
      const d = document.createElementNS(SVGNS, 'circle');
      d.setAttribute('cx', sx); d.setAttribute('cy', sy); d.setAttribute('r', sr);
      d.setAttribute('fill', 'var(--ember-deep)');
      d.setAttribute('opacity', '0.5');
      g.appendChild(d);
    });
    parent.appendChild(g);
    return p;
  });

  // scaled to fill the -100..100 viewBox the way the old ring of petals did
  const outerPetals = mk(outer, LILY_OUTER, 2.05);
  const innerPetals = mk(inner, LILY_INNER, 1.72);

  /* The stamens. A lily without them reads as a generic star, so these are not
     decoration — they are the thing that names the flower. Six filaments, each
     curving out to an anther, reaching a little past halfway up the tepals. */
  let stamens = $('.hf-stamens', svg);
  if (!stamens) {
    stamens = document.createElementNS(SVGNS, 'g');
    stamens.setAttribute('class', 'hf-stamens');
    svg.insertBefore(stamens, $('.hf-core', svg));
  }
  stamens.innerHTML = '';
  /* Two groups per stamen, not one. The outer carries the angle as a transform
     *attribute*; the inner is what the intro animates. anime writes transforms
     as an inline style and inline style beats a presentation attribute, so
     animating the angled group directly collapsed all six onto rotate(0) — they
     stacked on top of each other and disappeared behind the tepals. Exactly the
     trap documented for the stage icons. */
  const anthers = LILY_STAMENS.map(a => {
    const anchor = document.createElementNS(SVGNS, 'g');
    anchor.setAttribute('transform', `rotate(${a})`);
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'hf-stamen');
    /* Reaching about two thirds of the way up the tepals. At the first
       attempt these stopped short and sat in the shadow of the petals, which
       made the whole thing read as a plain six-pointed star — the filaments
       have to clear the throat and the anthers have to be dark enough to
       count as their own shape. */
    const fil = document.createElementNS(SVGNS, 'path');
    fil.setAttribute('d', 'M0 0 C 5 17, 9 35, 13 51');
    fil.setAttribute('fill', 'none');
    /* Pale, not dark. A deep filament over a deep tepal disappeared, which
       left the anthers looking like loose seeds floating over the flower
       rather than the tips of something. Peach reads as a fine thread against
       the ember of the petals, which is what a lily's filaments look like. */
    fil.setAttribute('stroke', 'var(--peach)');
    fil.setAttribute('stroke-width', '2');
    fil.setAttribute('stroke-linecap', 'round');
    fil.setAttribute('opacity', '0.78');
    g.appendChild(fil);
    const an = document.createElementNS(SVGNS, 'ellipse');
    an.setAttribute('cx', '13.6'); an.setAttribute('cy', '53');
    an.setAttribute('rx', '4.3'); an.setAttribute('ry', '7.8');
    an.setAttribute('transform', 'rotate(26 13.6 53)');
    an.setAttribute('fill', 'var(--ember-deep)');
    g.appendChild(an);
    anchor.appendChild(g);
    stamens.appendChild(anchor);
    return g;
  });

  if (REDUCE) return { outerPetals, innerPetals, anthers };

  /* Put every part into its opening state before the timeline runs.

     anime only applies a tween's from-value when that tween starts, and these
     start at 200, 480, 700 and 900ms. Nothing in the CSS hides them in the
     meantime, so the finished flower painted first and then pieces snapped
     away to grow back — the flower appeared half-built before it had begun. */
  utils.set([...outerPetals, ...innerPetals], { scale: 0, opacity: 0 });
  utils.set(outerPetals, { rotate: -40 });
  utils.set(innerPetals, { rotate: 46 });
  utils.set(anthers, { scale: 0, opacity: 0, rotate: -16 });
  utils.set('.hf-core', { scale: 0 });
  utils.set('.hf-glow', { opacity: 0, scale: 0.7 });

  // opening bloom on load
  const tl = createTimeline();
  tl.add(outerPetals, {
    scale: [0, 1], rotate: [-40, 0], opacity: [0, 1],
    duration: 900, delay: stagger(70),
    ease: spring({ stiffness: 92, damping: 13 })
  }, 200);
  tl.add(innerPetals, {
    scale: [0, 1], rotate: [46, 0], opacity: [0, 1],
    duration: 750, delay: stagger(55),
    ease: spring({ stiffness: 110, damping: 14 })
  }, 480);
  // the stamens reach out after the tepals have opened enough to show them
  tl.add(anthers, {
    scale: [0, 1], rotate: [-16, 0], opacity: [0, 1],
    duration: 820, delay: stagger(48),
    ease: spring({ stiffness: 104, damping: 13 })
  }, 700);
  tl.add('.hf-core', { scale: [0, 1], duration: 700, ease: 'outElastic(1, .45)' }, 900);
  tl.add('.hf-glow', { opacity: [0, 1], scale: [0.7, 1], duration: 1200, ease: 'outQuad' }, 500);

  // idle breathing — each ring on its own clock so nothing pulses in lockstep
  outer.classList.add('hf-breathe');
  outer.style.setProperty('--from', '-3.2deg');
  outer.style.setProperty('--to', '3.2deg');
  outer.style.setProperty('--dur', '7.2s');
  inner.classList.add('hf-breathe');
  inner.style.setProperty('--from', '2.6deg');
  inner.style.setProperty('--to', '-2.6deg');
  inner.style.setProperty('--dur', '5.6s');
  const glowRing = $('.hf-glow', svg);
  if (glowRing) glowRing.classList.add('hf-glow-pulse');

  buildOrbitSeeds(svg);
  return { outerPetals, innerPetals, anthers };
}

/** three seeds riding an invisible orbit — svg.createMotionPath() */
function buildOrbitSeeds(svg) {
  if (REDUCE) return;
  const orbit = document.createElementNS(SVGNS, 'path');
  orbit.setAttribute('d',
    'M 0 -84 C 50 -84, 88 -46, 88 0 C 88 48, 48 86, 0 86 C -48 86, -88 48, -88 0 C -88 -46, -50 -84, 0 -84 Z');
  orbit.setAttribute('fill', 'none');
  orbit.setAttribute('stroke', 'none');
  svg.appendChild(orbit);

  let mp;
  try { mp = createMotionPath(orbit); } catch (err) { return; }
  const orbitAnims = [];

  for (let i = 0; i < 3; i++) {
    const g = document.createElementNS(SVGNS, 'g');
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', LEAF);
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('transform', 'scale(0.3)');
    p.setAttribute('opacity', '0.7');
    g.appendChild(p);
    g.style.color = 'var(--peach)';
    svg.appendChild(g);

    const a = animate(g, {
      translateX: mp.translateX,
      translateY: mp.translateY,
      rotate: mp.rotate,
      duration: 17000 + i * 2600,
      ease: 'linear',
      loop: true
    });
    a.seek(a.duration * (i / 3));
    orbitAnims.push(a);
  }

  /* These ride a motion path, which means a geometry query per element per
     frame. There is no reason to pay that once the hero has scrolled away. */
  const hero = $('.hero');
  if (hero) {
    new IntersectionObserver(([e]) => {
      orbitAnims.forEach(a => e.isIntersecting ? a.play() : a.pause());
    }, { threshold: 0 }).observe(hero);
  }
}

/* ================================================================= vine */

let vineState = null;
let vineRetry = null;
let vineState_io = null;

function buildVine() {
  if (vineState_io) { vineState_io.disconnect(); vineState_io = null; }
  if (vineState) {
    if (vineState.stop) vineState.stop();
    $$('.ignitable').forEach(n => n.classList.remove('ignitable', 'lit'));
    vineState.animations.forEach(a => a && a.revert && a.revert());
    if (vineState.observer && vineState.observer.revert) vineState.observer.revert();
  }
  vineSvg.innerHTML = '';

  const origin = $('#vine-origin');
  const nodes = $$('.vine-node');
  if (!origin || !nodes.length) return;

  // clientWidth, not scrollWidth: the overlays are absolutely positioned
  // children of main, so measuring scrollWidth would feed their own size
  // back in and the page could never shrink again.
  const W = main.clientWidth;
  const H = main.scrollHeight;
  /* Nothing sensible to draw yet (hidden container, print, pre-layout).
     A ResizeObserver on <main> normally rebuilds as soon as there are real
     dimensions, but it only fires on a *change* — if the size settles before
     boot runs, the observer sees nothing and the vine never appears at all.
     Retrying is the cheap guarantee. */
  if (W < 1 || H < 1) {
    clearTimeout(vineRetry);
    vineRetry = setTimeout(buildVine, 250);
    return;
  }
  clearTimeout(vineRetry);
  vineSvg.setAttribute('width', W);
  vineSvg.setAttribute('height', H);
  vineSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const mob = isMobile();
  const mr = main.getBoundingClientRect();
  const halfW = (mob ? 10 : 13) / 2 + 6;
  const anchors = [pointOf(origin)];   // the origin belongs to the flower

  /* Generous, because a Catmull-Rom spline overshoots its control points on
     sharp direction changes — clamping the points alone let the curve itself
     wander off the left edge. */
  /* Headroom for the spline, which bows past its own control points on the
     sharp reversals. At a windowed width the curve was reaching ~17px off the
     left edge and getting clipped flat. */
  /* The band the stem may weave in. It has to clear more than the stem's own
     width: a flower is centred *on* the centreline, and its petals reach ~38
     units times its scale, so an inset that only cleared the ribbon left the
     blooms hanging off the screen edge to be clipped in half. */
  const inset = mob ? 40
                    : Math.max(70, Math.round(W * 0.055));
  /* The full width, on both layouts.

     Three earlier rounds of this kept the phone stem in a narrow lane down the
     left, because every attempt to let it cross the page put it through the
     headline and the copy — the measurements are in the git history: 7.2%, then
     11.8% of the route sitting on words. The premise behind all of them was
     that the vine must never touch text, and on a 375px screen where the copy
     *is* the page that premise forces a corridor beside the content, which is
     what made the layout look like it was making room for a decoration.

     The premise was the thing to fix. The route now treats body copy as
     something it may pass behind and only headings as hard obstacles (see
     SOFT), so it has somewhere to go without the layout surrendering a quarter
     of its width. Measured after: 3.1% of the route over a heading, 14.4%
     behind body copy — against a desktop route, the one this is modelled on,
     that spends 18% of its length over text. */
  const RIGHT = W - inset;
  const clampX = x => Math.min(RIGHT, Math.max(inset, x));

  /* The tip rides a fixed line ~72% down the viewport, so the stem always
     grows just ahead of where you are reading and every bloom opens as its own
     section arrives. Declared up here because the final bloom's opening window
     is derived from it, several hundred lines before the scroll handler that
     spends it. */
  /* Raised from 0.72. The monotonic clamp on the y table always leaves the tip
     a little above the line it is aimed at — about 106px on an 800px window,
     even with the clamp lowered — because the table has to descend at least as
     fast as the path does. Rather than chase that to zero and reintroduce the
     racing it prevents, aim lower and let the bias land the tip where it was
     always meant to be. */
  const LEAD = 0.85;

  /* Clearance around a word. Raised on phones now the stem crosses the page
     instead of sitting in a lane: 6px was fine for something running down the
     margin, but a route that swings past text needs to keep its distance. */
  const PAD = mob ? 6 : 14;
  const GRAPHIC_PAD = mob ? 3 : 7;

  /* Where the words actually are.
     Measured from Range boxes, so these are real glyph extents rather than the
     full-width containers around them — which matters, because a container
     spans the page while its text may only fill half a line. */
  const OBSTACLE = 'h1, h2, h3, p, figcaption, .contact-mail, .chips li, .arc-n, .stage-num';
  const SKIP = '.tenet-glyph, .stage-icon, #arcSvg, #riffSvg';
  /* On a phone, body copy is something the stem may pass behind; a heading is
     not.

     The desktop layout has real negative space either side of a centred
     column, so "never cross a word" and "wander across the page" are
     compatible there. A 375px screen has no such space — the copy runs from
     96px to 353px of a 375px viewport, and the only wide gap at any height is
     the left gutter. Holding to the same rule is what pinned the phone stem to
     the left edge: with every waypoint slid into the one available channel the
     route spanned 54% of the width, and pulling it out only part of the way
     brought the jitter back, because neighbouring points disagreed about which
     side of a block to sit on.

     Letting it drift behind a paragraph resolves that without loosening
     anything: the vine draws under the text, and the desktop route the phone is
     copying already spends 18% of its length over a text block. Headings, the
     section numbers and the contact address stay hard obstacles, so nothing the
     eye lands on first is ever crossed. */
  const SOFT = mob ? 'p, figcaption, .chips li' : null;

  const obstacles = [];
  $$(OBSTACLE, main).forEach(e => {
    if (e.closest(SKIP)) return;
    if (SOFT && e.matches(SOFT)) return;
    const rng = document.createRange();
    rng.selectNodeContents(e);
    const r = rng.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    obstacles.push({
      top: r.top - mr.top, bot: r.bottom - mr.top,
      left: r.left - mr.left, right: r.right - mr.left
    });
  });

  /* Graphics are obstacles too now.

     They used to be left out on purpose: the idea was that the stem would
     shoulder them aside instead of routing around them. But the push is at most
     34px and an icon is 84px wide, so a stem heading through the middle of one
     came out the other side regardless — measured at 3.1% of the route sitting
     on top of a graphic, which is what makes the line art hard to read.

     The push still runs. With the route already giving them a berth it now
     reads as the graphic flinching as the stem goes by, which is what it was
     always meant to be, rather than as the only thing keeping them apart.

     Deliberately NOT including .hero-stage: #vine-origin lives inside it, so
     treating it as an obstacle would push the stem away from its own root. */
  /* #arcSvg was the one graphic left out of this list, and measuring the stem
     against the figures' actual drawn ink — rather than their bounding boxes —
     is what found it. Every graphic in the list overlaps 0% of its own ink on
     desktop; the arc, left out, overlapped 4.21% of its plants. Its box is
     `width: 100%` and mostly empty, which is why a bounding-box count made it
     look like the stem was passing through nothing. */
  const GRAPHIC = '.stage-icon, .tenet-glyph, #riffSvg, #arcSvg, .person-mark, .k-badge';
  $$(GRAPHIC, main).forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    obstacles.push({
      top: r.top - mr.top, bot: r.bottom - mr.top,
      left: r.left - mr.left, right: r.right - mr.left,
      /* Half the clearance the words get. A graphic only needs the stem off
         its face, whereas text needs breathing room to stay readable — and
         giving both the full margin squeezed the route so hard that it pushed
         the stem into text it had previously cleared. Measured: text crossings
         went 2.9% -> 3.7% at full clearance, and back down at half. */
      pad: GRAPHIC_PAD
    });
  });

  /**
   * The nearest x at this height that is not on top of a word.
   * Builds the free intervals across the page at y, then slides the requested x
   * into the closest one that can hold the stem. This is what stops the route
   * looking arbitrary: every waypoint is placed in real negative space.
   */

  /* `win` is a lookahead: a waypoint accounts for the text a little above and
     below it, not just the line it happens to sit on. Without it a point could
     sit in a clear gap between two paragraphs while the curve running through it
     sliced straight across both. Roughly half the spacing between waypoints. */
  function freeXAt(y, preferX, half, win = 80) {
    const blocked = [];
    for (const o of obstacles) {
      const pad = o.pad == null ? PAD : o.pad;
      if (y + win < o.top - pad || y - win > o.bot + pad) continue;
      const need = half + pad;
      blocked.push([o.left - need, o.right + need]);
    }
    if (!blocked.length) return clampX(preferX);

    blocked.sort((a, b) => a[0] - b[0]);
    const merged = [blocked[0].slice()];
    for (const b of blocked.slice(1)) {
      const last = merged[merged.length - 1];
      if (b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
      else merged.push(b.slice());
    }

    // wide enough to hold the stem, rather than twice the clearance
    const minWidth = half * 2 + 8;
    const free = [];
    let cursor = inset;
    for (const [b0, b1] of merged) {
      if (b0 - cursor > minWidth) free.push([cursor, b0]);
      cursor = Math.max(cursor, b1);
    }
    if (RIGHT - cursor > minWidth) free.push([cursor, RIGHT]);
    if (!free.length) return clampX(preferX);

    let best = free[0], bestD = Infinity;
    for (const [f0, f1] of free) {
      const d = preferX < f0 ? f0 - preferX : preferX > f1 ? preferX - f1 : 0;
      if (d < bestD) { bestD = d; best = [f0, f1]; }
    }
    return Math.min(best[1] - half, Math.max(best[0] + half, preferX));
  }


  /* Curls sit in the real gaps between blocks of content, measured rather than
     guessed at a segment midpoint. Each gap is a band the vine can fill
     completely without touching a word, and knowing its height lets the curl be
     sized to fit — which is also why every gap can carry one. */
  const bandOf = e => {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { top: r.top - mr.top, bot: r.bottom - mr.top };
  };
  // every content block marks itself with data-band, so adding a section to the
  // page is enough — the vine finds the new gaps on its own
  const bands = $$('[data-band]').map(e => bandOf(e)).filter(Boolean);

  /* Section waypoints, slid sideways into whatever negative space exists at
     their height. The hand-placed CSS positions are the intent; this is what
     keeps that intent off the words when a section's copy runs wide. */
  /* On a phone every one of these CSS positions resolves to the left gutter —
     measured: x = 31, 27, 33, 31, 25, 35 across the six sections. They are
     written as percentages of a column that is nearly the full width there, and
     the vine-node markers all sit at its left edge. That is why the phone stem
     read as clinging to the side: the spine was a straight left-hand line and
     everything else was a bulge off it, so the only way to get the route across
     the page was to make those bulges enormous, which is what made it thrash.

     Giving the spine itself two lanes and alternating between them means the
     route crosses the page once per section, over 1400px of scrolling — a
     lateral slope of about 0.15, gentler than anything the sways produce. The
     wandering then costs nothing in twitchiness, because it is the slowest
     movement in the path rather than the fastest. */
  const LANES = [inset + (RIGHT - inset) * 0.03, inset + (RIGHT - inset) * 0.86];

  /* The last flower has to be in view when the page stops.

     Its position comes from a percentage down the contact section, which is
     fine until that section is a different height — and on a phone it is a
     different height. At `top: 51%` the bloom landed 20px from the top of the
     screen once you reached the foot of the page, half of it behind the sticky
     header: the vine's whole payoff, parked off the top of the last thing you
     look at. Desktop happened to land at 40% down and looked deliberate.

     So it is a floor rather than a position. The bloom may sit wherever the
     section puts it, as long as that is at least this far into the final
     screenful — measured from the real scroll bottom, so it holds at any
     viewport and any amount of copy. Desktop already clears it and is left
     alone; the phone is pushed down about 200px. */
  const FINAL_DEPTH = 0.35;
  const docBottom = document.documentElement.scrollHeight - window.innerHeight;
  const finalFloor = docBottom + window.innerHeight * FINAL_DEPTH - (mr.top + window.scrollY);

  nodes.forEach((n, i) => {
    const p = pointOf(n);
    const x = mob ? LANES[i % 2] : p.x;
    /* Never past the bottom of the drawable area — the vine's viewBox stops at
       main's height, and the footer is outside it. */
    const y = n.hasAttribute('data-final')
      ? Math.min(Math.max(p.y, finalFloor), H - 80)
      : p.y;
    anchors.push({ x: freeXAt(y, x, halfW), y });
  });

  const gaps = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const top = bands[i].bot;
    const bot = bands[i + 1].top;
    if (bot - top > (mob ? 96 : 150)) gaps.push({ y: (top + bot) / 2, h: bot - top, used: false });
  }

  /* A loop every time there was room for one meant the stem spent the page
     coiling. They read as a flourish when they are rare and as a tic when they
     are not, so: a hard cap, and a long stretch of ordinary weaving required
     between them. */
  const MAX_CURLS = mob ? 2 : 3;
  const CURL_GAP_Y = mob ? 1600 : 1900;

  /* Smaller on the phone now that the spine travels on its own. When the
     anchors were all in the left gutter this had to be 215px — over half the
     screen — just to get the curve out into the page, and a swing that size
     inside a 375px viewport is a lurch. With the spine crossing between lanes
     the sways only need to add shape to that crossing. */
  const maxSwing = mob ? Math.min(W * 0.26, 98) : Math.min(W * 0.42, 560);
  const curls = [];

  const pts = [anchors[0]];
  let dir = mob ? -1 : 1;

  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    const dy = (b.y - a.y) || 1;

    // swings stay weighted toward the middle of the run, away from the anchors
    /* Placed by y, not by fraction of the segment.
       A loop fills a band of the gap, and a sway positioned at a fixed fraction
       could land *above* where the loop had already reached — the path then ran
       down past it and jumped back up, a 134-degree reversal. Working in y
       keeps the whole run monotonically descending.

       Working in y keeps the whole run monotonically descending. */
    const swayAt = (yy, sign, amp = 1) => {
      const t = utils.clamp((yy - a.y) / dy, 0, 1);
      // leans either way, like the desktop route
      const sgn = sign;
      const bx = a.x + (b.x - a.x) * t;
      pts.push({ x: freeXAt(yy, bx + maxSwing * amp * Math.sin(t * Math.PI) * sgn, halfW), y: yy });
    };
    const sway = (t, sign, amp = 1) => swayAt(a.y + dy * t, sign, amp);

    const lastCurlY = curls.length ? curls[curls.length - 1].y : -Infinity;
    const gap = curls.length >= MAX_CURLS ? null
      : gaps.find(g => !g.used && g.y > a.y && g.y < b.y
        && g.y - lastCurlY > CURL_GAP_Y
        && Math.min(mob ? 66 : 168, g.h * 0.36) >= (mob ? 40 : 56));
    if (gap) {
      gap.used = true;
      const t = (gap.y - a.y) / dy;
      const bx = a.x + (b.x - a.x) * t;
      const r = Math.min(mob ? 66 : 168, gap.h * 0.36);
      /* A wide, flat loop that drifts downward as it goes, rather than a spiral
         coiling in on itself. One crossing is what a vine actually does; two or
         three turns of shrinking radius read as a spring. The width comes from
         rx, the flatness from ry, and the drift is what keeps it an open loop
         instead of closing back on its own start. */
      const rx = Math.min(r * 1.5, (W - 2 * inset) / 2 - 4);
      const ry = r * 0.66;
      const driftY = r * 0.72;
      // clamp the centre, never the individual points: clamping the points
      // flattens one side against the page edge and leaves a cusp
      const cx = Math.min(W - inset - rx, Math.max(inset + rx, bx - dir * maxSwing * 0.3));
      // the band of y the loop actually occupies, so nothing is placed inside it
      const entryY = gap.y - driftY * 0.5;
      const exitY = gap.y + driftY * 0.5;
      if (entryY - a.y > 60) swayAt(a.y + (entryY - a.y) * 0.5, dir);
      /* A whole turn, starting on the horizon of the loop, so the tangent
         points straight down at both entry and exit — matching the direction
         the path is already travelling. A fractional turn exits at an arbitrary
         angle and the curve has to hairpin back toward the next anchor. */
      const start = dir > 0 ? Math.PI : 0;
      const steps = Math.min(140, Math.max(56, Math.round(rx * 0.6)));
      const spiral = [];
      for (let c = 0; c <= steps; c++) {
        const u = c / steps;
        const ang = start - dir * u * Math.PI * 2;
        spiral.push({
          x: cx + Math.cos(ang) * rx,
          y: gap.y + Math.sin(ang) * ry + (u - 0.5) * driftY
        });
      }

      /* Lead in and out along the spiral's own tangents.
         Catmull-Rom takes its tangent at a point from that point's neighbours,
         so the first spiral point was being aimed by whatever sway point
         happened to precede it — hundreds of pixels away and pointing nowhere
         near the curve. That is what produced a 175-degree cusp in a path whose
         average turn is under seven. These two points give the spline something
         collinear to enter and leave on. */
      const n = spiral.length;
      const lead = Math.max(22, r * 0.3);
      const aim = (from, to, dist) => {
        const dx = from.x - to.x, dy = from.y - to.y;
        const m = Math.hypot(dx, dy) || 1;
        return { x: from.x + (dx / m) * dist, y: from.y + (dy / m) * dist };
      };

      const lockIn = aim(spiral[0], spiral[1], lead); lockIn.lock = true;
      pts.push(lockIn);
      for (const sp of spiral) { sp.lock = true; pts.push(sp); }
      const lockOut = aim(spiral[n - 1], spiral[n - 2], lead); lockOut.lock = true;
      pts.push(lockOut);

      curls.push({ x: cx, y: gap.y, r });

      /* Two staged points on the way out, both below the loop. A single
         intermediate point left the spline one long jump to interpolate and it
         overshot past the page edge; gentle amplitudes because at full strength
         it threw the path to one side while the anchor sat far to the other. */
      const remain = b.y - exitY;
      if (remain > 60) {
        swayAt(exitY + remain * 0.42, -dir, 0.5);
        swayAt(exitY + remain * 0.78, -dir, 0.22);
      }
    } else {
      /* Alternating sway points down the run, so it reads as a wave rather than
         a bulge. Five of them on a desktop instead of three: with only three,
         a long run between anchors was one slow bow out and back, and the stem
         looked like it was avoiding the page rather than wandering across it.
         A phone keeps three: its runs are shorter, and what a reader feels is
         how often the stem turns per screen of scrolling, not per run. */
      if (mob) {
        /* Three long sweeps, the same count as desktop — this went 9, then 4,
           then here.

           The phone's page is taller than the desktop one (8554px against
           6833px) but its runs are shorter, so a per-run sway count is not
           comparable between the two: what a reader feels is how often the
           stem turns per screen of scrolling. At four sways that was 4.79
           direction changes per 1000px scrolled against desktop's 3.37 — half
           again as busy as the layout the phone is meant to echo. At three it
           matches, and each sweep gets a third more height to happen in, which
           is what makes it read as drifting across the page rather than
           weaving.

           Separate from how often the curve is pinned: the densify pass below
           places a point every 52px regardless, and that is what keeps the
           route off the words. Sway count sets the shape, pin density sets the
           safety. */
        sway(0.22, dir, 0.9);
        sway(0.5, -dir, 1);
        sway(0.78, dir, 0.9);
      } else {
        sway(0.26, dir);
        sway(0.5, -dir);
        sway(0.76, dir);           // alternate, so the run reads as a wave
      }
    }

    pts.push(b);
    dir = -dir;
  }

  /* Densify the straight runs.
     Pinning the waypoints into free space is not enough on its own: the spline
     interpolates between them and happily bows straight back across a
     paragraph. Adding a point every ~130px of descent — each one slid into the
     free channel at its own height — leaves the curve nowhere to wander. Loop
     geometry is exact and carries a lock, so it passes through untouched. */
  const woven = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    woven.push(a);
    const b = pts[i + 1];
    // only the loop's own interior is exempt; the runs leading into and out of
    // one still need pinning, and skipping those left most of the path free to
    // bow back across the text
    if (!b || (a.lock && b.lock)) continue;
    const dyy = b.y - a.y;
    /* Pinning density is not waviness. Each of these points is slid into free
       space at its own height without changing the shape's amplitude, so a
       denser pass makes the curve *less* likely to bow across a line, not more
       decorative. Measured on desktop: at 130 the three-sway route crossed text
       6.6% of the time, at 96 it is well under half that, and looks identical.

       The phone used to pin every 52px, on the theory that a narrow screen
       needs the curve held down harder. It does not, and the cost was the
       jitter: every pinned point is a small sideways correction, and at 52px
       there were nearly twice as many of them per run as on desktop — 41
       direction changes against desktop's 23, on a route two thirds the
       length. That is the twitchiness, and it came from the pinning, not from
       the sways. Both layouts now pin at the same rate, and the phone's route
       reverses about as often as the desktop one the user liked. */
    /* The phone pins tighter, and this is not the knob that caused the
       jitter — the opposite. Measured on a 375px viewport, direction changes
       per 1000px of route: 4.19 at a 52px pitch, 4.55 at 40px, 5.27 at 96px.
       Sparser pinning leaves longer unpinned spans, and a spline through
       widely spaced points that have each been nudged sideways bends harder
       between them. Text crossings follow the same curve (4.9% / 4.8% / 8.5%).
       52 is the floor of that basin. */
    const steps = Math.floor(Math.abs(dyy) / (mob ? 52 : 96));
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 1);
      const yy = a.y + dyy * t;
      woven.push({ x: freeXAt(yy, a.x + (b.x - a.x) * t, halfW), y: yy });
    }
  }

  /* Cap how fast the route may move sideways.

     This is what produced the jitter. Every point is slid into free space at
     its own height, and nothing stopped one landing far from the last: with a
     point every 96px of descent, a 300px sideways correction is a slope of
     over 3 — the curve lurches across, overshoots, and comes back. Dozens of
     those down a page is a zigzag, not a stem.

     A plant leans; it does not dart. Limiting dx to a fraction of dy makes
     every direction change take real vertical distance to happen, which is what
     reads as a wave rather than a twitch. The correction is shared between the
     two points rather than dumped on the later one, so a long run relaxes
     evenly instead of dragging its whole tail sideways; a few passes let a
     large excess spread further than its immediate neighbour.

     Loop geometry is exact and carries a lock, so it is never touched — the
     limiter only relaxes the route into and out of one. */
  const MAX_SLOPE = mob ? 0.38 : 0.78;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < woven.length; i++) {
      const a = woven[i - 1], b = woven[i];
      if (a.lock && b.lock) continue;
      const dy = Math.max(1, b.y - a.y);
      const lim = dy * MAX_SLOPE;
      const dx = b.x - a.x;
      if (Math.abs(dx) <= lim) continue;
      const excess = (Math.abs(dx) - lim) * Math.sign(dx);
      if (a.lock) { b.x -= excess; }
      else if (b.lock) { a.x += excess; }
      else { b.x -= excess * 0.5; a.x += excess * 0.5; }
    }

    /* Re-pin after each relaxation. Smoothing pulls points off the free
       channels freeXAt put them in, so on its own it trades jitter for text
       crossings. Alternating the two — relax, then slide each point back into
       whatever gap exists at its height — converges on a route that is both
       gentle and clear of the words, instead of one or the other. */
    for (let i = 1; i < woven.length - 1; i++) {
      if (woven[i].lock) continue;
      woven[i].x = freeXAt(woven[i].y, woven[i].x, halfW);
    }
  }

  /* Finish on smoothing, not on pinning. freeXAt snaps a point to the edge of
     a gap, and a snap is exactly the kind of sideways step this is meant to
     remove — ending on one undoes the work. Two final relaxations with no
     re-pin settle those last steps out. They move points by only a few pixels
     at this stage, so the route stays where the pinning put it. */
  /* One pass, at partial strength. A full relaxation here takes the worst
     snaps out but walks the whole route off its free channels with them —
     measured, that is the difference between 2.3% of the stem on text and
     5.3%. Correcting 55% of the excess keeps most of the pinning and still
     rounds off the steps that read as a twitch. */
  for (let i = 1; i < woven.length; i++) {
    const a = woven[i - 1], b = woven[i];
    if (a.lock && b.lock) continue;
    const dy = Math.max(1, b.y - a.y);
    const lim = dy * MAX_SLOPE;
    const dx = b.x - a.x;
    if (Math.abs(dx) <= lim) continue;
    const excess = (Math.abs(dx) - lim) * Math.sign(dx) * 0.55;
    if (a.lock) { b.x -= excess; }
    else if (b.lock) { a.x += excess; }
    else { b.x -= excess * 0.5; a.x += excess * 0.5; }
  }

  const d = fitPathX(splinePath(woven), inset, RIGHT);

  /* The centreline: the source of truth for every measurement, and never
     drawn. It used to be a detached <path> measured through the SVG geometry
     engine; it is now a flattened polyline with the same two methods, which is
     the same answer thousands of times faster. See makeFlatPath. */
  const centre = makeFlatPath(d);
  const total = centre.getTotalLength();

  // A gentler taper than a real stem would have: the leaves get bigger as
  // the vine descends, and a stem that thinned to nothing under them read
  // as broken rather than botanical.
  const wBase = mob ? 10 : 13;
  const wTip  = mob ? 4.5 : 5.5;

  // gradient in user space so offsets map straight onto <main>'s geometry
  tuneVineGradient(H);

  const RIB_N = mob ? 260 : 340;
  const rib = taperedRibbon(centre, total, wBase, wTip, RIB_N);

  /* The grown stem is a run of fixed chunks plus one short live piece at the
     tip.

     Rebuilding a single settled path meant handing the browser 36KB and 840
     fresh curves to tessellate roughly thirty times per scroll. These chunks
     are built once and then only switched on, which costs a visibility flip and
     invalidates nothing but that chunk's own box.

     Opacity lives on the group: chunks overlap by a sample so no seam can show,
     and per-path opacity would draw that overlap as a darker band. */
  const body = el('g', { opacity: 0.92 });
  const strokeW = mob ? 1.3 : 1.7;
  /* Chunk count is the phone's frame budget, not a cosmetic setting.

     Only two paths change while you scroll — the live tip and its edge — and
     they span from the last settled chunk boundary to the growing end. So the
     chunk size *is* the repaint rectangle. At 14 chunks that rectangle measured
     151 x 513px on a 375px screen: a quarter of the width and two thirds of the
     height of the viewport, re-rasterised every frame, on the device least able
     to afford it. The phone had fewer chunks than the desktop despite a longer
     path, which is backwards — a narrow screen turns the same arc length into a
     much taller slice.

     44 brings that rectangle down to roughly a third of the area, and shortens
     the path string rebuilt each frame with it. The cost is 60 more <path>
     nodes, which are built once, switched on with a visibility flip and never
     touched again — static raster against per-frame raster is the trade, and
     it is the right way round. */
  const CHUNKS = mob ? 68 : 56;
  const chunks = [];
  for (let i = 0; i < CHUNKS; i++) {
    const a = Math.round(rib.samples * i / CHUNKS);
    const b = Math.round(rib.samples * (i + 1) / CHUNKS);
    const from = Math.max(0, a - 1);
    chunks.push({
      a, b, on: false,
      ribbon: el('path', { d: ribbonRange(rib, from, b), fill: 'url(#vineGrad)', visibility: 'hidden' }, body),
      edge: el('path', {
        d: edgeRange(rib, from, b), fill: 'none', stroke: '#ffd9b3',
        'stroke-width': strokeW, 'stroke-linecap': 'round', opacity: 0.44, visibility: 'hidden'
      }, body)
    });
  }
  const ribbonTip = el('path', { d: '', fill: 'url(#vineGrad)' }, body);
  const edgeTip = el('path', {
    d: '', fill: 'none', stroke: '#ffd9b3',
    'stroke-width': strokeW, 'stroke-linecap': 'round', opacity: 0.44
  }, body);

  // ---- ornaments -------------------------------------------------------
  const items = [];
  const bloomFracs = [];

  nodes.forEach((node, i) => {
    const pt = anchors[i + 1];
    // some waypoints only steer the vine; six flowers on one stem is too many
    if (node.hasAttribute('data-nobloom')) return;
    const final = node.hasAttribute('data-final');
    const scale = (final ? (mob ? 1.12 : 1.5) : 0.72) * (mob ? 0.8 : 1);
    const frac = Math.min(0.94, fractionAt(centre, total, pt));
    bloomFracs.push(frac);
    items.push({ frac, final, at: { x: pt.x, y: pt.y }, bloom: makeBloom(pt.x, pt.y, scale, final) });
  });

  const near = (f, gap) => bloomFracs.some(b => Math.abs(b - f) < gap);

  // leaves, tangent-aligned, alternating sides
  const leafCount = mob ? 22 : 40;
  let side = 1;
  for (let j = 0; j < leafCount; j++) {
    const f = 0.045 + (0.9 * j / (leafCount - 1)) + (j % 3 - 1) * 0.011;
    if (near(f, 0.042)) { side = -side; continue; }
    const p = centre.getPointAtLength(total * f);
    const ang = tangentAngle(centre, total * f, total) + side * utils.random(44, 66) - 90;
    // depth ramp: the vine gets visibly lusher the further down it grows
    const depth = 0.72 + (mob ? 0.55 : 0.95) * f;
    // genuine jitter; the old (j % 3) pattern repeated visibly down the stem
    let sc = (mob ? 1.1 : 1.3) * depth * utils.random(0.82, 1.16, 3);
    let op = (0.6 + 0.24 * f) * utils.random(0.88, 1.08, 3);
    /* A leaf's tip lands at -30·sin(angle) on x, so this tells us which side it
       reaches into. On a phone the text column is close, so leaves growing
       toward it stay small and faint while the gutter side grows full size. */
    if (mob && Math.sin(ang * Math.PI / 180) < 0) { sc *= 0.42; op *= 0.62; }
    const g = el('g', { transform: `translate(${p.x} ${p.y}) rotate(${ang}) scale(${sc})` }, body);
    // leaf and veins share an inner group so they unfurl together
    const blade = el('g', {}, g);
    el('path', { d: LEAF, fill: 'var(--ember)', opacity: op }, blade);
    // only the larger leaves carry veins; on the small ones it is invisible
    // detail that still costs a node and a paint
    if (sc > (mob ? 1.05 : 1.25)) {
      el('path', {
        d: 'M0 3 L0 26 M0 10.5 L-3.6 15.5 M0 10.5 L3.6 15.5 M0 17 L-2.8 21 M0 17 L2.8 21',
        fill: 'none', stroke: 'var(--ember-deep)', 'stroke-width': 0.9,
        'stroke-linecap': 'round', opacity: op * 0.5
      }, blade);
    }
    items.push({ frac: f, at: { x: p.x, y: p.y }, pop: blade });
    side = -side;
  }

  // thorns tucked between the leaves
  const thornCount = mob ? 6 : 18;
  let tside = -1;
  for (let q = 0; q < thornCount; q++) {
    const f = 0.04 + (0.94 * q / (thornCount - 1)) + (q % 2) * 0.007;
    if (near(f, 0.032)) { tside = -tside; continue; }
    const p = centre.getPointAtLength(total * f);
    const ang = tangentAngle(centre, total * f, total) + (tside > 0 ? 0 : 180);
    const g = el('g', { transform: `translate(${p.x} ${p.y}) rotate(${ang}) scale(${mob ? 0.8 : 1.15})` }, body);
    const th = el('path', { d: THORN, fill: 'var(--ember-deep)', opacity: mob ? 0.5 : 0.75 }, g);
    items.push({ frac: f, at: { x: p.x, y: p.y }, pop: th });
    tside = -tside;
  }

  /* branch offshoots: short secondary stems, each with its own pair of leaves,
     so the vine reads as a plant rather than a single line */
  const branchCount = mob ? 4 : 9;
  let bside = 1;
  for (let b = 0; b < branchCount; b++) {
    const f = 0.15 + 0.66 * b / (branchCount - 1);
    if (near(f, 0.06)) { bside = -bside; continue; }
    const bp = centre.getPointAtLength(total * f);
    const bang = tangentAngle(centre, total * f, total) + bside * 56 - 90;
    // same side test as the leaves: a branch reaching for the text column
    // stays short, one heading into the gutter grows full length
    const bRight = mob && Math.sin(bang * Math.PI / 180) < 0;
    const len = (mob ? 30 : 52) * (0.8 + Math.random() * 0.45) * (bRight ? 0.5 : 1);
    const bg = el('g', { transform: `translate(${bp.x} ${bp.y}) rotate(${bang})` }, body);
    const stem = el('path', {
      d: `M0 0 C ${len * 0.12} ${len * 0.34}, ${len * 0.3} ${len * 0.62}, ${len * 0.14} ${len}`,
      fill: 'none', stroke: 'var(--ember)',
      'stroke-width': mob ? 2.6 : 3.4, 'stroke-linecap': 'round', opacity: 0.78
    }, bg);
    const bLeaves = [[-46, 0.62], [48, 0.52]].map(([la, ls]) => {
      const lg = el('g', {
        transform: `translate(${len * 0.14} ${len}) rotate(${la}) scale(${ls * (mob ? (bRight ? 0.55 : 0.95) : 1.25)})`
      }, bg);
      return el('path', { d: LEAF, fill: 'var(--ember)', opacity: bRight ? 0.5 : 0.72 }, lg);
    });
    items.push({ frac: f, at: { x: bp.x, y: bp.y }, branch: { stem, leaves: bLeaves } });
    bside = -bside;
  }

  // curling tendrils — these draw themselves with svg.createDrawable()
  const tendrilCount = mob ? 6 : 9;
  let dside = 1;
  for (let t = 0; t < tendrilCount; t++) {
    const f = 0.1 + 0.8 * t / (tendrilCount - 1);
    if (near(f, 0.05)) { dside = -dside; continue; }
    const p = centre.getPointAtLength(total * f);
    const ang = tangentAngle(centre, total * f, total) + dside * 70 - 90;
    const sc = (mob ? 1.0 : 1.15) * dside;
    const g = el('g', { transform: `translate(${p.x} ${p.y}) rotate(${ang}) scale(${sc})` }, body);
    const path = el('path', {
      d: TENDRIL, fill: 'none', stroke: 'var(--ember)',
      'stroke-width': mob ? 2.4 : 2.8, 'stroke-linecap': 'round', opacity: 0.7
    }, g);
    items.push({ frac: f, at: { x: p.x, y: p.y }, tendril: path });
    dside = -dside;
  }

  /* A field of motes lying off to either side of the stem. They are dark until
     the tip's light reaches them, then flare and settle to a low glow — so the
     area *around* the vine comes alive, not just the vine. */
  const moteCount = mob ? 20 : 44;
  for (let i = 0; i < moteCount; i++) {
    const mf = utils.clamp(0.03 + 0.94 * (i / (moteCount - 1)) + (i % 5 - 2) * 0.004, 0, 0.99);
    const mp = centre.getPointAtLength(total * mf);
    const nrm = (tangentAngle(centre, total * mf, total) + 90) * Math.PI / 180;
    const off = (mob ? utils.random(18, 66) : utils.random(28, 126)) * (i % 2 ? 1 : -1);
    const mg = el('g', {
      transform: `translate(${clampX(mp.x + Math.cos(nrm) * off).toFixed(1)} ${(mp.y + Math.sin(nrm) * off).toFixed(1)})`
    }, body);
    items.push({
      frac: mf,
      at: { x: mp.x, y: mp.y },
      mote: el('circle', { r: utils.random(1.3, 3.1, 2), fill: 'var(--ember-lit)', opacity: 0 }, mg)
    });
  }

  // a ring of light thrown outward as the stem winds through each curl
  curls.forEach(c => {
    const cg = el('g', { transform: `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})` }, body);
    items.push({
      frac: utils.clamp(fractionAt(centre, total, { x: c.x, y: c.y }), 0, 0.98),
      at: { x: c.x, y: c.y },
      radius: c.r,
      ring: [
        el('circle', { r: 4, fill: 'none', stroke: 'var(--ember-hot)', 'stroke-width': 2.4, opacity: 0 }, cg),
        el('circle', { r: 4, fill: 'none', stroke: 'var(--ember-lit)', 'stroke-width': 1.1, opacity: 0 }, cg)
      ]
    });
  });

  /* Growing tip. The soft halo is the CSS light pool rather than an SVG blur:
     a filter attached to something that moves every frame forces the browser to
     re-run the filter every frame, which is expensive on a phone. */
  const tip = el('g', { opacity: 0 });
  const tipPulse = el('g', {}, tip);
  el('circle', { r: mob ? 13 : 17, fill: 'var(--ember-hot)', opacity: 0.3 }, tipPulse);
  el('circle', { r: mob ? 7 : 9, fill: 'var(--ember-lit)', opacity: 0.75 }, tipPulse);
  el('circle', { r: mob ? 3.4 : 4.5, fill: '#fff4e8' }, tipPulse);

  // embers thrown off the growing point; children of the tip, so they inherit
  // its position and vanish with it
  const sparks = [];
  for (let i = 0; i < (mob ? 5 : 8); i++) {
    sparks.push(el('circle', { r: utils.random(1.1, 2.5, 2), fill: 'var(--ember-hot)', opacity: 0 }, tip));
  }

  // ---- static build ----------------------------------------------------
  if (REDUCE) {
    chunks.forEach(c => { c.ribbon.setAttribute('visibility', 'visible'); c.edge.setAttribute('visibility', 'visible'); });
    // the motes settle to a low glow rather than being absent entirely, so the
    // static render is the finished plant rather than a half-built one
    for (const it of items) if (it.mote) it.mote.setAttribute('opacity', '0.42');
    return;
  }

  // ---- animated build --------------------------------------------------
  /* Everything that keeps running goes in here too, not just the scrubbed
     timelines. A rebuild empties the SVG, and any loop left playing would go on
     animating detached nodes for the rest of the session — a leak that grows
     with every resize. */
  const animations = [];

  sparks.forEach((sp, i) => {
    sp.classList.add('vine-spark');
    sp.style.setProperty('--dx', `${utils.random(-18, 18)}px`);
    sp.style.setProperty('--dy', `${utils.random(-40, -10)}px`);
    sp.style.setProperty('--dur', `${(1.15 + i * 0.14).toFixed(2)}s`);
    sp.style.setProperty('--delay', `${(-i * 0.18).toFixed(2)}s`);
  });

  let sparksIdle = false;
  const setSparks = on => {
    if (on === !sparksIdle) return;
    sparksIdle = !on;
    tip.classList.toggle('vine-idle', sparksIdle);
  };

  /* Graphics the stem shoulders aside as it passes. Uses the standalone
     `translate` property rather than `transform`, so it cannot collide with the
     reveal animations that write `transform` on these same elements. */
  const pushables = $$('[data-push]').map(node => {
    const r = node.getBoundingClientRect();
    return {
      node,
      x: r.left - mr.left + r.width / 2,
      y: r.top - mr.top + r.height / 2,
      at: 0
    };
  });

  // the tip breathes on an inner group, so the outer transform stays ours
  tipPulse.classList.add('tip-pulse');

  /* y → arc-length lookup.
     Scroll is linear in y; arc length is not. Wherever the stem meanders
     sideways it consumes length without descending, so driving growth by arc
     length let the tip drift away from what you are actually looking at and
     made blooms open early or late for their section. Everything below is
     keyed to y instead, and the table is clamped monotonic so it can be
     binary-searched. */
  /* Sampled from the ribbon's own points, not independently along the path.

     This is the bug that made the tip trail the page. `rib.C` is sampled by
     *curvature* — deliberately, so a curl gets many samples and a straight run
     few. This table used to be sampled at uniform *arc length*. renderVine then
     took a fraction from this table and used it to index rib.C, as though the
     two agreed. They only agree when the path is close to uniform; the wavier
     the stem, the further apart they drift. On the phone layout that reached
     924px — the growing end a screen above the line being read, settled, with
     no scrolling involved.

     Indexing both off the same samples makes them agree by construction, at
     any waviness. It also drops several hundred getPointAtLength calls from
     the build, since the points are already computed. */
  const YS_N = rib.samples;
  const raw = new Array(YS_N + 1);
  for (let i = 0; i <= YS_N; i++) raw[i] = rib.C[i].y;
  const yMin = raw[0];
  let yMax = yMin;
  for (let i = 1; i <= YS_N; i++) if (raw[i] > yMax) yMax = raw[i];

  /* A curl travels back upwards, so raw y is not monotonic and cannot be
     binary-searched. It has to be forced into a rising sequence, and *how* it
     is forced is what sets the growth speed.

     Apparent speed is arc drawn per pixel scrolled: ds/dy. Where the path
     descends normally the two move together and the stem grows at a steady
     rate. Where it does not — inside a loop, or on a stretch that is mostly
     travelling sideways — dy is near zero while there is still a whole circle
     of ribbon to lay down, and the stem bolts through it. That is the
     teleporting.

     Both previous attempts were the same shape and both failed: a single
     constant floor on dy per sample. Set high (0.85, 0.55) it does spread the
     loops, but it also drives the table down the page faster than the path
     descends *everywhere* — and since the whole table is then rescaled to end
     in the right place, the tip drifts off the line being read (measured at
     144px, then 924px on the phone). Set near zero (0.02) the tip tracks
     perfectly and the loops snap open in one scroll position.

     The floor is the wrong shape. A sample's share of the scroll should be
     proportional to how much ribbon it carries, not the same for all of them:
     dy_min = α·ds. On a vertical run ds ≈ dy, so with α below 1 the real path
     wins and the table is untouched — no drift, which is what the constant
     floor could never offer. Inside a loop ds is all there is, so the loop is
     handed scroll distance in proportion to its length, and ds/dy there is
     capped at 1/α. One rule, and it only binds where the stem was racing.

     α is then read off the path rather than guessed: it is set from the rate the
     stem draws at where it is simply descending, so the cap below is expressed
     as a multiple of the vine's own natural speed and means the same thing on
     any layout. */
  const seg = new Array(YS_N + 1);
  seg[0] = 0;
  for (let i = 1; i <= YS_N; i++) {
    const a = rib.C[i - 1], b = rib.C[i];
    seg[i] = Math.hypot(b.x - a.x, b.y - a.y);
  }

  const span = yMax - yMin;
  // keeps the sequence strictly increasing where a segment has no length at all
  const EPS = (span / YS_N) * 1e-3;

  /* The rate the stem draws at where the path simply descends — its natural
     speed, in ribbon-pixels per pixel scrolled. Taken over the samples that
     actually go downhill, so loops and sideways stretches (where dy is noise)
     cannot skew it. */
  const nat = [];
  for (let i = 1; i <= YS_N; i++) {
    const dy = raw[i] - raw[i - 1];
    if (dy > 0.5 && seg[i] > 0) nat.push(seg[i] / dy);
  }
  nat.sort((a, b) => a - b);
  const natRate = nat.length ? nat[nat.length >> 1] : 1;

  /* No stretch may draw more than RATE_CAP times that. Measured on the desktop
     layout, where the natural rate is 1.55 ribbon-px per px scrolled:

       cap   fastest stretch   tip lag
       none        71x           129px     <- what this used to do
        6x         4.4x          169px
        4x         2.9x          195px
        3x         2.0x          222px
        2x         1.0x          285px

     "None" is the old constant floor, and 71x is the teleporting: a loop is a
     circle of ribbon laid down over almost no vertical travel, so it emptied
     itself into a few pixels of scroll. Capping at 3x removes 97% of that spike
     and costs 93px of tip lag, which is a quarter of a screen and only happens
     while a loop is unwinding — the tip is back on the line as soon as the path
     is descending again. A 2x cap makes the speed literally constant, but then
     nothing anywhere follows the path's own descent and the lag is a third of a
     screen everywhere, not just at loops. */
  const RATE_CAP = 3;
  const alpha = 1 / (RATE_CAP * natRate);

  const ys = new Array(YS_N + 1);
  ys[0] = yMin;
  for (let i = 1; i <= YS_N; i++) {
    ys[i] = Math.max(ys[i - 1] + alpha * seg[i] + EPS, raw[i]);
  }

  /* The floor runs the table past the true bottom; the rescale takes that back
     out so the last sample still lands on the real end of the vine. */
  const grown = ys[YS_N] - yMin;
  if (grown > 0) {
    const k = span / grown;
    for (let i = 1; i <= YS_N; i++) ys[i] = yMin + (ys[i] - yMin) * k;
  }

  function fractionForY(y) {
    if (y <= ys[0]) return 0;
    if (y >= ys[YS_N]) return 1;
    let lo = 0, hi = YS_N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ys[mid] <= y) lo = mid; else hi = mid;
    }
    const span = ys[hi] - ys[lo] || 1;
    return (lo + (y - ys[lo]) / span) / YS_N;   // interpolated, so the tip glides
  }

  const mRect = main.getBoundingClientRect();
  const mainTop = mRect.top + window.scrollY;
  const lightEl = $('#vineLight');

  const lit = $$(IGNITE).map(node => {
    const r = node.getBoundingClientRect();
    const y = r.top - mRect.top + r.height * 0.5;
    node.classList.add('ignitable');
    node.classList.remove('lit');
    // lead the element slightly so it wakes as the light arrives, not after
    return { node, y: y - 40, on: false };   // a little lead, so it wakes as the light arrives
  });

  /* Every ornament is *scrubbed*, never played.
     Playing and reversing carries hidden state: reverse() flips a tickable's
     direction permanently, so after scrolling up and back down a later play()
     resumes backwards and closes a bloom instead of opening it — and once a
     timeline has completed, flipping it back does nothing at all. That is what
     made flowers appear and vanish at seemingly random points on the page.
     Mapping scroll position straight onto each timeline's own progress has no
     state to desync, and is exactly reversible. */
  items.forEach(it => {
    let tl = null;
    if (it.bloom) {
      tl = it.bloom.tl;

    } else if (it.tendril) {
      let dr = null;
      try { dr = createDrawable(it.tendril, 0, 0)[0]; } catch (err) { /* noop */ }
      if (dr) tl = animate(dr, { draw: '0 1', duration: 800, ease: 'outQuad', autoplay: false });
    } else if (it.mote) {
      utils.set(it.mote, { scale: 0, opacity: 0 });
      tl = animate(it.mote, {
        scale: [{ to: 2, duration: 260 }, { to: 1, duration: 720 }],
        opacity: [{ to: 0.95, duration: 220 }, { to: 0.42, duration: 820 }],
        duration: 1000, ease: 'outQuad', autoplay: false
      });
    } else if (it.ring) {
      const rtl = createTimeline({ autoplay: false });
      rtl.add(it.ring[0], {
        r: [it.radius * 0.18, it.radius * 1.85],
        opacity: [{ to: 0.7, duration: 220 }, { to: 0, duration: 950 }],
        duration: 1170, ease: 'outQuad'
      }, 0);
      rtl.add(it.ring[1], {
        r: [it.radius * 0.18, it.radius * 2.45],
        opacity: [{ to: 0.45, duration: 260 }, { to: 0, duration: 1000 }],
        duration: 1260, ease: 'outQuad'
      }, 140);
      tl = rtl;
    } else if (it.branch) {
      // the offshoot draws itself, then unfurls its pair of leaves
      const btl = createTimeline({ autoplay: false });
      let bdr = null;
      try { bdr = createDrawable(it.branch.stem, 0, 0)[0]; } catch (err) { /* noop */ }
      if (bdr) btl.add(bdr, { draw: '0 1', duration: 640, ease: 'outQuad' }, 0);
      utils.set(it.branch.leaves, { scale: 0 });
      btl.add(it.branch.leaves, {
        scale: [0, 1], rotate: [-30, 0],
        duration: 660, delay: stagger(100),
        ease: spring({ stiffness: 110, damping: 12 })
      }, 360);
      tl = btl;
    } else {
      // the mask used to keep these hidden until the stem reached them; with
      // the mask gone their closed state has to be set explicitly
      utils.set(it.pop, { scale: 0 });
      tl = animate(it.pop, {
        scale: [0, 1], duration: 620,
        ease: spring({ stiffness: 120, damping: 12 }),
        autoplay: false
      });
    }
    it.tl = tl;
    // how much scroll the ornament takes to open, as a fraction of the stem
    /* Everything is keyed to y, in pixels of scroll. Path fraction is useless
       as a clock here: a curl packs enormous path length into a few vertical
       pixels, so a bloom sitting beside one unfurled over about 40px of
       scrolling — a pop rather than an opening — while the same fraction on a
       straight run took ten times as long. */
    /* Found by its nearest ribbon sample rather than by scaling an
       arc-length fraction, for the same reason as above: `frac` is a fraction
       of length, and this table is indexed by curvature-weighted sample. */
    let bi = 0, bd = Infinity;
    if (it.at) {
      for (let s = 0; s <= rib.samples; s++) {
        const d = (rib.C[s].x - it.at.x) ** 2 + (rib.C[s].y - it.at.y) ** 2;
        if (d < bd) { bd = d; bi = s; }
      }
    } else {
      bi = utils.clamp(Math.round(it.frac * YS_N), 0, YS_N);
    }
    it.y = ys[bi];
    /* A bloom's petals settle within roughly the first quarter of its
       timeline — the springs stretch the tween durations well past their
       nominal values, and the pollen burst and shed petals trail after. So the
       window has to be wide enough for that opening quarter to read as an
       unfurl; the tail then plays out as you continue past the flower. */
    /* The last flower keeps the same slow unfurl as the others — it just
       cannot have more of one than there is page left to scroll.

       A bloom opens over pxSpan of travel after the tip reaches it, and travel
       stops at the foot of the page. With a flat 1150 the last flower needed
       more scroll than remained, so it froze part-open and finished, if at all,
       behind the sticky header. Sizing it from the room actually left means it
       unfurls at the same pace and is fully open before you run out of page.
       The 0.7 leaves the tail of that travel as margin, so it completes with
       room to spare rather than exactly on the last pixel. */
    const curYMax = (document.documentElement.scrollHeight - window.innerHeight)
                  + window.innerHeight * LEAD - mainTop;
    const roomToEnd = curYMax - it.y;

    it.pxSpan = it.bloom
      ? (it.final
          ? Math.round(utils.clamp(roomToEnd * 0.7, 300, mob ? 1400 : 1150))
          : (mob ? 1400 : 1150))
      : it.ring ? 340
      : it.branch ? 240
      : it.mote ? 170
      : 150;
    it.last = -1;
    if (tl) animations.push(tl);
  });

  /* Park the CSS loops on anything that is not near the viewport. A keyframe
     step on a bloom halfway down the page still dirties the SVG it belongs to,
     and there are five of them plus their shed petals. */
  if (!REDUCE && 'IntersectionObserver' in window) {
    const idleIO = new IntersectionObserver(entries => {
      entries.forEach(e => e.target.classList.toggle('vine-idle', !e.isIntersecting));
    }, { rootMargin: '260px 0px 260px 0px' });
    items.forEach(it => { if (it.bloom) { it.bloom.group.classList.add('vine-idle'); idleIO.observe(it.bloom.group); } });
    vineState_io = idleIO;
  }

  const navBar = $('#navProgress');

  let targetY = 0, curY = 0, lastK = -1, liveFrom = 0;
  let lightScale = 1, prevY = 0;

  function renderVine(y) {
    const p = fractionForY(y);
    const fi = utils.clamp(p * rib.samples, 0, rib.samples);

    /* Where the tip actually is, interpolated from the samples taken at build
       time and never queried from the path. getPointAtLength on this centreline
       costs 1.7ms on its own, and calling it right after writing path data
       forced a full geometry flush of a 700-node SVG on every frame.

       Computed up here because the ribbon needs it too -- the growing end and
       the marker are now drawn from the same number, so they cannot disagree. */
    const i0 = Math.min(rib.samples - 1, Math.max(0, Math.floor(fi)));
    const ft = fi - i0;
    const a0 = rib.C[i0], a1 = rib.C[i0 + 1];
    const pt = { x: a0.x + (a1.x - a0.x) * ft, y: a0.y + (a1.y - a0.y) * ft };

    // chunk boundaries are whole samples, so this one stays rounded
    const k = Math.max(1, Math.min(rib.samples, Math.round(fi)));
    if (k !== lastK) {
      lastK = k;
      let live = 0;
      for (const c of chunks) {
        const on = k >= c.b;
        if (on !== c.on) {
          c.on = on;
          const v = on ? 'visible' : 'hidden';
          c.ribbon.setAttribute('visibility', v);
          c.edge.setAttribute('visibility', v);
        }
        if (on) live = c.b;
      }
      liveFrom = Math.max(0, live - 1);
    }

    /* Rewritten every frame rather than only on whole-sample crossings. It
       spans one chunk at most -- about 900 characters -- so the cost is string
       building, and a tip that glides is the entire point. */
    ribbonTip.setAttribute('d', ribbonRangeTip(rib, liveFrom, fi, pt));
    edgeTip.setAttribute('d', edgeRangeTip(rib, liveFrom, fi, pt));

    /* Ornaments that are fully closed or fully open have nothing to do, so
       only the two or three currently under the tip actually re-render. */
    for (const it of items) {
      if (!it.tl) continue;
      const local = utils.clamp((y - it.y) / it.pxSpan, 0, 1);
      if (local !== it.last) {
        it.last = local;
        it.tl.seek(it.tl.duration * local);
        // a shut flower sheds nothing, so its drift loops stay parked

      }
    }
    for (const g of lit) {
      if (!g.on && y >= g.y) { g.on = true; g.node.classList.add('lit'); }
      else if (g.on && y < g.y - 60) { g.on = false; g.node.classList.remove('lit'); }
    }

    if (p > 0.004 && p < 0.997) {
      tip.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
      tip.setAttribute('opacity', '1');
      setSparks(true);
      shoulder(pt);
      if (lightEl) {
        // the pool swells while you scroll fast and settles when you stop
        lightEl.style.transform = `translate3d(${pt.x}px, ${pt.y}px, 0) scale(${lightScale})`;
        /* Ease in and out at both ends instead of snapping -- and dim as the tip
           nears either side of the page. The pool is a fixed-size circle centred
           on the tip, so unlike the stem it cannot be kept on the page by moving
           guide points: at 380px across, the tip would have to stay 190px clear
           of both edges, which would leave the vine almost no room to weave.
           Fading it means the light is already faint by the time the page clips
           it, so there is no hard edge to see. */
        const edge = Math.min(pt.x, W - pt.x);
        // measured against the pool's *current* radius, not its resting one --
        // it swells with lightScale while you scroll fast, and a fixed 190 left
        // it at full brightness while hanging 110px off the page
        const half = 190 * lightScale;
        const room = Math.pow(utils.clamp(edge / half, 0, 1), 1.3);
        const ends = Math.min(utils.clamp(p / 0.05, 0, 1), utils.clamp((1 - p) / 0.05, 0, 1));
        lightEl.style.opacity = `${(ends * room).toFixed(3)}`;
      }
    } else {
      tip.setAttribute('opacity', '0');
      setSparks(false);
      shoulder(null);
      if (lightEl) lightEl.style.opacity = '0';
    }
  }

  /* Falls off over ~300px of vertical distance and eases toward its target, so
     a graphic drifts aside as the stem approaches and settles back once it has
     gone by, rather than snapping. */
  /* Reach widened deliberately. Now that the route avoids text it also tends to
     keep its distance from the graphics beside it, so a tight falloff almost
     never fired. */
  const PUSH_MAX = mob ? 16 : 34;
  const PUSH_RANGE = 400;
  const PUSH_REACH = 560;

  function shoulder(pt) {
    for (const g of pushables) {
      let want = 0;
      if (pt) {
        const dy = Math.abs(pt.y - g.y);
        if (dy < PUSH_RANGE) {
          const near = 1 - dy / PUSH_RANGE;
          const dx = g.x - pt.x;
          const side = dx === 0 ? 1 : Math.sign(dx);
          // only shoulder what the stem is actually near horizontally
          const close = Math.max(0, 1 - Math.abs(dx) / PUSH_REACH);
          want = side * PUSH_MAX * near * close;
        }
      }
      g.at += (want - g.at) * 0.18;
      if (Math.abs(g.at) < 0.05) g.at = 0;
      /* Only write when the value actually changes. This ran unconditionally
         on every pushable every frame, re-writing the same empty string for
         the ones nowhere near the stem — a style invalidation per element per
         frame in exchange for nothing. */
      const next = g.at ? `${g.at.toFixed(1)}px 0` : '';
      if (next !== g.css) {
        g.css = next;
        g.node.style.translate = next;
      }
    }
  }

  const smoother = createTimer({
    loop: true,
    duration: 1000,
    autoplay: false,
    onUpdate: self => {
      // exponential damping on real elapsed time, so the stem feels identical
      // at 60Hz and 120Hz and does not lurch after a dropped frame
      /* deltaTime can come back nonsensical — a huge negative value after the
         timer parks and resumes, or after the tab is backgrounded and the
         engine's clock goes stale. Unclamped, exp(-dt/TAU) overflows to
         Infinity and curP becomes NaN, which it can never recover from: the
         vine would freeze for the rest of the session. Anything outside one
         plausible frame falls back to 16ms. */
      const raw = self.deltaTime;
      const dt = raw > 0 && raw < 100 ? raw : 16;
      /* Exponential damping closes the gap at a rate proportional to the gap,
         so a hard fling leaves the tip 2000px behind and it then races down at
         ~21,000 px/s to catch up — roughly ten times a brisk scroll, which is
         what reads as "the stem goes too fast". Cap the growth rate at
         MAX_V px/ms (~2x a fast scroll). Normal scrolling never reaches the
         cap, because the gap stays small; only the fling case is tamed, and it
         costs about 200ms of extra catch-up to lose the whip. */
      const MAX_V = 6, TAU = 70;
      let step = (targetY - curY) * (1 - Math.exp(-dt / TAU));
      const lim = dt * MAX_V;
      if (step > lim) step = lim; else if (step < -lim) step = -lim;
      curY += step;
      if (!Number.isFinite(curY)) curY = targetY;   // belt and braces
      if (Math.abs(targetY - curY) < 1.2) {
        curY = targetY;
        renderVine(curY);
        smoother.pause();       // park until the next scroll update
        return;
      }
      renderVine(curY);
    }
  });

  /* LEAD is declared at the top of this function — the final bloom's window is
     sized from it, and that happens well before this point. */
  // cached: reading scrollHeight forces layout, and this must not do that on
  // every scroll event. Rebuilds refresh it.
  const docMax = document.documentElement.scrollHeight - window.innerHeight;

  /* Runs synchronously on scroll. Both reads here (scrollY, innerHeight) are
     layout-free, and all it does is set a target — the smoother does the
     actual rendering on its own clock, so there is nothing to coalesce. */
  function syncTarget() {
    targetY = window.scrollY + window.innerHeight * LEAD - mainTop;
    /* Eased, not taken raw. Reading a single frame's delta made the pool jump
       in size between events and flicker while scrolling. */
    const surge = Math.min(0.6, Math.abs(targetY - prevY) * 0.006);
    lightScale += (1 + surge - lightScale) * 0.25;
    prevY = targetY;
    if (navBar && docMax > 0) {
      navBar.style.transform = `scaleX(${utils.clamp(window.scrollY / docMax, 0, 1)})`;
    }
    smoother.play();
  }

  window.addEventListener('scroll', syncTarget, { passive: true });

  // land on the correct state immediately rather than growing in from nothing
  syncTarget();
  curY = targetY;
  renderVine(curY);

  vineState = {
    animations,
    stop: () => {
      smoother.pause();
      window.removeEventListener('scroll', syncTarget);
    }
  };
}

/** reposition the gradient's bright band over the dark Kríos section */
function tuneVineGradient(H) {
  const grad = $('#vineGrad');
  const dark = $('#krios');
  if (!grad || !dark || !H) return;

  grad.setAttribute('gradientUnits', 'userSpaceOnUse');
  grad.setAttribute('x1', 0); grad.setAttribute('y1', 0);
  grad.setAttribute('x2', 0); grad.setAttribute('y2', H);

  const r = dark.getBoundingClientRect();
  const m = main.getBoundingClientRect();
  const a = utils.clamp((r.top - m.top) / H, 0, 1);
  const b = utils.clamp((r.bottom - m.top) / H, 0, 1);

  const stops = [
    [0, '#CC4E00'],
    [Math.max(0, a - 0.02), '#CC4E00'],
    [a + 0.012, '#FF8A3D'],
    [(a + b) / 2, '#FFB877'],
    [Math.max(0, b - 0.012), '#FF8A3D'],
    [Math.min(1, b + 0.02), '#CC4E00'],
    [1, '#CC4E00']
  ];

  grad.innerHTML = '';
  stops.forEach(([off, col]) => {
    const s = document.createElementNS(SVGNS, 'stop');
    s.setAttribute('offset', utils.clamp(off, 0, 1));
    s.setAttribute('stop-color', col);
    grad.appendChild(s);
  });
}

/** a layered flower on the vine: calyx swells, petals burst, pollen scatters */
function makeBloom(x, y, scale, final) {
  /* Nothing here is symmetric on purpose. Each flower sits at its own slight
     angle, is a little bigger or smaller than its neighbours, and opens at its
     own tempo — four identical flowers on one stem read as clip art. */
  const nod = utils.random(-16, 16);
  const size = scale * utils.random(0.9, 1.1, 3);
  const tempo = utils.random(0.82, 1.24, 3);
  const g = el('g', { transform: `translate(${x} ${y}) rotate(${nod.toFixed(1)}) scale(${size.toFixed(3)})` });

  const glow = el('circle', { r: 52, fill: 'url(#bloomGlow)', opacity: 0 }, g);

  // calyx: three sepals that swell first, so the flower emerges from a bud
  // rather than simply appearing
  const sepals = [0, 120, 240].map(a => {
    const r = el('g', {
      transform: `rotate(${(a + utils.random(-12, 12)).toFixed(1)}) scale(${(0.62 * utils.random(0.85, 1.15, 3)).toFixed(3)})`
    }, g);
    return el('path', { d: LEAF, fill: 'var(--ember-deep)', opacity: 0.9 }, r);
  });

  const sway = el('g', {}, g);

  const outer = OUTER_ANGLES.map(a => {
    const r = el('g', {
      transform: `rotate(${(a + utils.random(-8, 8)).toFixed(1)}) scale(${utils.random(0.88, 1.12, 3).toFixed(3)})`
    }, sway);
    const p = el('path', { d: PETAL, fill: 'var(--ember)', opacity: 0.95 }, r);
    // a crease down each petal, so they read as folded rather than flat
    el('path', {
      d: 'M0 4 L0 32', fill: 'none', stroke: 'var(--ember-deep)',
      'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.4
    }, r);
    return p;
  });
  const inner = INNER_ANGLES.map(a => {
    const r = el('g', {
      transform: `rotate(${(a + utils.random(-9, 9)).toFixed(1)}) scale(${(0.55 * utils.random(0.86, 1.14, 3)).toFixed(3)})`
    }, sway);
    return el('path', { d: PETAL, fill: 'var(--ember-deep)' }, r);
  });

  // stamens around the centre
  const core = el('circle', { r: 6, fill: 'var(--peach)' }, sway);
  const stamens = [0, 60, 120, 180, 240, 300].map(a => {
    const r = el('g', { transform: `rotate(${a})` }, sway);
    const s = el('g', {}, r);
    el('path', { d: 'M0 0 L0 11', fill: 'none', stroke: 'var(--peach)', 'stroke-width': 1.1, opacity: 0.85 }, s);
    el('circle', { cy: 12, r: 1.9, fill: '#fff1df' }, s);
    return s;
  });

  const motes = [];
  for (let i = 0; i < 8; i++) {
    motes.push(el('circle', { r: 2.2, fill: 'var(--peach)', opacity: 0, cx: 0, cy: 0 }, g));
  }

  /* Petals that have let go and are drifting down. The drift itself is a
     continuous loop (cheap, four elements), while whether it is visible at all
     is scrubbed with the bloom — so it never plays for a closed flower. */
  const drift = el('g', { opacity: 0 }, g);
  const driftPetals = [];
  for (let i = 0, n = isMobile() ? 3 : 4; i < n; i++) {
    const d = el('g', { transform: `translate(${utils.random(-16, 16)} 0)` }, drift);
    driftPetals.push(el('path', {
      d: PETAL, fill: 'var(--ember)', opacity: 0.7,
      transform: `scale(${utils.random(0.22, 0.36, 3)})`
    }, d));
  }

  if (REDUCE) return { group: g, tl: { play() {}, reverse() {} } };

  /* Explicitly closed. The stem used to be revealed with a mask that also hid
     everything on it, so an unplayed bloom was invisible for free; without the
     mask a paused timeline would otherwise render its petals fully open until
     the moment it first plays — which is exactly the "flowers appearing at
     random" symptom. */
  utils.set([...outer, ...inner, ...sepals, ...stamens, core], { scale: 0 });

  const tl = createTimeline({ autoplay: false });

  // 1. the bud swells
  tl.add(sepals, {
    scale: [0, 1], rotate: [-18, 0],
    duration: 520 * tempo, delay: stagger(70 * tempo),
    ease: spring({ stiffness: 120, damping: 13 })
  }, 0);
  // 2. petals burst out of it
  tl.add(outer, {
    scale: [0, 1], rotate: [-34, 0],
    duration: 820 * tempo, delay: stagger(60 * tempo),
    ease: spring({ stiffness: 88, damping: 12 })
  }, 300 * tempo);
  tl.add(inner, {
    scale: [0, 1], rotate: [40, 0],
    duration: 700 * tempo, delay: stagger(48 * tempo),
    ease: spring({ stiffness: 105, damping: 13 })
  }, 560 * tempo);
  // 3. the centre fills in
  tl.add(core, { scale: [0, 1], duration: 520 * tempo, ease: 'outBack(2.4)' }, 760 * tempo);
  tl.add(stamens, {
    scale: [0, 1], rotate: [-40, 0],
    duration: 620, delay: stagger(34),
    ease: spring({ stiffness: 130, damping: 11 })
  }, 820);
  tl.add(glow, { opacity: [0, final ? 0.9 : 0.55], duration: 900, ease: 'outQuad' }, 600);
  // 4. pollen scatters
  tl.add(motes, {
    translateX: () => utils.random(-46, 46),
    translateY: () => utils.random(-52, -14),
    opacity: [{ to: 0.85, duration: 180 }, { to: 0, duration: 900 }],
    scale: [0.4, 1],
    duration: 1080,
    delay: stagger(38),
    ease: 'outQuad'
  }, 720);
  tl.add(drift, { opacity: [0, 1], duration: 500, ease: 'outQuad' }, 1000);

  // continuous sway, desynchronised — CSS, so it costs the main thread nothing
  sway.classList.add('vine-sway');
  sway.style.setProperty('--dur', `${(3.6 + Math.random() * 1.8).toFixed(2)}s`);
  sway.style.setProperty('--delay', `${(-Math.random() * 4).toFixed(2)}s`);

  /* Shed petals drift on their own clock; the group's opacity is scrubbed by
     the timeline above, so a shut flower sheds nothing regardless. */
  driftPetals.forEach((pl, i) => {
    const holder = pl.parentElement;
    holder.classList.add('vine-shed');
    holder.style.setProperty('--dx', `${utils.random(-26, 26)}px`);
    holder.style.setProperty('--dy', `${90 + i * 14}px`);
    holder.style.setProperty('--rot', `${utils.random(-160, 160)}deg`);
    holder.style.setProperty('--dur', `${(3.4 + i * 0.7).toFixed(2)}s`);
    holder.style.setProperty('--delay', `${(-i * 0.9).toFixed(2)}s`);
  });

  return { group: g, tl, drift };
}

/* ========================================================== hero intro */

function heroIntro() {
  const kicker = $('.kicker');
  const titleParts = $$('.hero-title [data-split]').map(n => splitInto(n, 'chars'));
  const lede = $('.hero-lede');
  const ledeWords = lede ? splitInto(lede, 'words') : null;

  if (REDUCE) {
    utils.set(['.kicker', '.hero-actions', '.scroll-cue'], { opacity: 1 });
    titleParts.forEach(p => p && utils.set(p, { opacity: 1 }));
    if (ledeWords) utils.set(ledeWords, { opacity: 1 });
    return;
  }

  const tl = createTimeline({ defaults: { ease: 'out(3)' } });

  if (kicker) {
    tl.add(kicker, { opacity: [0, 1], translateY: [12, 0], duration: 700 }, 120);
  }

  titleParts.forEach((chars, i) => {
    if (!chars) return;
    tl.add(chars, {
      opacity: [0, 1],
      translateY: ['110%', '0%'],
      duration: 1000,
      delay: stagger(26),
      ease: spring({ stiffness: 74, damping: 15 })
    }, 220 + i * 130);
  });

  // the swash under "blooms." draws itself
  const swash = $('.swash path');
  if (swash) {
    let dr = null;
    try { dr = createDrawable(swash, 0, 0)[0]; } catch (err) { /* noop */ }
    if (dr) tl.add(dr, { draw: '0 1', duration: 900, ease: 'inOutQuad' }, 900);
    else utils.set(swash, { strokeDasharray: 'none', strokeDashoffset: 0 });
  }

  if (ledeWords) {
    tl.add(ledeWords, {
      opacity: [0, 1], translateY: [16, 0],
      duration: 760, delay: stagger(14)
    }, 780);
    utils.set(lede, { opacity: 1 });
  }

  tl.add('.hero-actions', { opacity: [0, 1], translateY: [18, 0], duration: 800 }, 1050);
  tl.add('.scroll-cue',   { opacity: [0, 1], duration: 700 }, 1300);

  // one-time light sweep across the headline once the chars have landed
  const title = $('.hero-title');
  if (title) sweepHeadline(title, 1250);

  // the kicker dot, scroll cue and aurora blobs all loop from CSS now
}

/** animates the ::after sweep via a CSS custom property on the headline */
function sweepHeadline(title, delay) {
  const obj = { t: 0 };
  animate(obj, {
    t: [0, 1],
    duration: 1100,
    delay,
    ease: 'inOutQuad',
    onUpdate: () => {
      title.style.setProperty('--sweep-x', `${-40 + obj.t * 180}%`);
      title.style.setProperty('--sweep-o', `${obj.t < 0.5 ? obj.t * 2 : (1 - obj.t) * 2}`);
    }
  });
}

/* ============================================================= reveals */

function initReveals() {
  const simple = $$('[data-reveal]');
  const splitTargets = $$('.section [data-split]');
  const contactMail = $('[data-chars]');

  if (REDUCE) {
    utils.set(simple, { opacity: 1 });
    splitTargets.forEach(n => utils.set(n, { opacity: 1 }));
    return;
  }

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      const t = e.target;

      if (t.hasAttribute('data-split')) {
        const chars = splitInto(t, 'chars');
        if (chars) {
          animate(chars, {
            opacity: [0, 1], translateY: ['100%', '0%'],
            duration: 900, delay: stagger(22),
            ease: spring({ stiffness: 80, damping: 15 })
          });
        }
      } else if (t.classList.contains('chips')) {
        // the chips flip up out of the dark ground
        animate(Array.from(t.children), {
          opacity: [0, 1], rotateX: [-90, 0], translateY: [22, 0],
          duration: 900, delay: stagger(110),
          ease: spring({ stiffness: 95, damping: 13 })
        });
      } else {
        animate(t, {
          opacity: [0, 1], translateY: [24, 0],
          duration: 850, ease: 'out(3)'
        });
      }
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

  simple.forEach(n => io.observe(n));
  splitTargets.forEach(n => io.observe(n));

  // contact address: per-char hover wave
  if (contactMail) {
    const chars = splitInto(contactMail, 'chars');
    if (chars) {
      const mailIO = new IntersectionObserver((entries, obs) => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          obs.unobserve(e.target);
          animate(chars, {
            opacity: [0, 1], translateY: [30, 0], rotate: [8, 0],
            duration: 900, delay: stagger(18),
            ease: spring({ stiffness: 90, damping: 14 })
          });
        });
      }, { threshold: 0.2 });
      mailIO.observe(contactMail);

      contactMail.addEventListener('pointerenter', () => {
        animate(chars, {
          translateY: [
            { to: -9, duration: 240 },
            { to: 0, duration: 520 }
          ],
          delay: stagger(22),
          ease: 'outQuad'
        });
      });
    }
  }
}

/** Kríos paragraph: words brighten as the block travels the viewport */
function initFeatureWords() {
  const p = $('[data-reveal-words]');
  if (!p) return;

  const words = splitInto(p, 'words');
  if (!words) { utils.set(p, { opacity: 1 }); return; }

  utils.set(p, { opacity: 1 });

  if (REDUCE) { utils.set(words, { opacity: 1 }); return; }

  utils.set(words, { opacity: 0.16 });

  const reveal = animate(words, {
    opacity: [0.16, 1],
    duration: 400,
    delay: stagger(60),
    ease: 'outQuad',
    autoplay: false
  });

  /* Scrubbed from a cached document offset rather than anime's onScroll.

     That observer re-read the paragraph's rect on every engine tick, for the
     whole session, at every scroll position — including while the page sat
     still at the top, nowhere near this section. A forced layout on this page
     costs about 22ms because of the vine's SVG, and this single observer was
     paying a slice of it 60 times a second. It was the largest cost on the
     page by a wide margin: 6.0ms per tick with nothing else running.

     Same span as before ('bottom top' -> 'top bottom'): 0 when the paragraph's
     top reaches the bottom of the viewport, 1 once its bottom clears the top. */
  let docY = 0, height = 0, vh = window.innerHeight, last = -1;

  const measure = () => {
    const r = p.getBoundingClientRect();
    docY = r.top + window.scrollY;
    height = r.height;
    vh = window.innerHeight;
  };

  const apply = () => {
    const span = vh + height;
    const raw = span > 0 ? (window.scrollY + vh - docY) / span : 0;
    const v = utils.clamp(utils.mapRange(raw, 0.08, 0.46, 0, 1), 0, 1);
    if (Math.abs(v - last) < 0.004) return;   // nothing changed: write nothing
    last = v;
    reveal.progress = v;
  };

  measure();
  apply();
  window.addEventListener('scroll', apply, { passive: true });
  window.addEventListener('resize', () => { measure(); apply(); });
}

/* ======================================================== stage panels */

/* One rhythm for all three panels.

   They used to be timed independently — 760/780ms here, 800/700/520 there,
   620/780/500 in the third, with start offsets of 380, 380 and 320. Played
   side by side that reads as three unrelated icons going off at once rather
   than as one sequence, which is what Plant -> Grow -> Bloom is meant to be.

   Now every panel plays the same four beats, and each starts CASCADE later
   than the one to its left. The ground beat is new: all three horizons draw
   at the same moment, which is what ties the row together visually. */
const STAGE_BEAT = { ground: 0, form: 240, detail: 560, accent: 900 };
const STAGE_CASCADE = 170;

function initStageIcons() {
  $$('.stage').forEach((stage, index) => {
    const kind = stage.dataset.stage;
    const svg = $('svg', stage);
    if (!svg) return;

    if (kind === 'bloom') {
      const holder = $('.mini-bloom', svg);
      OUTER_ANGLES.forEach(a => {
        /* Two groups, not one: the outer holds the fan angle as a transform
           *attribute*, the inner is what anime writes an inline `transform`
           style to. Inline style beats the attribute, so animating the outer
           group would flatten every petal onto the same angle at full size. */
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('transform', `rotate(${a}) scale(0.62)`);
        const inner = document.createElementNS(SVGNS, 'g');
        inner.setAttribute('class', 'mp');
        const p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('d', PETAL);
        p.setAttribute('fill', 'currentColor');
        inner.appendChild(p);
        g.appendChild(inner);
        holder.appendChild(g);
      });
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('r', '4');
      c.setAttribute('fill', 'var(--peach)');
      holder.appendChild(c);
    }

    if (REDUCE) return;

    /* Hidden up front, not at play() time, so nothing flashes before the
       panel is reached. The horizon is a straight line, so getTotalLength on
       it is trivial. */
    const soil = $('.soil', svg);
    let soilLen = 0, played = false;
    if (soil) {
      soilLen = soil.getTotalLength();
      soil.style.strokeDasharray = `${soilLen}`;
      soil.style.strokeDashoffset = `${soilLen}`;
      /* The horizon is structure, not decoration, so it must not depend on an
         animation running. If the panel has not played after a few seconds —
         an observer that never fires, a zero-height viewport, anything — put
         the line back. play() re-applies the dash, so a later reveal still
         draws properly. */
      setTimeout(() => {
        if (played) return;
        soil.style.strokeDasharray = '';
        soil.style.strokeDashoffset = '';
      }, 4000);
    }

    // per-panel replayable intro, fired on first view and on hover
    const play = (base = 0) => {
      const B = STAGE_BEAT;

      played = true;

      // beat 1 — the ground, identical in all three
      if (soil) {
        soil.style.strokeDasharray = `${soilLen}`;   // may have been cleared above
        animate(soil, {
          strokeDashoffset: [soilLen, 0],
          duration: 420, delay: base + B.ground, ease: 'outQuad'
        });
      }

      const draw = (sel, dur) => {
        const path = $(sel, svg);
        if (!path) return;
        let dr = null;
        try { dr = createDrawable(path, 0, 0)[0]; } catch (err) { /* noop */ }
        if (dr) animate(dr, { draw: '0 1', duration: dur, delay: base + B.form, ease: 'outQuad' });
      };

      if (kind === 'plant') {
        // beat 2 — the seed arrives, landing as the ripples break
        animate($('.seed-g', svg), {
          translateY: [-42, 0],
          duration: 720, delay: base + B.form,
          ease: spring({ stiffness: 120, damping: 12 })
        });
        // beat 3 — the impact
        animate($$('.ripple', svg), {
          opacity: [{ to: 0.7, duration: 150 }, { to: 0, duration: 560 }],
          scale: [0.5, 1.15],
          transformOrigin: '48px 78px',
          duration: 640, delay: stagger(120, { start: base + B.detail }),
          ease: 'outQuad'
        });
      }

      if (kind === 'grow') {
        // beat 2 — the stem draws up out of the ground
        draw('.sprout', 720);
        /* beat 3 — the leaves open, lower first. Scale goes on the inner group
           and opacity on the anchor: an inline transform would overwrite the
           anchor's translate attribute (see index.html). */
        animate($$('.lf-in', svg), {
          scale: [0, 1],
          duration: 640, delay: stagger(120, { start: base + B.detail }),
          ease: spring({ stiffness: 112, damping: 13 })
        });
        animate($$('.lf', svg), {
          opacity: [0, 0.75],
          duration: 460, delay: stagger(120, { start: base + B.detail }), ease: 'outQuad'
        });
      }

      if (kind === 'bloom') {
        draw('.sprout', 720);
        // beat 3 — the petals fan out of the stem's tip
        animate($$('.mini-bloom .mp', svg), {
          scale: [0, 1], rotate: [-30, 0],
          duration: 640, delay: stagger(70, { start: base + B.detail }),
          ease: spring({ stiffness: 112, damping: 13 })
        });
        // beat 4 — and the eye of it, last
        animate($('.mini-bloom circle', svg), {
          scale: [0, 1], duration: 460, delay: base + B.accent, ease: 'outBack(2.2)'
        });
      }
    };

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        obs.unobserve(e.target);
        stage.classList.add('is-in');       // draws the accent rule
        const base = index * STAGE_CASCADE;
        play(base);

        // the index counts up rather than simply being printed, on the same beat
        const num = $('.stage-num', stage);
        if (num) {
          const target = parseInt(num.textContent, 10);
          const box = { v: 0 };
          animate(box, {
            v: target, duration: 900, delay: base, ease: 'out(3)',
            onUpdate: () => { num.textContent = String(Math.round(box.v)).padStart(2, '0'); }
          });
        }
      });
    }, { threshold: 0.35 });
    io.observe(stage);

    stage.addEventListener('pointerenter', () => play(0));
  });
}

/* ====================================================== pointer effects */

/** 21st.dev-style spotlight: a soft radial glow tracking the pointer */
function initSpotlights() {
  if (REDUCE) return;
  $$('[data-spotlight]').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}

/** magnetic buttons — the element leans toward the cursor */
function initMagnetics() {
  if (REDUCE || matchMedia('(pointer: coarse)').matches) return;

  $$('[data-magnetic]').forEach(btn => {
    const strength = 0.32;
    let active = null;

    btn.addEventListener('pointermove', e => {
      const r = btn.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * strength;
      const dy = (e.clientY - (r.top + r.height / 2)) * strength;
      active = animate(btn, {
        translateX: dx, translateY: dy,
        duration: 500, ease: 'outQuad', composition: 'replace'
      });
    });

    btn.addEventListener('pointerleave', () => {
      animate(btn, {
        translateX: 0, translateY: 0,
        duration: 900,
        ease: spring({ stiffness: 120, damping: 11 }),
        composition: 'replace'
      });
    });
  });
}

/* ============================================================= marquee */

function initMarquee() {
  const row = $('#marqueeRow');
  if (!row) return;
  row.innerHTML += row.innerHTML;          // duplicate for a seamless wrap
  if (REDUCE) return;

  /* Handed to CSS on a phone.

     This is a 30-second loop that never ends, and driving it from here means
     anime writes a transform on the main thread on every frame of the whole
     session — plus a second timer, woken by its own scroll listener, to ease
     the speed back after a fling. On a desktop that is free. On a phone it is
     a permanent main-thread tenant competing with the vine for the same
     frames, to move a decorative ticker.

     The same animation as a CSS keyframe runs on the compositor and costs the
     main thread nothing at all. The scroll-reactive speed goes with it — that
     part cannot be done off-thread — which is the right thing to give up: it
     is a flourish nobody is looking at while they scroll past. */
  if (isMobile()) { row.classList.add('mq-auto'); return; }

  const half = row.scrollWidth / 2;
  const mq = animate(row, {
    translateX: [0, -half],
    duration: 30000,
    ease: 'linear',
    loop: true
  });

  /* The ticker takes its cue from the scroll: it speeds up in the direction
     you are travelling and eases back to its resting pace when you stop. */
  let lastY = window.scrollY, rate = 1;
  window.addEventListener('scroll', () => {
    const dy = window.scrollY - lastY;
    lastY = window.scrollY;
    rate = utils.clamp(1 + dy * 0.09, -4, 6);
    rateTimer.play();
  }, { passive: true });

  const rateTimer = createTimer({
    loop: true, duration: 1000,
    onUpdate: self => {
      const raw = self.deltaTime;
      const dt = raw > 0 && raw < 100 ? raw : 16;
      rate += (1 - rate) * (1 - Math.exp(-dt / 260));   // settle back to 1
      mq.playbackRate = rate;
      if (Math.abs(rate - 1) < 0.01) { rate = 1; mq.playbackRate = 1; rateTimer.pause(); }
    }
  });
}

/* ================================================================= nav */

function initNav() {
  const nav = $('#nav');
  const links = $$('.nav-links a');
  const darkZones = [$('#krios'), $('.footer')].filter(Boolean);

  // invert the nav while a dark band sits behind it
  let overlapping = 0;
  const navH = nav ? nav.offsetHeight : 72;
  const darkIO = new IntersectionObserver(entries => {
    entries.forEach(e => { overlapping += e.isIntersecting ? 1 : -1; });
    overlapping = Math.max(0, overlapping);
    if (nav) nav.classList.toggle('is-dark', overlapping > 0);
  }, { rootMargin: `0px 0px -${Math.max(0, window.innerHeight - navH - 2)}px 0px` });
  darkZones.forEach(z => darkIO.observe(z));

  // active link
  const sections = links
    .map(a => ({ a, sec: $(a.getAttribute('href')) }))
    .filter(x => x.sec);

  const activeIO = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const hit = sections.find(x => x.sec === e.target);
      if (hit && e.isIntersecting) {
        links.forEach(l => l.classList.remove('is-active'));
        hit.a.classList.add('is-active');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(x => activeIO.observe(x.sec));
}

/* ========================================================== particles */

/** ambient pollen over the bright half of the page */
function initPollen() {
  const cv = $('#pollen');
  if (!cv || REDUCE || isMobile()) return;   // also hidden in CSS on phones
  const ctx = cv.getContext('2d');
  let parts = [], raf = null, running = false, W = 0, H = 0;

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    // viewport-sized: the canvas is fixed now, so it is never page-tall
    W = document.documentElement.clientWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;   // CSS already sizes it 100%/100%
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = 56;
    parts = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 1 + Math.random() * 2.6,
      vx: (Math.random() - 0.5) * 0.16,
      vy: -0.08 - Math.random() * 0.22,
      a: 0.14 + Math.random() * 0.3,
      ph: Math.random() * Math.PI * 2
    }));
  }

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.x += p.vx + Math.sin((t / 2600) + p.ph) * 0.16;
      p.y += p.vy;
      if (p.y < -12) { p.y = H + 12; p.x = Math.random() * W; }
      if (p.x < -12) p.x = W + 12;
      if (p.x > W + 12) p.x = -12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(204, 78, 0, ${p.a})`;
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

  size();
  start();
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  return { size };
}

/** embers rising inside the dark Kríos band */
function initEmbers() {
  const cv = $('#embers');
  const host = $('#krios');
  if (!cv || !host || REDUCE) return;
  const ctx = cv.getContext('2d');
  let parts = [], raf = null, inView = false, W = 0, H = 0;

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = host.clientWidth; H = host.offsetHeight;
    cv.width = W * dpr; cv.height = H * dpr;   // CSS already sizes it 100%/100%
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = isMobile() ? 22 : 54;
    parts = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.7 + Math.random() * 1.9,
      vy: -0.16 - Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 0.2,
      a: 0.2 + Math.random() * 0.55,
      ph: Math.random() * Math.PI * 2
    }));
  }

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.y += p.vy;
      p.x += p.vx + Math.sin(t / 1800 + p.ph) * 0.22;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      const flicker = 0.65 + 0.35 * Math.sin(t / 320 + p.ph * 3);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 154, 68, ${p.a * flicker})`;
      ctx.fill();
    }
    if (inView) raf = requestAnimationFrame(frame);
  }

  size();
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (inView) raf = requestAnimationFrame(frame);
    else if (raf) cancelAnimationFrame(raf);
  }, { threshold: 0 }).observe(host);

  return { size };
}

/* ============================================================== graphics */

/** small SVG helper that writes into an arbitrary parent */
function sub(parent, tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent.appendChild(n);
  return n;
}

/* Line-art marks for the four tenets. Drawn from the same botanical vocabulary
   as the vine so they read as part of it rather than as stock icons. */
const GLYPHS = {
  close: p => {
    sub(p, 'circle', { cx: 32, cy: 34, r: 4.5, 'data-fill': '' });
    sub(p, 'path', { d: 'M32 20 A14 14 0 0 1 46 34', 'data-stroke': '' });
    sub(p, 'path', { d: 'M32 48 A14 14 0 0 1 18 34', 'data-stroke': '' });
    sub(p, 'path', { d: 'M32 10 A24 24 0 0 1 56 34', 'data-stroke': '', opacity: 0.45 });
    sub(p, 'path', { d: 'M32 58 A24 24 0 0 1 8 34', 'data-stroke': '', opacity: 0.45 });
  },
  earn: p => {
    sub(p, 'path', { d: 'M10 54 H54', 'data-stroke': '', opacity: 0.35 });
    sub(p, 'path', { d: 'M21 54 V42', 'data-stroke': '', opacity: 0.45 });
    sub(p, 'path', { d: 'M43 54 V45', 'data-stroke': '', opacity: 0.45 });
    sub(p, 'path', { d: 'M32 54 V24', 'data-stroke': '' });
    const f = sub(p, 'g', { transform: 'translate(32 18)' });
    [0, 72, 144, 216, 288].forEach(a2 =>
      sub(sub(f, 'g', { transform: `rotate(${a2}) scale(0.2)` }), 'path', { d: PETAL, 'data-fill': '' }));
  },
  own: p => {
    sub(p, 'path', {
      d: 'M32 11 C 49 11, 56 26, 48 39 C 41 51, 22 53, 14 41 C 6 29, 14 11, 32 11 Z',
      'data-stroke': ''
    });
    sub(sub(p, 'g', { transform: 'translate(44 18) rotate(38) scale(0.55)' }),
        'path', { d: LEAF, 'data-fill': '' });
  },
  horizon: p => {
    sub(p, 'path', { d: 'M7 50 H57', 'data-stroke': '', opacity: 0.3 });
    sub(p, 'path', { d: 'M7 42 C 22 30, 38 26, 57 16', 'data-stroke': '' });
    sub(p, 'circle', { cx: 53, cy: 18, r: 4, 'data-fill': '' });
  }
};

function buildGlyphs() {
  $$('.tenet-glyph svg').forEach(svg => {
    const make = GLYPHS[svg.dataset.glyph];
    if (make) make(svg);
  });
}

/**
 * The long-game diagram: one plant at each of four stages along a baseline that
 * stops short of the last, because the last one no longer needs it.
 */
function buildArc() {
  const svg = $('#arcSvg');
  if (!svg) return;
  svg.innerHTML = '';

  /* Four plants in a row across, or two by two on a phone.

     Laid out across, this is 1160 units wide and was held at a 620px minimum
     inside a ~257px column, so it could only be seen by dragging it sideways —
     the same problem the Kríos figure had. Wrapping it into two rows keeps
     every stage the same size and drops the scroller entirely. */
  const mob = isMobile();
  svg.setAttribute('viewBox', mob ? '0 0 560 420' : '0 0 1160 260');

  // where each of the four sits, and the ground it stands on
  const spots = mob
    ? [{ x: 145, y: 185 }, { x: 420, y: 185 }, { x: 145, y: 400 }, { x: 420, y: 400 }]
    : [{ x: 150, y: 196 }, { x: 440, y: 196 }, { x: 730, y: 196 }, { x: 1015, y: 196 }];

  const lines = mob
    ? ['M 26 191 C 150 181, 330 179, 534 185',
       'M 26 406 C 150 396, 330 394, 534 400']
    : ['M 40 202 C 260 186, 500 180, 830 184'];
  const line = lines.map(d => sub(svg, 'path', { d, 'data-line': '' }));

  const stems = [];
  const crowns = [];

  spots.forEach(({ x, y }, i) => {
    /* Bigger on a phone. Wrapped into two rows the figure renders at about
       0.46 of its own units, which left each plant around 40px tall in a cell
       twice that size. Scaling about the plant's own base keeps it standing on
       the line. */
    const g = sub(svg, 'g', {
      transform: `translate(${x} ${y})${mob ? ' scale(1.42)' : ''}`
    });
    sub(g, 'path', { d: 'M-34 0 H34', 'data-line': '', opacity: 0.45 });

    if (i === 0) {
      // a seed, still under the line
      crowns.push(sub(g, 'ellipse', { cx: 0, cy: -9, rx: 8, ry: 11, fill: 'var(--ember)' }));
    } else {
      const h = [0, 46, 74, 92][i];
      stems.push(sub(g, 'path', {
        d: `M0 0 C -4 ${-h * 0.4}, 4 ${-h * 0.72}, 0 ${-h}`,
        fill: 'none', stroke: 'var(--ember)', 'stroke-width': 3.2, 'stroke-linecap': 'round'
      }));
      [[-1, 0.42], [1, 0.66]].forEach(([side, at], k) => {
        if (i === 1 && k > 0) return;          // a sprout has just the one pair
        const lg = sub(g, 'g', {
          transform: `translate(${side * 2} ${-h * at}) rotate(${side * 52}) scale(${0.72 + i * 0.16})`
        });
        crowns.push(sub(lg, 'path', { d: LEAF, fill: 'var(--ember)', opacity: 0.72 }));
      });
      if (i >= 2) {
        const fg = sub(g, 'g', { transform: `translate(0 ${-h - 6})` });
        [0, 72, 144, 216, 288].forEach(a2 => {
          const rg = sub(fg, 'g', { transform: `rotate(${a2}) scale(${i === 3 ? 0.4 : 0.32})` });
          crowns.push(sub(rg, 'path', { d: PETAL, fill: 'var(--ember)' }));
        });
        crowns.push(sub(fg, 'circle', { r: i === 3 ? 5 : 4, fill: 'var(--peach)' }));
      }
      // the last one carries its own roots — it is not standing on the line
      if (i === 3) {
        [-1, 0, 1].forEach(d2 => stems.push(sub(g, 'path', {
          d: `M0 2 C ${d2 * 8} 14, ${d2 * 14} 22, ${d2 * 11} 32`,
          fill: 'none', stroke: 'var(--ember)', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.55
        })));
      }
    }
  });

  return { line, stems, crowns };
}

/**
 * Kríos: an abstract read of a practice conversation — the rep's turns above,
 * the prospect's below, with the objections marked. Deliberately not a mock of
 * the product; it is a rhythm, not an interface.
 */
/* The Kríos graphic.

   This was an abstract run of bars across a REP / PROSPECT timeline. It read
   as a waveform, and if you had never seen Kríos there was nothing in it to
   tell you what the product does. This says it literally instead: a door, the
   objections that come back at it, the rep's answer to each, and a loop round
   to do it again.

   The three objection lines are generic door-to-door ones, not claims about
   Kríos — they are there so the picture is legible without prior knowledge.
   Swap them for whatever the real ones are. */
function buildRiff() {
  const svg = $('#riffSvg');
  if (!svg) return null;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', '0 0 900 300');

  const ink = 'var(--on-soil)';
  const hot = 'var(--ember-hot)';
  const dark = 'var(--soil)';

  const label = (parent, x, y, str, o = {}) => {
    const n = sub(parent, 'text', {
      x, y, fill: o.fill || ink, 'fill-opacity': o.op == null ? 0.45 : o.op,
      'font-size': o.size || 11, 'font-weight': o.weight || 700,
      'letter-spacing': o.ls == null ? 1.8 : o.ls,
      'text-anchor': o.anchor || 'start'
    });
    n.textContent = str;
    return n;
  };

  /* ---- the practice screen ------------------------------------------------
     A vertical thread, because that is how everyone already reads a
     conversation. The previous version put three rounds side by side, which
     read as three unrelated cards rather than one exchange. */
  const screen = sub(svg, 'g', {});
  sub(screen, 'rect', { x: 2, y: 16, width: 545, height: 258, rx: 16,
    fill: ink, 'fill-opacity': 0.05, stroke: ink, 'stroke-opacity': 0.16, 'stroke-width': 1.5 });

  // who you are talking to. The four-point spark is the only thing in the
  // picture that says "AI", and without it this reads as a flashcard app.
  sub(screen, 'circle', { cx: 32, cy: 48, r: 14, fill: hot, 'fill-opacity': 0.18 });
  sub(screen, 'path', {
    d: 'M 32 40 L 34.4 45.6 L 40 48 L 34.4 50.4 L 32 56 L 29.6 50.4 L 24 48 L 29.6 45.6 Z',
    fill: hot, 'fill-opacity': 0.95
  });
  label(screen, 56, 52, 'AI PLAYS THE PROSPECT', { op: 0.62, size: 12 });
  label(screen, 531, 52, 'PRACTICE', { anchor: 'end', fill: hot, op: 0.7, size: 11 });
  sub(screen, 'path', { d: 'M 18 70 H 531', stroke: ink, 'stroke-opacity': 0.13, 'stroke-width': 1 });

  /* Ordinary door-to-door objections, and nothing Kríos-specific — they are
     here so the picture explains itself to someone who has never seen the
     product. The caption says as much. */
  const said = ['Not interested.', 'No time right now.'];

  const bubbles = [];

  const fromAI = (y, text) => {
    const g = sub(screen, 'g', {});
    const w = 20 + text.length * 8.6;
    sub(g, 'rect', { x: 22, y, width: w, height: 44, rx: 22, fill: hot, 'fill-opacity': 0.93 });
    // the little tail, so it reads as speech rather than a chip
    sub(g, 'path', { d: `M 30 ${y + 44} q -6 6 -14 6 q 10 -3 10 -12 Z`, fill: hot, 'fill-opacity': 0.93 });
    label(g, 40, y + 28, text, { fill: dark, op: 1, size: 15, ls: 0.1, weight: 600 });
    bubbles.push(g);
    return g;
  };

  // the rep's turn is deliberately left blank: it is the thing being practised
  const fromRep = y => {
    const g = sub(screen, 'g', {});
    const w = 208, x = 531 - w;
    sub(g, 'rect', { x, y, width: w, height: 44, rx: 22,
      fill: 'none', stroke: ink, 'stroke-opacity': 0.3, 'stroke-width': 1.5,
      'stroke-dasharray': '6 5' });
    label(g, x + 22, y + 28, 'REP ANSWERS', { op: 0.5, size: 12, ls: 1.4 });
    [0, 1, 2].forEach(i =>
      sub(g, 'circle', { cx: x + 150 + i * 13, cy: y + 22, r: 3, fill: ink, 'fill-opacity': 0.32 }));
    bubbles.push(g);
    return g;
  };

  fromAI(88, said[0]);
  fromRep(140);
  fromAI(192, said[1]);

  // ...and round again
  const loop = sub(screen, 'path', {
    // stops short of the label, and its head clears the last bubble's tail
    d: 'M 330 248 H 60 Q 44 248 44 242',
    fill: 'none', stroke: hot, 'stroke-opacity': 0.5, 'stroke-width': 1.6,
    'stroke-dasharray': '5 6', 'stroke-linecap': 'round'
  });
  const loopHead = sub(screen, 'path', {
    d: 'M 38 250 L 44 240 L 50 250',
    fill: 'none', stroke: hot, 'stroke-opacity': 0.65, 'stroke-width': 1.6,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  });
  label(screen, 531, 253, 'AGAIN, UNTIL IT LANDS', { anchor: 'end', fill: hot, op: 0.6, size: 11 });

  /* ---- then the real thing ---------------------------------------------- */
  const arrow = sub(svg, 'path', {
    d: 'M 566 146 H 618', fill: 'none', stroke: ink, 'stroke-opacity': 0.35,
    'stroke-width': 2, 'stroke-linecap': 'round'
  });
  const arrowHead = sub(svg, 'path', {
    d: 'M 610 139 L 620 146 L 610 153', fill: 'none', stroke: ink,
    'stroke-opacity': 0.35, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  });

  /* Two groups again: the wrapper carries the mobile stacking offset as a
     transform *attribute*, the inner one is what initRiff animates. anime
     writes an inline transform, which outranks the attribute — without the
     wrapper the door would snap back to its landscape position, off the side
     of the portrait viewBox, the moment the intro ran. */
  const fieldWrap = sub(svg, 'g', {});
  const field = sub(fieldWrap, 'g', {});
  sub(field, 'rect', { x: 726, y: 52, width: 104, height: 176, rx: 5,
    fill: ink, 'fill-opacity': 0.06, stroke: ink, 'stroke-opacity': 0.34, 'stroke-width': 2 });
  sub(field, 'rect', { x: 744, y: 70, width: 68, height: 62, rx: 3, fill: ink, 'fill-opacity': 0.09 });
  sub(field, 'rect', { x: 744, y: 146, width: 68, height: 62, rx: 3, fill: ink, 'fill-opacity': 0.09 });
  sub(field, 'circle', { cx: 818, cy: 140, r: 4.5, fill: hot, 'fill-opacity': 0.95 });
  // the rep, stood at it
  sub(field, 'circle', { cx: 682, cy: 158, r: 11, fill: ink, 'fill-opacity': 0.42 });
  sub(field, 'path', { d: 'M 666 228 v -32 q 0 -18 16 -18 q 16 0 16 18 v 32',
    fill: ink, 'fill-opacity': 0.42 });
  sub(field, 'path', { d: 'M 648 228 H 848', stroke: ink, 'stroke-opacity': 0.3,
    'stroke-width': 2, 'stroke-linecap': 'round' });
  label(field, 748, 254, 'THEN THE REAL DOOR', { anchor: 'middle', op: 0.55 });
  label(field, 748, 274, 'the objection is not a surprise', {
    anchor: 'middle', fill: hot, op: 0.6, size: 11.5, ls: 0.2, weight: 600 });

  /* On a phone the two panels stack instead of sitting side by side.

     Laid out across, this is 900 units wide and was being held at a 700px
     minimum inside a 257px column — a sideways scroller showing well under half
     the picture at a time, which is no way to read a diagram. The drawing is
     unchanged; the door panel is simply moved below the screen and the arrow
     turned to point down at it. */
  if (isMobile()) {
    svg.setAttribute('viewBox', '0 0 560 640');
    fieldWrap.setAttribute('transform', 'translate(-540 332)');
    arrow.setAttribute('d', 'M 274 292 V 344');
    arrowHead.setAttribute('d', 'M 267 336 L 274 346 L 281 336');
  }

  return { screen, bubbles, loop, loopHead, arrow: [arrow, arrowHead], field };
}

/** one-shot reveal helper: fires the callback the first time el is in view */
function onFirstView(el, fn, threshold = 0.2) {
  if (!el) return;
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      fn();
    });
  }, { threshold });
  io.observe(el);
}

/** strokes draw themselves; dash driven by hand for the reasons in buildRoots */
function drawStrokes(paths, opts = {}) {
  const list = paths.filter(Boolean);
  list.forEach(pth => {
    const L = pth.getTotalLength();
    pth.style.strokeDasharray = `${L}`;
    pth.style.strokeDashoffset = `${L}`;
  });
  return () => animate(list, Object.assign({
    strokeDashoffset: 0, duration: 900, delay: stagger(70), ease: 'outQuad'
  }, opts));
}

function initTenets() {
  $$('.tenets li').forEach((li, i) => {
    const strokes = $$('[data-stroke]', li);
    const fills = $$('[data-fill]', li);
    if (REDUCE) { utils.set(li, { opacity: 1 }); return; }

    const play = drawStrokes(strokes, { duration: 800, delay: stagger(90) });
    utils.set(fills, { scale: 0, transformOrigin: '50% 50%' });

    onFirstView(li, () => {
      animate(li, { opacity: [0, 1], translateY: [26, 0], duration: 820, ease: 'out(3)' });
      play();
      animate(fills, {
        scale: [0, 1], duration: 700, delay: stagger(90, { start: 260 }),
        ease: spring({ stiffness: 120, damping: 12 })
      });
    }, 0.25);
  });
}

function initArc() {
  const built = buildArc();
  const arc = $('#arc');
  if (!built || !arc) return;
  const steps = $$('.arc-steps li');

  if (REDUCE) { utils.set(steps, { opacity: 1 }); return; }

  // built.line is a list now — one ground line across, two when it wraps
  const play = drawStrokes([...built.line, ...built.stems], { duration: 1100, delay: stagger(60) });
  utils.set(built.crowns, { scale: 0, transformOrigin: '50% 50%' });
  utils.set(steps, { opacity: 0 });

  onFirstView(arc, () => {
    play();
    animate(built.crowns, {
      scale: [0, 1], duration: 760, delay: stagger(26, { start: 420 }),
      ease: spring({ stiffness: 100, damping: 12 })
    });
    animate(steps, {
      opacity: [0, 1], translateY: [22, 0],
      duration: 760, delay: stagger(110, { start: 300 }), ease: 'out(3)'
    });
  }, 0.15);
}

function initRiff() {
  const parts = buildRiff();
  const riff = $('.riff');
  if (!parts || !riff) return;
  if (REDUCE) return;

  const { screen, bubbles, loop, loopHead, arrow, field } = parts;

  utils.set(screen, { opacity: 0, translateY: 14 });
  utils.set(bubbles, { opacity: 0, translateY: 12 });
  utils.set([loop, loopHead], { opacity: 0 });
  utils.set(arrow, { opacity: 0 });
  utils.set(field, { opacity: 0, translateX: 16 });

  onFirstView(riff, () => {
    // the screen, then the exchange turn by turn, then out to the real door
    animate(screen, { opacity: [0, 1], translateY: [14, 0], duration: 560, ease: 'outQuad' });
    animate(bubbles, {
      opacity: [0, 1], translateY: [12, 0],
      duration: 560, delay: stagger(230, { start: 300 }),
      ease: spring({ stiffness: 130, damping: 15 })
    });
    animate([loop, loopHead], { opacity: [0, 1], duration: 480, delay: 1080, ease: 'outQuad' });
    animate(arrow, { opacity: [0, 1], duration: 420, delay: 1240, ease: 'outQuad' });
    animate(field, {
      opacity: [0, 1], translateX: [16, 0],
      duration: 620, delay: 1360, ease: spring({ stiffness: 120, damping: 14 })
    });
  }, 0.2);
}

/* ====================================================== pointer flourishes */

/** an accent ring that trails the pointer, and a dot that tracks it exactly */
function initCursor() {
  if (REDUCE || matchMedia('(pointer: coarse)').matches) return;

  const ring = document.createElement('div');
  const dot = document.createElement('div');
  ring.className = 'cursor-ring';
  dot.className = 'cursor-dot';
  document.body.append(ring, dot);

  let x = innerWidth / 2, y = innerHeight / 2;
  let rx = x, ry = y, shown = false, scale = 1;

  window.addEventListener('pointermove', e => {
    x = e.clientX; y = e.clientY;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ringTimer.play();
    if (!shown) {
      shown = true;
      animate([ring, dot], { opacity: [0, 1], duration: 400, ease: 'outQuad' });
    }
  }, { passive: true });

  // the ring lags behind, which is what makes it feel physical. It parks once
  // it has caught up, so a still pointer costs nothing.
  const ringTimer = createTimer({
    loop: true, duration: 1000,
    onUpdate: self => {
      const raw = self.deltaTime;
      const dt = raw > 0 && raw < 100 ? raw : 16;
      const k = 1 - Math.exp(-dt / 70);
      rx += (x - rx) * k;
      ry += (y - ry) * k;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) scale(${scale})`;
      if (Math.abs(x - rx) < 0.3 && Math.abs(y - ry) < 0.3) ringTimer.pause();
    }
  });

  // swells over anything you can actually interact with
  const grow = () => { scale = 1.8; ring.style.borderColor = 'var(--ember)'; ringTimer.play(); };
  const shrink = () => { scale = 1; ring.style.borderColor = 'var(--ember-lit)'; ringTimer.play(); };
  $$('a, button, [data-spotlight], .stage').forEach(elx => {
    elx.addEventListener('pointerenter', grow);
    elx.addEventListener('pointerleave', shrink);
  });
}

/** the hero flower leans toward the pointer in 3D */
function initHeroTilt() {
  const stage = $('#heroStage');
  const flower = $('#heroFlower');
  if (!stage || !flower || REDUCE || matchMedia('(pointer: coarse)').matches) return;

  /* A self-parking timer rather than createAnimatable.

     An animatable holds one permanent tween per property — three of them here —
     and they tick for the life of the page whether or not the pointer has ever
     been near the hero. That was the whole of the desktop's at-rest cost. This
     eases identically and then stops itself, the same pattern the cursor ring
     already uses. */
  let wantX = 0, wantY = 0, wantT = 0;   // where the pointer says it should be
  let curX  = 0, curY  = 0, curT  = 0;   // where it actually is

  const write = () => {
    flower.style.transform =
      `translateX(${curT.toFixed(2)}px) rotateX(${curX.toFixed(2)}deg) rotateY(${curY.toFixed(2)}deg)`;
  };

  const tiltTimer = createTimer({
    loop: true, duration: 1000, autoplay: false,
    onUpdate: self => {
      const raw = self.deltaTime;
      const dt = raw > 0 && raw < 100 ? raw : 16;
      const k = 1 - Math.exp(-dt / 105);
      curX += (wantX - curX) * k;
      curY += (wantY - curY) * k;
      curT += (wantT - curT) * k;
      if (Math.abs(wantX - curX) < 0.04 &&
          Math.abs(wantY - curY) < 0.04 &&
          Math.abs(wantT - curT) < 0.04) {
        curX = wantX; curY = wantY; curT = wantT;
        write();
        tiltTimer.pause();            // parked until the pointer moves again
        return;
      }
      write();
    }
  });

  const hero = $('.hero');
  /* the hero's box is read on enter, not on every move — a rect read per
     pointermove forces a layout, and this page's layout is expensive */
  let box = null;
  hero.addEventListener('pointerenter', () => { box = hero.getBoundingClientRect(); });
  window.addEventListener('resize', () => { box = null; });

  hero.addEventListener('pointermove', e => {
    if (!box) box = hero.getBoundingClientRect();
    const nx = (e.clientX - box.left) / box.width - 0.5;
    const ny = (e.clientY - box.top) / box.height - 0.5;
    wantY = nx * 26;
    wantX = -ny * 22;
    wantT = nx * 14;
    tiltTimer.play();
  }, { passive: true });

  hero.addEventListener('pointerleave', () => {
    wantX = 0; wantY = 0; wantT = 0;
    tiltTimer.play();
  });
}

/** a slow drift on a couple of anchored elements, for depth while scrolling */
function initParallax() {
  if (REDUCE) return;
  /* Deliberately excludes the hero stage: #vine-origin is anchored inside it,
     so shifting it would drag the stem away from the flower it grows out of. */
  const layers = [
    { node: $('.k-badge'), depth: -0.09 },
    { node: $('.person-mark'), depth: -0.055 },
    { node: $('.hero-flower'), depth: 0 }
  ].filter(l => l.node && l.depth !== 0);
  if (!layers.length) return;

  /* Each layer's document position is measured once. Reading
     getBoundingClientRect on every scroll event forced a synchronous layout of
     the whole page — including the vine's SVG — before anything could be
     written. */
  const measure = () => layers.forEach(l => {
    l.node.style.transform = '';
    const r = l.node.getBoundingClientRect();
    l.docY = r.top + window.scrollY + r.height / 2;
  });

  const apply = () => {
    for (const l of layers) {
      const fromCentre = l.docY - window.scrollY - window.innerHeight / 2;
      l.node.style.transform = `translate3d(0, ${(fromCentre * l.depth).toFixed(1)}px, 0)`;
    }
  };

  measure();
  apply();
  window.addEventListener('scroll', apply, { passive: true });
  window.addEventListener('resize', () => { measure(); apply(); });
}

/* =============================================================== roots */

/** a branching root system spreading down from where the stem left off */
let rootsObserver = null;

function buildRoots() {
  const svg = $('#roots');
  const footer = $('.footer');
  if (!svg || !footer) return;

  if (rootsObserver) { rootsObserver.disconnect(); rootsObserver = null; }
  svg.innerHTML = '';
  const W = footer.clientWidth;
  const H = Math.round(Math.min(240, Math.max(130, window.innerHeight * 0.24)));
  if (W < 1) return;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);

  const mob = isMobile();
  const originX = mob ? 34 : W / 2;
  const made = [];

  /* Recursive: each root splits into two thinner, shorter ones. Four levels
     gives fifteen strokes, which is enough to read as a root system without
     turning into a thicket. */
  (function grow(x, y, angle, len, width, depth) {
    if (depth === 0 || len < 7) return;
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    const cx = x + Math.cos(angle + 0.34) * len * 0.55;
    const cy = y + Math.sin(angle + 0.34) * len * 0.55;
    made.push(el('path', {
      d: `M ${x.toFixed(1)} ${y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
      'stroke-width': Math.max(1, width).toFixed(1)
    }, svg));
    const spread = 0.36 + Math.random() * 0.24;
    grow(ex, ey, angle - spread, len * 0.7, width * 0.66, depth - 1);
    grow(ex, ey, angle + spread, len * 0.7, width * 0.66, depth - 1);
  })(originX, 0, Math.PI / 2, H * 0.42, mob ? 3 : 4, 4);

  if (REDUCE) return;

  /* Dash driven by hand rather than through createDrawable(). It measures the
     path against its rendered box, and for these short strokes inside an
     absolutely positioned overlay it comes back with a nonsense length — the
     same trap the stem's mask hit. Setting the dash directly is exact. */
  made.forEach(pth => {
    const L = pth.getTotalLength();
    pth.style.strokeDasharray = `${L}`;
    pth.style.strokeDashoffset = `${L}`;
  });

  // hold them closed until the footer is actually in view
  rootsObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      animate(made, {
        strokeDashoffset: 0,
        duration: 950,
        delay: stagger(60),
        ease: 'outQuad'
      });
    });
  }, { threshold: 0.15 });
  rootsObserver.observe(footer);
}

/* ================================================================ boot */

function boot() {
  const y = $('#year');
  if (y) y.textContent = new Date().getFullYear();

  buildHeroFlower();
  heroIntro();
  initStageIcons();
  initSpotlights();
  initMagnetics();
  initReveals();
  initFeatureWords();
  initMarquee();
  initNav();
  buildGlyphs();
  initTenets();
  initArc();
  initRiff();
  initCursor();
  initHeroTilt();
  initParallax();
  buildRoots();

  const pollen = initPollen();
  const embers = initEmbers();

  buildVine();

  let rt;
  const rebuild = () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      buildVine();
      buildRoots();
      if (pollen) pollen.size();
      if (embers) embers.size();
    }, 260);
  };

  /* Width changes only.
     On iOS, scrolling collapses the URL bar, which fires resize with a new
     viewport *height*. Rebuilding on that tore down and regenerated the whole
     vine in the middle of a scroll. Nothing about the vine's geometry depends
     on viewport height, so height-only changes are ignored outright. */
  let lastW = document.documentElement.clientWidth;
  window.addEventListener('resize', () => {
    const w = document.documentElement.clientWidth;
    if (w === lastW) return;
    lastW = w;
    rebuild();
  });

  /* If the boot backstop fired before the webfont arrived, every measurement
     was taken against fallback metrics. Re-measure once it settles. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(rebuild).catch(() => {});
  }

  /* <main> can still change width without the window doing so — late fonts,
     images, or going from zero-width to laid out. Width only, same reason. */
  if ('ResizeObserver' in window) {
    let seenW = main.clientWidth;
    new ResizeObserver(() => {
      const w = main.clientWidth;
      if (w !== seenW) { seenW = w; rebuild(); }
    }).observe(main);
  }
}

function start() {
  try {
    boot();
  } catch (err) {
    console.error('[heloria] motion init failed, falling back to static', err);
    root.className = root.className.replace(/\bjs\b/, '');
  }
}

/* Boot.
   Waiting on document.fonts.ready gives the best measurements, because every
   geometry here is taken against laid-out text. But it cannot be the only path:
   that promise can sit pending forever — an inlined data-URI face reports
   `unloaded` while document.fonts.status already says `loaded`, and the promise
   never settles. Nothing then builds at all, and the page falls back to bare
   static HTML. So fonts are a preference with a hard backstop, and if they do
   settle later the vine simply re-measures. */
(function whenReady(fn) {
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    fn();
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(go).catch(go);
  }
  if (document.readyState === 'complete') setTimeout(go, 0);
  else window.addEventListener('load', go, { once: true });

  setTimeout(go, 1200);   // never let a pending promise hold the page hostage
})(start);
