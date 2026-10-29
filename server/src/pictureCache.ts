import fs from 'node:fs';
import path from 'node:path';
import { decodeTrail, encodeTrail, type Track, type TrailPoint, type TrailTuple } from '@watchfloor/shared';
import type { Backfill } from './paths/pathHistory';
import type { TrackStore } from './trackStore';

/**
 * The live picture saved to disk, so a restart doesn't open on an empty map.
 *
 * AIS can't be asked for the current picture: after a restart a moored ship
 * only reappears when it next reports, up to 3 minutes later. Saving the store
 * every 30 s and restoring it at startup makes the picture survive restarts the
 * way it survives page reloads. Simulated tracks are never saved: the
 * simulator rebuilds its own seeded state, and old copies would jump.
 */
export interface SavedPicture {
  version: 1;
  /** The area settings it was saved for (scenario and area modes); another's is not restored. */
  scenario: string;
  savedAt: number;
  tracks: Track[];
  trails: Record<string, TrailPoint[]>;
  /**
   * Longer, thinned paths (added after version 1 shipped; optional, so older
   * files still load), as compact integer deltas keyed by id: hours of history
   * for tens of thousands of tracks would otherwise double the file.
   */
  paths?: Record<string, SavedPath>;
}

export interface SavedPath {
  /** encodeTrail() relative to savedAt. */
  points: TrailTuple;
  backfill?: Backfill;
}

/** What to save: the live tracks and their trails. */
export function pictureOf(store: TrackStore, scenario: string, now: number): SavedPicture {
  const tracks = store.snapshot().filter((t) => t.source !== 'sim');
  const all = store.trailSnapshot();
  const trails: Record<string, TrailPoint[]> = {};
  for (const t of tracks) {
    const points = all[t.id];
    if (points) trails[t.id] = points;
  }
  const paths: Record<string, SavedPath> = {};
  for (const [id, path] of Object.entries(store.paths.toRecord(tracks.map((t) => t.id)))) {
    paths[id] = { points: encodeTrail(path.points, now), ...(path.backfill ? { backfill: path.backfill } : {}) };
  }
  return { version: 1, scenario, savedAt: now, tracks, trails, paths };
}

/** Write atomically (temp file, then rename), so a crash mid-write never leaves half a file. */
export async function savePicture(file: string, picture: SavedPicture): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(picture));
  await fs.promises.rename(tmp, file);
}

/**
 * Read a saved picture, or null if there is none or it can't be trusted.
 * The file is input like any other: tracks are validated again on restore,
 * and trail points must be [lon, lat, t] numbers.
 */
export function loadPicture(file: string): SavedPicture | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // missing or unreadable: start empty
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (p.version !== 1 || typeof p.scenario !== 'string' || typeof p.savedAt !== 'number' || !Array.isArray(p.tracks)) {
    return null;
  }
  const trails: Record<string, TrailPoint[]> = {};
  if (typeof p.trails === 'object' && p.trails !== null) {
    for (const [id, points] of Object.entries(p.trails as Record<string, unknown>)) {
      if (Array.isArray(points) && points.every(isTrailPoint)) trails[id] = points;
    }
  }
  const paths: Record<string, SavedPath> = {};
  if (typeof p.paths === 'object' && p.paths !== null) {
    for (const [id, path] of Object.entries(p.paths as Record<string, unknown>)) {
      const { points, backfill } = (path ?? {}) as Record<string, unknown>;
      const valid = Array.isArray(points) && points.length % 3 === 0 && points.every((n) => Number.isInteger(n));
      if (!valid) continue;
      paths[id] = { points: points as TrailTuple };
      if (backfill === 'opensky' || backfill === 'none') paths[id].backfill = backfill;
    }
  }
  return { version: 1, scenario: p.scenario, savedAt: p.savedAt, tracks: p.tracks as Track[], trails, paths };
}

function isTrailPoint(v: unknown): v is TrailPoint {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Restore a saved picture into the store if it's for this area. Returns how many tracks came back. */
export function restorePicture(store: TrackStore, picture: SavedPicture | null, scenario: string, now: number): number {
  if (!picture || picture.scenario !== scenario) return 0;
  return store.restore(
    picture.tracks.filter((t) => typeof t === 'object' && t !== null && t.source !== 'sim'),
    picture.trails,
    now,
    Object.fromEntries(
      Object.entries(picture.paths ?? {}).map(([id, path]) => [
        id,
        { points: decodeTrail(path.points, picture.savedAt), ...(path.backfill ? { backfill: path.backfill } : {}) },
      ]),
    ),
  );
}
