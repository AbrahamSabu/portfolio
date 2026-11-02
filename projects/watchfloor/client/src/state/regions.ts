import type { Platform, Track } from '@watchfloor/shared';

/** A watched area the operator drew: a polygon and what to alert on. */
export interface Region {
  id: string;
  name: string;
  /** Corners as [lon, lat], in drawing order, not closed (the last joins the first). */
  ring: [number, number][];
  watch: 'air' | 'sea' | 'both';
  /** Only military aircraft and warships count. */
  militaryOnly: boolean;
  onEnter: boolean;
  onExit: boolean;
}

export type RegionEventType = 'enter' | 'exit' | 'lost';

export interface RegionEvent {
  type: RegionEventType;
  regionId: string;
  trackId: string;
  /** Server time it was noticed (ms). */
  at: number;
  /** Who, as last seen: a lost track is no longer in the store to ask. */
  callsign?: string;
  platform: Platform;
}

const MILITARY: ReadonlySet<Platform> = new Set(['military-aircraft', 'military-helicopter', 'maritime-patrol', 'uav', 'warship']);

/**
 * Whether a point is inside a ring (ray casting). Rings that cross the
 * antimeridian (corners more than 180° of longitude apart) are compared in
 * 0-360° longitude, so a box over the Pacific works.
 */
