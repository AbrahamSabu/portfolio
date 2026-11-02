import { distanceM } from '@watchfloor/shared';

/**
 * "Is this position near enough the screen to be worth drawing?"
 *
 * With 7,000 aircraft worldwide and the map zoomed in on one coast, almost
 * all of them are off screen. Rebuilding their features ten times a second
 * is the expensive part, so layers only send the map features inside the
 * view plus a margin. The margin covers panning between renders, and the
 * layers redraw when a pan or zoom ends.
 */
export interface ViewBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Grow a box by `fraction` of its size on every side. Spanning 360° or more means "everywhere". */
export function padViewBox(b: ViewBox, fraction: number): ViewBox {
  const dLon = (b.east - b.west) * fraction;
  const dLat = (b.north - b.south) * fraction;
  return {
    west: b.west - dLon,
    east: b.east + dLon,
    south: Math.max(-90, b.south - dLat),
    north: Math.min(90, b.north + dLat),
  };
}

/**
 * Whether a position falls in the box. MapLibre reports longitudes beyond
 * ±180 when the view crosses the antimeridian, so a track at 179°E is tested
 * as -181° as well.
 */
export function inViewBox(b: ViewBox, lon: number, lat: number): boolean {
  if (lat < b.south || lat > b.north) return false;
  if (b.east - b.west >= 360) return true;
  for (const candidate of [lon, lon - 360, lon + 360]) {
    if (candidate >= b.west && candidate <= b.east) return true;
  }
  return false;
}

/**
 * The view to report to the server. Kept tighter than the drawing margin,
 * because the server may pay by area for what it fetches. A view wider than
 * the world (zoomed right out on a wide screen) becomes exactly the world.
 */
export function viewForServer(screen: ViewBox, margin = 0.2): ViewBox {
  const padded = padViewBox(screen, margin);
  if (padded.east - padded.west >= 360) return { ...padded, west: -180, east: 180 };
  return padded;
}

/** An arc a bit short of a quarter of the Earth: the edge of the globe's visible side, less a margin. */
const VISIBLE_ARC_M = (80 / 360) * 2 * Math.PI * 6_371_000;

/**
 * Whether a place is on the side of the globe facing the viewer. Zoomed out,
 * the map is a sphere and its bounds can take in places round the back; a
 * card popped up there would point at nothing. Zoomed in, the visible side
 * is the bounds, so this always holds.
 */
export function facesViewer(center: { lat: number; lon: number }, place: { lat: number; lon: number }, zoom: number): boolean {
  return zoom >= 5 || distanceM(center, place) < VISIBLE_ARC_M;
}
