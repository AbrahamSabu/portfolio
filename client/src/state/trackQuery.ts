import type { Domain, Track } from '@watchfloor/shared';
import { PLATFORM_LABEL } from '../ui/format';

export type DomainFilter = 'all' | Domain;
export type SortKey = 'callsign' | 'type' | 'speed' | 'altitude' | 'age';
export type SortDir = 'asc' | 'desc';

/** Everything the track list needs to decide which rows to show, in what order. */
export interface TrackQuery {
  domain: DomainFilter;
  search: string;
  sort: SortKey;
  dir: SortDir;
}

export const DEFAULT_QUERY: TrackQuery = { domain: 'all', search: '', sort: 'callsign', dir: 'asc' };

/**
 * The direction a column sorts in when first clicked: the most useful end
 * first. Names read A→Z, the fastest and highest are the interesting ones,
 * and the freshest reports are the most trustworthy.
 */
const FIRST_DIR: Record<SortKey, SortDir> = {
  callsign: 'asc',
  type: 'asc',
  speed: 'desc',
  altitude: 'desc',
  age: 'asc',
};

/** Clicking the current column flips it; clicking another starts at its most useful end. */
export function nextSort(query: TrackQuery, key: SortKey): TrackQuery {
  const dir = query.sort === key ? (query.dir === 'asc' ? 'desc' : 'asc') : FIRST_DIR[key];
  return { ...query, sort: key, dir };
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Domain filter plus a case-insensitive substring search on callsign or track id. */
export function matchesQuery(track: Track, query: TrackQuery): boolean {
  if (query.domain !== 'all' && track.domain !== query.domain) return false;
  const needle = normalize(query.search);
  if (!needle) return true;
  return normalize(track.callsign ?? '').includes(needle) || track.id.toLowerCase().includes(needle);
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** The value a column sorts by. `undefined` means "no value", which always sorts last. */
function sortValue(track: Track, key: SortKey, now: number): string | number | undefined {
  switch (key) {
    case 'callsign':
      return track.callsign?.trim() || undefined;
    case 'type':
      return PLATFORM_LABEL[track.platform];
    case 'speed':
      return track.speedMps;
    case 'altitude':
      return track.altitudeM;
    case 'age':
      return now - track.observedAt;
  }
}

/**
 * Order two tracks for the list. Missing values go last whichever way the
 * column is sorted (a ship has no altitude, which isn't "lowest"). Ties fall
 * back to the track id, so equal rows don't swap places on every update.
 */
export function compareTracks(a: Track, b: Track, key: SortKey, dir: SortDir, now: number): number {
  const va = sortValue(a, key, now);
  const vb = sortValue(b, key, now);
  if (va === undefined || vb === undefined) {
    if (va !== vb) return va === undefined ? 1 : -1;
  } else {
    const order =
      typeof va === 'string' && typeof vb === 'string' ? collator.compare(va, vb) : Number(va) - Number(vb);
    if (order !== 0) return dir === 'asc' ? order : -order;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The rows to show: filtered, then sorted. */
export function queryTracks(tracks: Iterable<Track>, query: TrackQuery, now: number): Track[] {
  const rows: Track[] = [];
  for (const track of tracks) if (matchesQuery(track, query)) rows.push(track);
  return rows.sort((a, b) => compareTracks(a, b, query.sort, query.dir, now));
}
