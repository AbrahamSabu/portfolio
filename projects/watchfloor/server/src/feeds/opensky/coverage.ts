import type { BBox } from '@watchfloor/shared';

/**
 * Deciding what to ask OpenSky for, given what browsers are looking at.
 *
 * OpenSky charges by box size, so polling only the watched areas is cheaper
 * when people are zoomed in. These are pure functions: views in, a plan out.
 *
 * A plan is a list of boxes to request, or null for the whole world. An empty
 * list means nothing is watched.
 */
export type Plan = BBox[] | null;

/** More separate requests than this per poll isn't worth the round trips; ask for the world. */
const MAX_REQUESTS = 4;
const WORLD_COST = 4;

/**
 * Credits one /states/all request costs, by bounding-box area in square
 * degrees: up to 25 costs 1, up to 100 costs 2, up to 400 costs 3, more (or
 * the whole world) costs 4.
 */
export function requestCost(b: BBox | null): number {
  if (!b) return WORLD_COST;
  const area = (b.north - b.south) * (b.east - b.west);
  if (area <= 25) return 1;
  if (area <= 100) return 2;
  if (area <= 400) return 3;
  return WORLD_COST;
}

export function planCost(plan: Plan): number {
  return plan === null ? WORLD_COST : plan.reduce((sum, b) => sum + requestCost(b), 0);
}

/**
 * Turn a browser's view into boxes OpenSky accepts. MapLibre reports
 * longitudes beyond ±180 when the view wraps; OpenSky can't take a box that
 * crosses the antimeridian, so those become two. Null means the view spans
 * the whole world.
 */
export function normalizeView(v: BBox): BBox[] | null {
  if (v.east - v.west >= 360) return null;
  const south = Math.max(-90, v.south);
  const north = Math.min(90, v.north);
  // Shift so west is in [-180, 180).
  const shift = Math.floor((v.west + 180) / 360) * 360;
  const west = v.west - shift;
  const east = v.east - shift;
  if (east <= 180) return [{ south, west, north, east }];
  return [
    { south, west, north, east: 180 },
    { south, west: -180, north, east: east - 360 },
  ];
}

/**
 * Round a box outward to whole degrees. Small pans then produce the same
 * request, so they neither change the cost nor trigger an early poll.
 */
export function snap(b: BBox): BBox {
  return {
    south: Math.max(-90, Math.floor(b.south)),
    west: Math.max(-180, Math.floor(b.west)),
    north: Math.min(90, Math.ceil(b.north)),
    east: Math.min(180, Math.ceil(b.east)),
  };
}

export function contains(outer: BBox, inner: BBox): boolean {
  return outer.south <= inner.south && outer.west <= inner.west && outer.north >= inner.north && outer.east >= inner.east;
}

function union(boxes: BBox[]): BBox {
  return {
    south: Math.min(...boxes.map((b) => b.south)),
    west: Math.min(...boxes.map((b) => b.west)),
    north: Math.max(...boxes.map((b) => b.north)),
    east: Math.max(...boxes.map((b) => b.east)),
  };
}

/**
 * The cheapest way to cover every view: separate boxes, one box around all of
 * them, or the whole world. On a tie, fewer requests win (the world gives the
 * most data for its price).
 */
export function planCoverage(views: BBox[]): Plan {
  const pieces: BBox[] = [];
  for (const view of views) {
    const normalized = normalizeView(view);
    if (normalized === null) return null;
    pieces.push(...normalized.map(snap));
  }
  // Drop boxes another box already covers (two viewers looking at the same area).
  const boxes = pieces.filter((b, i) => !pieces.some((o, j) => j !== i && contains(o, b) && (!contains(b, o) || j < i)));
  if (boxes.length === 0) return [];

  const options: Array<{ plan: Plan; requests: number }> = [{ plan: null, requests: 1 }];
  const around = union(boxes);
  options.push({ plan: [around], requests: 1 });
  if (boxes.length > 1 && boxes.length <= MAX_REQUESTS) options.push({ plan: boxes, requests: boxes.length });

  options.sort((a, b) => planCost(a.plan) - planCost(b.plan) || a.requests - b.requests);
  return options[0]!.plan;
}

/** Whether a poll of `polled` already includes everything `wanted` asks for. */
export function covers(polled: Plan, wanted: Plan): boolean {
  if (polled === null) return true;
  if (wanted === null) return false;
  return wanted.every((w) => polled.some((p) => contains(p, w)));
}

/** Compact text for logs and /healthz, e.g. "49,-5,52,2" or "world". */
export function describePlan(plan: Plan): string {
  if (plan === null) return 'world';
  if (plan.length === 0) return 'none';
  return plan.map((b) => `${b.south},${b.west},${b.north},${b.east}`).join(' + ');
}
