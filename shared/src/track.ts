/**
 * The one data shape every part of the system agrees on.
 *
 * Feeds (simulator, ADS-B, AIS…) translate whatever they receive into a Track.
 * The server stores and forwards Tracks; the client draws them. Nothing
 * downstream of a feed should need to know where a track came from.
 */

/** Which environment the track moves through. Drives symbology and staleness. */
export type Domain = 'air' | 'sea';

/** Standard identity, as used by MIL-STD-2525 / APP-6 symbology. */
export type Affiliation = 'friend' | 'hostile' | 'neutral' | 'unknown' | 'pending';

/** Where a report came from. Prefixes the track id so ids never collide across feeds. */
export type TrackSource = 'sim' | 'adsb' | 'ais';

/** What kind of platform this is, as far as we know. A closed list keeps symbology predictable. */
export type Platform =
  // air
  | 'airliner'
  | 'light-aircraft'
  | 'helicopter'
  | 'military-helicopter'
  | 'maritime-patrol'
  | 'uav'
  | 'aircraft' // known to be airborne, type unknown
  // sea
  | 'cargo'
  | 'tanker'
  | 'passenger'
  | 'fishing'
  | 'leisure'
  | 'warship'
  | 'vessel'; // on the water, type unknown

export interface Track {
  /** Globally unique and stable: `${source}:${nativeId}`, e.g. `adsb:4ca7b3`. */
  id: string;
  source: TrackSource;
  domain: Domain;
  platform: Platform;
  affiliation: Affiliation;
  /** Flight callsign or vessel name, if broadcast. */
  callsign?: string;
  /** WGS84 degrees. */
  lat: number;
  lon: number;
  /** Metres above mean sea level. Air tracks only. */
  altitudeM?: number;
  /** Course over ground, degrees true, [0, 360). */
  courseDeg: number;
  /** Speed over ground, metres per second. */
  speedMps: number;
  /** When this position was observed, ms since epoch (source time, not receive time). */
  observedAt: number;
}

export function makeTrackId(source: TrackSource, nativeId: string): string {
  return `${source}:${nativeId}`;
}
