import { distanceM, type BBox } from '@watchfloor/shared';
import { normalizeView } from '../opensky/coverage';

/**
 * adsb.lol answers "aircraft within R nautical miles of a point" (R up to
 * 250), with no bounding-box or worldwide query. So a view is covered with a
 * grid of circles, each just big enough for its grid cell. More circles than
 * the limit means the view is too wide for this provider: it stands aside and
 * OpenSky covers it.
 */
export interface Circle {
  lat: number;
  lon: number;
  radiusNm: number;
}

const MAX_RADIUS_NM = 250;
const M_PER_NM = 1852;
const M_PER_DEG_LAT = 111_320;
/** Snap so small pans make the same request (and don't trigger early polls). */
const CENTRE_STEP_DEG = 0.5;
const RADIUS_STEP_NM = 25;
export const MAX_CIRCLES = 6;

const snapTo = (v: number, step: number) => Math.round(v / step) * step;

/** Circles covering one box that doesn't cross the antimeridian. */
function circlesForBox(b: BBox): Circle[] {
  const south = Math.max(-85, b.south);
  const north = Math.min(85, b.north);
  // Width is measured where the box is widest: its latitude nearest the equator.
  const widestLat = south > 0 ? south : north < 0 ? north : 0;
  const heightM = (north - south) * M_PER_DEG_LAT;
  const widthM = (b.east - b.west) * M_PER_DEG_LAT * Math.cos((widestLat * Math.PI) / 180);
  // A square inscribed in a 250 nm circle has sides of 250 nm x sqrt(2).
  const cell = MAX_RADIUS_NM * M_PER_NM * Math.SQRT2;
  const rows = Math.max(1, Math.ceil(heightM / cell));
  const cols = Math.max(1, Math.ceil(widthM / cell));
  const cellH = heightM / rows;
  const cellW = widthM / cols;
  const radiusNm = Math.min(
    MAX_RADIUS_NM,
    Math.ceil(Math.hypot(cellH, cellW) / 2 / M_PER_NM / RADIUS_STEP_NM) * RADIUS_STEP_NM,
  );
  const circles: Circle[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      circles.push({
        lat: snapTo(south + ((r + 0.5) * (north - south)) / rows, CENTRE_STEP_DEG),
        lon: snapTo(b.west + ((c + 0.5) * (b.east - b.west)) / cols, CENTRE_STEP_DEG),
        radiusNm,
      });
    }
  }
  return circles;
}

/** Whether circle `outer` contains all of circle `inner`. */
export function circleContains(outer: Circle, inner: Circle): boolean {
  const d = distanceM(outer, inner);
  return d + inner.radiusNm * M_PER_NM <= outer.radiusNm * M_PER_NM + 1;
}

/**
 * Circles covering every view, or null when that would take more than
 * MAX_CIRCLES (too wide for this provider). An empty list means no views.
 */
export function circlesFor(views: BBox[], max = MAX_CIRCLES): Circle[] | null {
  const all: Circle[] = [];
  for (const view of views) {
    const boxes = normalizeView(view);
    if (boxes === null) return null;
    for (const box of boxes) all.push(...circlesForBox(box));
    if (all.length > max * 4) return null; // clearly too wide; stop early
  }
  // Drop circles another circle already covers (viewers looking at the same area).
  const kept = all.filter((c, i) => !all.some((o, j) => j !== i && circleContains(o, c) && (!circleContains(c, o) || j < i)));
  return kept.length > max ? null : kept;
}

/** Whether the last poll's circles already cover what's wanted now. */
export function circlesCover(polled: Circle[], wanted: Circle[]): boolean {
  return wanted.every((w) => polled.some((p) => circleContains(p, w)));
}
