import fs from 'node:fs';
import path from 'node:path';
import type { Track, TrailPoint } from '@watchfloor/shared';
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
  return { version: 1, scenario, savedAt: now, tracks, trails };
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
  return { version: 1, scenario: p.scenario, savedAt: p.savedAt, tracks: p.tracks as Track[], trails };
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
  );
}
