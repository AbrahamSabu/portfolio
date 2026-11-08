import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import {
  decodeTrack,
  decodeTrail,
  encodeTrack,
  encodeTrail,
  type Track,
  type TrackTuple,
  type TrailPoint,
  type TrailTuple,
} from '@watchfloor/shared';
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
 *
 * This is the picture in memory; `PictureFile` is how it's written.
 */
export interface SavedPicture {
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
  /**
   * What the AIS feed knows about each saved ship, by MMSI (optional too):
   * static data arrives every six minutes, so a restart would otherwise lose
   * every ship's voyage details until it next sends them. Validated by the
   * ship registry when it loads them.
   */
  ships?: Record<string, unknown>;
}

export interface SavedPath {
  /** encodeTrail() relative to savedAt. */
  points: TrailTuple;
  backfill?: Backfill;
  /** Metres at the path's first point, when known (optional, so older files load). */
  firstAltitudeM?: number;
}

/**
 * On disk (version 2, gzip): tracks and trails in the snapshot's wire form
 * (tuples and integer steps, wire.ts) and ships as value lists. Version 1
 * wrote tracks and trails as plain objects: 20 MB for a world picture, and
 * about 0.15 s of the server's time to write every 30 s. Version 1 files are
 * still read, so upgrading doesn't lose the picture.
 */
interface PictureFile {
  version: 2;
  scenario: string;
  savedAt: number;
  tracks: TrackTuple[];
  /** Aligned with `tracks` by position, as in the snapshot; [] for none. */
  trails: TrailTuple[];
  paths: Record<string, SavedPath>;
  ships?: Record<string, unknown>;
}

const gzip = promisify(zlib.gzip);

/** Let the event loop run (hub ticks, sockets) between pieces of a long job. */
const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Items per piece when writing: a few milliseconds of work each. */
const CHUNK = 2_000;

/**
 * JSON for a list, built a piece at a time with the event loop running in
 * between. One JSON.stringify of a world picture held the server for about a
 * third of a second every 30 s, long enough to delay a tick.
 */
async function jsonArray<T>(items: readonly T[], encode: (item: T) => unknown): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    if (i > 0) await yieldToLoop();
    parts.push(JSON.stringify(items.slice(i, i + CHUNK).map(encode)).slice(1, -1));
  }
  return `[${parts.join(',')}]`;
}

/** The same for an object's entries. */
async function jsonObject(entries: readonly [string, unknown][]): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < entries.length; i += CHUNK) {
    if (i > 0) await yieldToLoop();
    parts.push(JSON.stringify(Object.fromEntries(entries.slice(i, i + CHUNK))).slice(1, -1));
  }
  return `{${parts.join(',')}}`;
}

/**
 * What to save: the live tracks, their trails and paths, and what the AIS feed
 * knows about the ships. Gathered a piece at a time, like the JSON, because
 * copying a world picture's histories in one go held the server for 150 ms.
 * Reports arriving meanwhile may land in some pieces and not others: it's a
 * cache, and restore validates everything again.
 */
export async function pictureOf(
  store: TrackStore,
  scenario: string,
  now: number,
  shipsOf?: (mmsis: string[]) => Record<string, unknown>,
): Promise<SavedPicture> {
  const tracks = store.snapshot().filter((t) => t.source !== 'sim');
  const trails: Record<string, TrailPoint[]> = {};
  const paths: Record<string, SavedPath> = {};
  const ships: Record<string, unknown> = {};
  for (let i = 0; i < tracks.length; i += CHUNK) {
    if (i > 0) await yieldToLoop();
    const piece = tracks.slice(i, i + CHUNK);
    for (const t of piece) {
      const points = store.trailOf(t.id);
      if (points.length > 0) trails[t.id] = [...points]; // a copy: the store keeps appending
    }
    for (const [id, path] of Object.entries(store.paths.toRecord(piece.map((t) => t.id)))) {
      paths[id] = {
        points: encodeTrail(path.points, now),
        ...(path.backfill ? { backfill: path.backfill } : {}),
        ...(path.firstAltitudeM === undefined ? {} : { firstAltitudeM: path.firstAltitudeM }),
      };
    }
    if (shipsOf) Object.assign(ships, shipsOf(piece.filter((t) => t.source === 'ais').map((t) => t.id.slice('ais:'.length))));
  }
  const picture: SavedPicture = { scenario, savedAt: now, tracks, trails, paths };
  if (shipsOf) picture.ships = ships;
  return picture;
}

