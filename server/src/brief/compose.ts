import type { Finding, Hazard, Track } from '@watchfloor/shared';

/**
 * The handover brief's sentences, composed when each thing happens, from the
 * facts in hand at that moment. Every line is traceable to data the server
 * held; none speculates about why.
 */

/** "51.2°N 3.4°E": enough to say where without pretending precision. */
export function place(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`;
}

export function findingStarted(f: Finding): string {
  switch (f.kind) {
    case 'circling':
      return `${f.name} seen circling near ${place(f.lat, f.lon)} (${f.detail}).`;
    case 'dark':
      return `AIS contact with ${f.name} lost near ${place(f.lat, f.lon)} (${f.detail.replace('AIS contact lost · ', '')}).`;
    case 'converging':
      return `Military aircraft converging: ${f.name} (${f.detail}).`;
    case 'rare':
      return `Rare sighting: ${f.name} near ${place(f.lat, f.lon)} (${f.detail}).`;
  }
}

/** Null: this ending isn't an event (a ghost fading from the list is bookkeeping). */
export function findingEnded(f: Finding, time: number, resolved: boolean): string | null {
  const minutes = Math.max(1, Math.round((time - f.since) / 60_000));
  switch (f.kind) {
    case 'circling':
      return `${f.name} no longer circling (seen for ${minutes} min).`;
    case 'dark':
      return resolved ? `${f.name} is transmitting again (silent for ${minutes} min).` : null;
    case 'converging':
      return `No longer converging: ${f.name}.`;
    case 'rare':
      return null; // flying on out of coverage isn't news; the sighting was
  }
}

export function squawkStarted(track: Track, meaning: string): string {
  const name = track.callsign ?? track.id.split(':')[1]!.toUpperCase();
  return `${name} began squawking ${track.squawk} (${meaning}) near ${place(track.lat, track.lon)}.`;
}

export function squawkEnded(name: string, squawk: string, sinceMs: number): string {
  return `${name} no longer squawking ${squawk} (after ${Math.max(1, Math.round(sinceMs / 60_000))} min).`;
}

/** Only hazards big enough for the brief: a strong quake, or GDACS's orange or red. */
export function significantHazard(h: Hazard): boolean {
  return (h.magnitude ?? 0) >= 6 || h.alert === 'orange' || h.alert === 'red';
}

/** The source's own title, credited. */
export function hazardSeen(h: Hazard): string {
  return `${h.title} (${h.source === 'usgs' ? 'USGS' : 'GDACS'}).`;
}
