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
