import type { Track } from '@watchfloor/shared';
import type { Airport } from '../map/airports';
import { CHOKEPOINTS, type Chokepoint } from './chokepoints';
import type { Region } from './regions';

export type PaletteMatch =
  | { kind: 'track'; track: Track }
  | { kind: 'airport'; airport: Airport }
  | { kind: 'chokepoint'; chokepoint: Chokepoint }
  | { kind: 'area'; area: Region };

export interface PaletteSources {
  tracks: Iterable<Track>;
  airports: readonly Airport[];
  areas: readonly Region[];
}

/** How well `q` (lower case) matches a code: a callsign, an ICAO or IATA code. */
function codeScore(q: string, code: string | undefined): number {
  if (!code) return 0;
  const c = code.toLowerCase();
  if (c === q) return 100;
  if (c.startsWith(q)) return 70;
  return 0;
}

/** How well `q` matches a name: the whole name beats a word's start beats a substring. */
function nameScore(q: string, name: string | undefined): number {
  if (!name) return 0;
  const n = name.toLowerCase();
  if (n === q) return 90;
  if (n.startsWith(q)) return 60;
  if (n.includes(' ' + q)) return 55;
  if (n.includes(q)) return 30;
  return 0;
}

/** On a tied score, the live picture first and the fixed furniture last. */
const KIND_ORDER: Record<PaletteMatch['kind'], number> = { track: 0, airport: 1, chokepoint: 2, area: 3 };

/**
 * One search over everything with a place on the map: tracks by callsign,
 * squawk, type code or model; airports by code and name; the eight
 * chokepoints; the operator's watch areas. Codes beat names and prefixes
 * beat substrings, so "DUB" finds Dublin Airport before a callsign that
 * merely starts with it, and "7700" finds whoever is squawking it.
 */
export function searchPalette(query: string, sources: PaletteSources, limit = 10): PaletteMatch[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const found: { score: number; title: string; match: PaletteMatch }[] = [];
  for (const track of sources.tracks) {
    const score = Math.max(
      codeScore(q, track.callsign),
      track.squawk === q ? 100 : 0,
      // A type or model search ("A388", "boeing") ranks under the same text as a callsign.
      codeScore(q, track.typeCode) - 10,
      nameScore(q, track.model) - 10,
    );
    if (score > 0) found.push({ score, title: track.callsign ?? track.id, match: { kind: 'track', track } });
  }
  for (const airport of sources.airports) {
    const score = Math.max(
      codeScore(q, airport.code),
      codeScore(q, airport.iata),
      nameScore(q, airport.name),
      nameScore(q, airport.city) - 5,
    );
    if (score > 0) found.push({ score, title: airport.name, match: { kind: 'airport', airport } });
  }
  for (const chokepoint of CHOKEPOINTS) {
    const score = Math.max(nameScore(q, chokepoint.name), nameScore(q, chokepoint.short));
    if (score > 0) found.push({ score, title: chokepoint.name, match: { kind: 'chokepoint', chokepoint } });
  }
  for (const area of sources.areas) {
    const score = nameScore(q, area.name);
    if (score > 0) found.push({ score, title: area.name, match: { kind: 'area', area } });
  }
  found.sort(
    (a, b) =>
      b.score - a.score ||
      KIND_ORDER[a.match.kind] - KIND_ORDER[b.match.kind] ||
      a.title.length - b.title.length ||
      a.title.localeCompare(b.title),
  );
  return found.slice(0, limit).map((f) => f.match);
}
