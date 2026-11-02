import type { Finding, Hazard, NewsItem, Track } from '@watchfloor/shared';
import { briefing } from './briefing';
import { centreOf, CHOKEPOINTS, type ChokepointCount } from './chokepoints';
import type { Emergency } from './emergencies';
import { FINDING_LABEL } from './findings';
import { isSignificant } from './hazards';

export interface TourStop {
  title: string;
  center: [number, number];
  zoom: number;
  /** Select and ride along with this track while dwelling. */
  trackId?: string;
  /** How long to hold after the camera settles; following gets longer. */
  dwellMs?: number;
}

export interface TourWorld {
  emergencies: readonly Emergency[];
  trackOf: (id: string) => Track | undefined;
  /** Live (not stale) tracks: candidates to follow. */
  tracks: readonly Track[];
  hazards: readonly Hazard[];
  /** The watchers' observations: circling, converging, gone silent. */
  findings: readonly Finding[];
  news: readonly NewsItem[];
  /** Live ships in each chokepoint, by its id (state/chokepoints.ts). */
  shipsIn: ReadonlyMap<string, ChokepointCount>;
  now: number;
  /** For the military picks, so each lap follows someone new. Injectable for tests. */
  random?: () => number;
}

const MAX_MILITARY = 2;
const MAX_FINDINGS = 2;
const MAX_HAZARDS = 3;
const MAX_STORIES = 4;
const MAX_CHOKEPOINTS = 3;
/** Riding along with a flight is the good part: hold it longer than a glance at a place. */
const FOLLOW_MS = 15_000;
/** Worth calling the fastest: about 490 kn, faster than airliners cruise. */
const FAST_MPS = 252;
/** Above this (about 780 kn) it's almost certainly a glitched report, not a record. */
const FAST_MAX_MPS = 400;
/** Worth calling the highest: above the airliners' ceiling. */
const HIGH_M = 12_500;
/** Above 20 km the report is almost certainly wrong (sorry, U-2). */
const HIGH_MAX_M = 20_000;

const MILITARY = new Set(['military-aircraft', 'maritime-patrol', 'uav', 'warship']);

const name = (t: Track) => t.callsign ?? (t.id.split(':')[1] ?? t.id).toUpperCase();

function followStop(t: Track, title: string, zoom = 8.5): TourStop {
  return { title, center: [t.lon, t.lat], zoom, trackId: t.id, dwellMs: FOLLOW_MS };
}

/** Military and record-holding tracks to ride along with, freshly drawn each lap. */
function follows(world: TourWorld): TourStop[] {
  const random = world.random ?? Math.random;
  const stops: TourStop[] = [];
  const taken = new Set<string>();
  const military = world.tracks.filter((t) => MILITARY.has(t.platform));
  for (let i = 0; i < MAX_MILITARY && military.length > 0; i++) {
    const [t] = military.splice(Math.floor(random() * military.length), 1);
    if (!t) break;
    taken.add(t.id);
    if (t.platform === 'warship') stops.push(followStop(t, `Warship · ${name(t)}`, 10));
    else stops.push(followStop(t, ['Military flight', name(t), t.model].filter(Boolean).join(' · ')));
  }
  let fastest: Track | undefined;
  let highest: Track | undefined;
  for (const t of world.tracks) {
    if (t.domain !== 'air' || taken.has(t.id)) continue;
    if (t.speedMps >= FAST_MPS && t.speedMps <= FAST_MAX_MPS && t.speedMps > (fastest?.speedMps ?? 0)) fastest = t;
    const alt = t.altitudeM ?? 0;
    if (alt >= HIGH_M && alt <= HIGH_MAX_M && alt > (highest?.altitudeM ?? 0)) highest = t;
  }
  if (fastest) stops.push(followStop(fastest, `Fastest aloft · ${name(fastest)} · ${Math.round(fastest.speedMps * 1.94384)} kn`));
  if (highest && highest !== fastest) {
    stops.push(followStop(highest, `Highest aloft · ${name(highest)} · FL${Math.round(((highest.altitudeM ?? 0) * 3.28084) / 100)}`));
  }
  return stops;
}

/**
 * The watchers' findings as stops: ride along with whatever is circling or
 * converging; a ghost gets a visit to its last-known position. Newest first,
 * live circling and converging before the silent ships.
 */
function findingStops(world: TourWorld): TourStop[] {
  const sorted = [...world.findings].sort((a, b) => Number(a.kind === 'dark') - Number(b.kind === 'dark') || b.since - a.since);
  const stops: TourStop[] = [];
  for (const f of sorted.slice(0, MAX_FINDINGS)) {
    const title = `${FINDING_LABEL[f.kind]} · ${f.name}`;
    const track = f.kind === 'dark' ? undefined : world.trackOf(f.tracks[0]!);
    if (track) stops.push(followStop(track, title, f.kind === 'converging' ? 7.5 : 9));
    else stops.push({ title, center: [f.lon, f.lat], zoom: 9 });
  }
  return stops;
}

/**
 * Where the tour goes. Emergencies always lead; after them the categories
 * take turns — a watcher's finding, someone to ride along with (a military flight, a warship,
 * the fastest or highest thing aloft), a fresh significant hazard, a top
 * story, a busy chokepoint — so the show alternates between flying with
 * tracks and visiting places instead of reading the news in a block. The
 * list is rebuilt at every stop, and the military picks are random, so no
 * two laps are the same.
 */
export function tourStops(world: TourWorld): TourStop[] {
  const stops: TourStop[] = [];
  for (const e of world.emergencies) {
    const track = world.trackOf(e.id);
    if (track) stops.push({ ...followStop(track, `Squawk ${e.squawk} · ${track.callsign ?? 'no callsign'}`, 7) });
  }
  const significant = world.hazards.filter(isSignificant).sort((a, b) => b.time - a.time);
  const busiest = CHOKEPOINTS.map((c) => ({ c, ships: world.shipsIn.get(c.id)?.ships ?? 0 }))
    .filter((x) => x.ships > 0)
    .sort((a, b) => b.ships - a.ships);
  const pools: TourStop[][] = [
    findingStops(world),
    follows(world),
    significant.slice(0, MAX_HAZARDS).map((h) => ({ title: h.title, center: [h.lon, h.lat] as [number, number], zoom: 5 })),
    briefing(world.news, world.now, MAX_STORIES).map((entry) => ({
      title: entry.story.headline,
      center: [entry.story.lon, entry.story.lat] as [number, number],
      zoom: 4,
    })),
    busiest.slice(0, MAX_CHOKEPOINTS).map(({ c, ships }) => ({
      title: `${c.name} · ${ships} ship${ships === 1 ? '' : 's'}`,
      center: centreOf(c.box),
      zoom: 8,
    })),
  ];
  for (let i = 0; pools.some((p) => i < p.length); i++) for (const pool of pools) if (pool[i]) stops.push(pool[i]!);
  return stops;
}
