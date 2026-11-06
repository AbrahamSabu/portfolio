import type { Track } from '@watchfloor/shared';
import type { Climb, ClimbRates } from './climb';

/** One aircraft the score may give a note to. */
export interface AircraftVoice {
  id: string;
  altitudeM: number | undefined;
  climb: Climb;
  /** Where across the screen it is: -1 at the left edge, 1 at the right. */
  pan: number;
}

/** What the score hears: the live picture on screen, counted. */
export interface PictureSummary {
  aircraft: number;
  ships: number;
  /** Ships making way: faster than 1 m/s, about 2 knots. */
  shipsUnderWay: number;
  climbing: number;
  descending: number;
  /** A fair sample of the aircraft in view, each with its place on screen. */
  voices: AircraftVoice[];
}

export const QUIET: PictureSummary = { aircraft: 0, ships: 0, shipsUnderWay: 0, climbing: 0, descending: 0, voices: [] };

/** The screen, as the score needs it. */
export interface ScreenView {
  /** Whether a position is on screen (and on the side of the globe facing the viewer). */
  contains(lon: number, lat: number): boolean;
  /** Where across the screen a position is, -1 (left edge) to 1 (right edge). */
  across(lon: number, lat: number): number;
}

/** Enough aircraft to choose notes from; sampling more would only cost time. */
export const MAX_VOICES = 48;
const UNDER_WAY_MPS = 1;

/**
 * One pass over the picture: count what is live, shown and on screen, keep
 * each aircraft's climb rate current, and pick a fair sample of aircraft to
 * play notes. Reservoir sampling gives every aircraft in view the same
 * chance, whatever order the store keeps them in.
 */
export function summarise(
  tracks: Iterable<Track>,
  counts: (track: Track) => boolean,
  view: ScreenView,
  climbs: ClimbRates,
  now: number,
  random: () => number,
): PictureSummary {
  let aircraft = 0;
  let ships = 0;
  let shipsUnderWay = 0;
  let climbing = 0;
  let descending = 0;
  const sample: { track: Track; climb: Climb }[] = [];
  for (const track of tracks) {
    if (!counts(track) || !view.contains(track.lon, track.lat)) continue;
    if (track.domain === 'sea') {
      ships++;
      if (track.speedMps > UNDER_WAY_MPS) shipsUnderWay++;
      continue;
    }
    aircraft++;
    climbs.observe(track.id, track.altitudeM, track.observedAt, now);
    const climb = climbs.climbOf(track.id);
    if (climb === 'climbing') climbing++;
    else if (climb === 'descending') descending++;
    if (sample.length < MAX_VOICES) sample.push({ track, climb });
    else {
      const slot = Math.floor(random() * aircraft);
      if (slot < MAX_VOICES) sample[slot] = { track, climb };
    }
  }
  climbs.prune(now);
  const voices = sample.map(({ track, climb }) => ({
    id: track.id,
    altitudeM: track.altitudeM,
    climb,
    pan: Math.max(-1, Math.min(1, view.across(track.lon, track.lat))),
  }));
  return { aircraft, ships, shipsUnderWay, climbing, descending, voices };
}
