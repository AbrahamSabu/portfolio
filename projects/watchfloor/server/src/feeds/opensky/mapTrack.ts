import type { TrailPoint } from '@watchfloor/shared';

/**
 * OpenSky's /tracks/all answer: one aircraft's current flight as waypoints
 * `[time s, lat, lon, baro altitude m, true track, on ground]`, any of the
 * middle four possibly null. Waypoints are sparse by design (at least every
 * 15 minutes, plus turns, climbs and descents), which is all a path needs.
 *
 * Returns path points oldest first, or null if the body isn't a track.
 */
export function parseTrackResponse(body: unknown): TrailPoint[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const path = (body as Record<string, unknown>).path;
  if (!Array.isArray(path)) return null;
  const points: TrailPoint[] = [];
  for (const w of path) {
    if (!Array.isArray(w)) continue;
    const [time, lat, lon] = w as unknown[];
    if (!isFiniteNumber(time) || !isFiniteNumber(lat) || !isFiniteNumber(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    points.push([lon, lat, time * 1000]);
  }
  return points.sort((a, b) => a[2] - b[2]);
}

/** OpenSky's ICAO24 is lowercase hex; our ADS-B track ids are `adsb:<icao24>`. */
export function icao24Of(trackId: string): string | null {
  const m = /^adsb:([0-9a-f]{6})$/.exec(trackId);
  return m ? m[1]! : null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
