import type { Hazard, NewsItem, Track } from '@watchfloor/shared';
import { briefing } from './briefing';
import { centreOf, CHOKEPOINTS, type ChokepointCount } from './chokepoints';
import type { Emergency } from './emergencies';
import { isSignificant } from './hazards';

export interface TourStop {
  title: string;
  center: [number, number];
  zoom: number;
}

export interface TourWorld {
  emergencies: readonly Emergency[];
  trackOf: (id: string) => Track | undefined;
  hazards: readonly Hazard[];
  news: readonly NewsItem[];
  /** Live ships in each chokepoint, by its id (state/chokepoints.ts). */
  shipsIn: ReadonlyMap<string, ChokepointCount>;
  now: number;
}

const MAX_HAZARDS = 3;
const MAX_STORIES = 4;
const MAX_CHOKEPOINTS = 3;

/**
 * Where the tour goes, most urgent first: every live emergency squawk, the
 * latest significant hazards, the briefing's top stories, then the busiest
 * chokepoints. The list is rebuilt at every stop, so a squawk that starts
 * mid-tour joins the next lap at its head.
 */
export function tourStops(world: TourWorld): TourStop[] {
  const stops: TourStop[] = [];
  for (const e of world.emergencies) {
    const track = world.trackOf(e.id);
    if (track) stops.push({ title: `Squawk ${e.squawk} · ${track.callsign ?? 'no callsign'}`, center: [track.lon, track.lat], zoom: 7 });
  }
  const significant = world.hazards.filter(isSignificant).sort((a, b) => b.time - a.time);
  for (const h of significant.slice(0, MAX_HAZARDS)) stops.push({ title: h.title, center: [h.lon, h.lat], zoom: 5 });
  for (const entry of briefing(world.news, world.now, MAX_STORIES)) {
    stops.push({ title: entry.story.headline, center: [entry.story.lon, entry.story.lat], zoom: 4 });
  }
  const busiest = CHOKEPOINTS.map((c) => ({ c, ships: world.shipsIn.get(c.id)?.ships ?? 0 }))
    .filter((x) => x.ships > 0)
    .sort((a, b) => b.ships - a.ships);
  for (const { c, ships } of busiest.slice(0, MAX_CHOKEPOINTS)) {
    stops.push({ title: `${c.name} · ${ships} ship${ships === 1 ? '' : 's'}`, center: centreOf(c.box), zoom: 8 });
  }
  return stops;
}
