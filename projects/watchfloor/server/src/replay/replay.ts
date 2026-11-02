import { inBBox, type BBox, type ReplayMessage, type ReplayTrack, type Track, type TrailPoint } from '@watchfloor/shared';

/** Enough for a dense port or terminal area without shipping a worldwide view. */
const MAX_TRACKS = 400;
const MAX_POINTS = 150_000;

/**
 * The answer to a browser's `replay` request: recent paths of the tracks
 * currently inside its view, richest histories first, capped so a worldwide
 * view can't ask for a million points. Only what the server already keeps
 * (PathHistory) — nothing new is recorded for this.
 */
export function replayFor(
  tracks: readonly Track[],
  pathOf: (id: string) => TrailPoint[],
  bbox: BBox,
  now: number,
): ReplayMessage {
  // Views can run past ±180 when the map wraps; tracks never do.
  const inside = (t: Track) =>
    inBBox(t, bbox) || inBBox({ lat: t.lat, lon: t.lon + 360 }, bbox) || inBBox({ lat: t.lat, lon: t.lon - 360 }, bbox);
  const candidates: ReplayTrack[] = [];
  for (const t of tracks) {
    if (!inside(t)) continue;
    const points = pathOf(t.id);
    if (points.length < 2) continue;
    candidates.push({
      id: t.id,
      domain: t.domain,
      platform: t.platform,
      affiliation: t.affiliation,
      ...(t.callsign ? { callsign: t.callsign } : {}),
      points,
    });
  }
  candidates.sort((a, b) => b.points.length - a.points.length);
  const out: ReplayTrack[] = [];
  let points = 0;
  for (const c of candidates) {
    if (out.length >= MAX_TRACKS || points + c.points.length > MAX_POINTS) break;
    out.push(c);
    points += c.points.length;
  }
  return { type: 'replay', serverTime: now, tracks: out, truncated: out.length < candidates.length };
}