/**
 * Write atomically (temp file, then rename), so a crash mid-write never
 * leaves half a file. Encoding and JSON happen on the main thread; gzip runs
 * on libuv's thread pool, so it doesn't hold up the hub's ticks.
 */
export async function savePicture(file: string, picture: SavedPicture): Promise<void> {
  const { scenario, savedAt, tracks, trails, paths, ships } = picture;
  // A PictureFile, written field by field so no one step stalls the server.
  const head: Pick<PictureFile, 'version' | 'scenario' | 'savedAt'> = { version: 2, scenario, savedAt };
  let text = JSON.stringify(head).slice(0, -1);
  text += `,"tracks":${await jsonArray(tracks, (t) => encodeTrack(t, savedAt))}`;
  text += `,"trails":${await jsonArray(tracks, (t) => encodeTrail(trails[t.id] ?? [], savedAt))}`;
  text += `,"paths":${await jsonObject(Object.entries(paths ?? {}))}`;
  if (ships) text += `,"ships":${await jsonObject(Object.entries(ships))}`;
  text += '}';
  const bytes = await gzip(text, { level: 6 });
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, bytes);
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
    const bytes = fs.readFileSync(file);
    const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
    raw = JSON.parse((gzipped ? zlib.gunzipSync(bytes) : bytes).toString('utf8'));
  } catch {
    return null; // missing or unreadable: start empty
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if ((p.version !== 1 && p.version !== 2) || typeof p.scenario !== 'string' || typeof p.savedAt !== 'number') return null;
  if (!Array.isArray(p.tracks)) return null;
  const savedAt = p.savedAt;
  let tracks: Track[];
  const trails: Record<string, TrailPoint[]> = {};
  if (p.version === 2) {
    // Decoded fields are only shaped like a track: restore validates each one again.
    const rows = p.tracks as unknown[];
    const wireTrails = Array.isArray(p.trails) ? (p.trails as unknown[]) : [];
    tracks = [];
    rows.forEach((row, i) => {
      if (!Array.isArray(row) || typeof row[0] !== 'string') return;
      const track = decodeTrack(row as TrackTuple, savedAt);
      tracks.push(track);
      const trail = wireTrails[i];
      if (isTrailTuple(trail) && trail.length > 0) trails[track.id] = decodeTrail(trail, savedAt);
    });
  } else {
    tracks = p.tracks as Track[];
    if (typeof p.trails === 'object' && p.trails !== null) {
      for (const [id, points] of Object.entries(p.trails as Record<string, unknown>)) {
        if (Array.isArray(points) && points.every(isTrailPoint)) trails[id] = points;
      }
    }
  }
  const paths: Record<string, SavedPath> = {};
  if (typeof p.paths === 'object' && p.paths !== null) {
    for (const [id, path] of Object.entries(p.paths as Record<string, unknown>)) {
      const { points, backfill, firstAltitudeM } = (path ?? {}) as Record<string, unknown>;
      if (!isTrailTuple(points)) continue;
      paths[id] = { points: points as TrailTuple };
      if (backfill === 'opensky' || backfill === 'none') paths[id].backfill = backfill;
      if (typeof firstAltitudeM === 'number' && Number.isFinite(firstAltitudeM)) paths[id].firstAltitudeM = firstAltitudeM;
    }
  }
  const picture: SavedPicture = { scenario: p.scenario, savedAt, tracks, trails, paths };
  if (typeof p.ships === 'object' && p.ships !== null) picture.ships = p.ships as Record<string, unknown>;
  return picture;
}

/** encodeTrail's form: three numbers per point (whole today; a feed stamping fractional ms mustn't drop every trail). */
function isTrailTuple(v: unknown): v is TrailTuple {
  return Array.isArray(v) && v.length % 3 === 0 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
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
        {
          points: decodeTrail(path.points, picture.savedAt),
          ...(path.backfill ? { backfill: path.backfill } : {}),
          ...(path.firstAltitudeM === undefined ? {} : { firstAltitudeM: path.firstAltitudeM }),
        },
      ]),
    ),
  );
}