export function insideRing(lon: number, lat: number, ring: readonly (readonly [number, number])[]): boolean {
  if (ring.length < 3) return false;
  const lons = ring.map((p) => p[0]);
  const wraps = Math.max(...lons) - Math.min(...lons) > 180;
  const shift = (x: number) => (wraps && x < 0 ? x + 360 : x);
  const x = shift(lon);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = [shift(ring[i]![0]), ring[i]![1]];
    const [xj, yj] = [shift(ring[j]![0]), ring[j]![1]];
    if (yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether a region is watching this kind of track at all. */
export function watches(region: Region, track: Track): boolean {
  if (region.watch !== 'both' && region.watch !== track.domain) return false;
  return !region.militaryOnly || MILITARY.has(track.platform);
}

const STORAGE_KEY = 'watchfloor.regions';
const MAX_REGIONS = 20;

/** The saved areas, each checked; anything malformed is dropped. */
export function parseRegions(raw: unknown): Region[] {
  if (!Array.isArray(raw)) return [];
  const out: Region[] = [];
  for (const r of raw.slice(0, MAX_REGIONS) as Record<string, unknown>[]) {
    if (typeof r !== 'object' || r === null) continue;
    if (typeof r.id !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.ring)) continue;
    const ring = (r.ring as unknown[]).filter(
      (p): p is [number, number] =>
        Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number' && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90,
    );
    if (ring.length < 3 || ring.length > 200) continue;
    out.push({
      id: r.id.slice(0, 40),
      name: r.name.slice(0, 40) || 'Area',
      ring,
      watch: r.watch === 'air' || r.watch === 'sea' ? r.watch : 'both',
      militaryOnly: r.militaryOnly === true,
      onEnter: r.onEnter !== false,
      onExit: r.onExit !== false,
    });
  }
  return out;
}

export function loadRegions(): Region[] {
  try {
    return parseRegions(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveRegions(regions: readonly Region[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(regions));
  } catch {
    // Private browsing: the areas last until the page closes.
  }
}

/** Reports outside before a track counts as having left: one jumpy position mustn't do it. */
const EXIT_REPORTS = 2;

interface Inside {
  /** The report last looked at, so the same report isn't counted twice. */
  observedAt: number;
  outsideReports: number;
  callsign?: string;
  platform: Platform;
}

/**
 * Who is inside each region, and the moments that change it:
 *
 * - enter: a track seen outside on one look is inside on a later one. A
 *   track already inside when the region starts being watched (the page
 *   opened, the region was drawn), or heard for the first time inside, is
 *   counted as inside without an alert: nothing was seen to cross.
 * - exit: two reports in a row outside.
 * - lost: a track inside leaves the picture (no report for its drop time:
 *   20 minutes for a ship). Merely stale isn't lost: ships report every few
 *   minutes and go stale and live again all day, and logging each of those
 *   buried a busy area's log in a minute (measured). A stale track inside
 *   stays inside, quietly, until it reports again or is dropped.
 */
export class RegionWatch {
  private readonly inside = new Map<string, Map<string, Inside>>();
  /** Tracks live on the last look (outside any region they're not a member of). */
  private outside = new Set<string>();
  private started = false;

  /** Who's inside a region now (live or lost). */
  insideOf(regionId: string): string[] {
    return [...(this.inside.get(regionId)?.keys() ?? [])];
  }

  /** Forget a deleted region; a new one starts with nobody "entering". */
  forget(regionId: string): void {
    this.inside.delete(regionId);
  }

  update(regions: readonly Region[], tracks: Iterable<Track>, isLive: (t: Track) => boolean, now: number): RegionEvent[] {
    const events: RegionEvent[] = [];
    const list = [...tracks];
    const present = new Set(list.map((t) => t.id));
    for (const region of regions) {
      const fresh = !this.inside.has(region.id) || !this.started;
      const members = this.inside.get(region.id) ?? new Map<string, Inside>();
      this.inside.set(region.id, members);
      const box = boundsOf(region.ring);
      for (const t of list) {
        if (!watches(region, t)) continue;
        const live = isLive(t);
        const inBox = box.contains(t.lon, t.lat);
        const isIn = inBox && insideRing(t.lon, t.lat, region.ring);
        const member = members.get(t.id);
        if (!member) {
          if (!isIn) continue;
          members.set(t.id, { observedAt: t.observedAt, outsideReports: 0, callsign: t.callsign, platform: t.platform });
          // Seen live outside on the last look, live inside now: it crossed in. A stale
          // track inside (its last report was there) only counts as inside.
          if (!fresh && live && this.outside.has(t.id)) events.push(eventFor('enter', region, t.id, t, now));
          continue;
        }
        if (!live || t.observedAt === member.observedAt) continue;
        member.observedAt = t.observedAt;
        member.callsign = t.callsign ?? member.callsign;
        member.platform = t.platform;
        if (isIn) member.outsideReports = 0;
        else if (++member.outsideReports >= EXIT_REPORTS) {
          members.delete(t.id);
          events.push(eventFor('exit', region, t.id, t, now));
        }
      }
      // Gone from the picture altogether while inside.
      for (const [id, member] of members) {
        if (present.has(id)) continue;
        members.delete(id);
        events.push(eventFor('lost', region, id, member, now));
      }
    }
    for (const id of [...this.inside.keys()]) if (!regions.some((r) => r.id === id)) this.inside.delete(id);
    this.outside = new Set(list.filter(isLive).map((t) => t.id));
    this.started = true;
    return events;
  }
}

function eventFor(type: RegionEventType, region: Region, trackId: string, who: { callsign?: string; platform: Platform }, at: number): RegionEvent {
  return { type, regionId: region.id, trackId, at, platform: who.platform, ...(who.callsign ? { callsign: who.callsign } : {}) };
}

/** A quick box test before the polygon one; antimeridian rings are boxed in 0-360°. */
function boundsOf(ring: readonly (readonly [number, number])[]): { contains: (lon: number, lat: number) => boolean } {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const wraps = Math.max(...lons) - Math.min(...lons) > 180;
  const shifted = wraps ? lons.map((x) => (x < 0 ? x + 360 : x)) : lons;
  const west = Math.min(...shifted);
  const east = Math.max(...shifted);
  return {
    contains: (lon, lat) => {
      const x = wraps && lon < 0 ? lon + 360 : lon;
      return lat >= south && lat <= north && x >= west && x <= east;
    },
  };
}

/** The operator's areas, saved in this browser. */
export class RegionStore {
  private list: Region[];
  private readonly listeners = new Set<() => void>();

  constructor(initial: Region[] = loadRegions()) {
    this.list = initial;
  }

  get regions(): readonly Region[] {
    return this.list;
  }

  get(id: string): Region | undefined {
    return this.list.find((r) => r.id === id);
  }

  add(region: Region): void {
    this.list = [...this.list, region].slice(-MAX_REGIONS);
    this.changed();
  }

  remove(id: string): void {
    this.list = this.list.filter((r) => r.id !== id);
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    saveRegions(this.list);
    for (const listener of this.listeners) listener();
  }
}

/**
 * The ring with longitudes made continuous (179 then -179 becomes 179 then
 * 181), so the map draws a Pacific area the short way round.
 */
export function unwrapRing(ring: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [lon, lat] of ring) {
    const prev = out.at(-1)?.[0];
    let x = lon;
    if (prev !== undefined) while (x - prev > 180) x -= 360;
    if (prev !== undefined) while (prev - x > 180) x += 360;
    out.push([x, lat]);
  }
  return out;
}
