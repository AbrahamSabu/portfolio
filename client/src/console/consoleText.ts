import { isRoomCode, normalizeRoomCode, type RoomClosedReason, type Track, type TrackDetails } from '@watchfloor/shared';
import {
  AFFILIATION_LABEL,
  PLATFORM_LABEL,
  formatAge,
  formatAircraftType,
  formatAltitude,
  formatCourse,
  formatDestination,
  formatLat,
  formatLon,
  formatShipType,
  formatSource,
  formatSpeed,
} from '../ui/format';

/** The room code in the console's link (`?room=K7QX`), if it is a valid one. */
export function codeFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('room');
  if (!raw) return null;
  const code = normalizeRoomCode(raw);
  return isRoomCode(code) ? code : null;
}

/** What the join screen says when the server turns the console away. */
export const REFUSAL: Record<RoomClosedReason, string> = {
  'not-found': "There's no room with that code. Check the main screen: Q shows it there.",
  full: 'That room is full.',
  busy: 'Too many wrong codes were tried just now. Try again in a minute.',
  closed: 'The room has closed.',
};

/** A list row's numbers: altitude and speed in the air, speed and course at sea. */
export function rowFacts(track: Track): string {
  return track.domain === 'air'
    ? `${formatAltitude(track.altitudeM)} · ${formatSpeed(track.speedMps)}`
    : `${formatSpeed(track.speedMps)} · ${formatCourse(track.courseDeg)}`;
}

/** What it is: an aircraft's type when known, a ship's AIS type once its details say, else the platform. */
export function trackKind(track: Track, details?: TrackDetails): string {
  if (track.domain === 'air') return formatAircraftType(track) || PLATFORM_LABEL[track.platform];
  return formatShipType(details?.ship?.aisType) || PLATFORM_LABEL[track.platform];
}

/**
 * The details card's rows, label and value, empty ones left out. The
 * source row is the honesty device: "Simulator" for invented traffic.
 */
export function detailFacts(track: Track, details: TrackDetails | undefined, stale: boolean, now: number): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (track.domain === 'air') {
    rows.push(['Altitude', formatAltitude(track.altitudeM)]);
    rows.push(['Speed', formatSpeed(track.speedMps)]);
    rows.push(['Heading', formatCourse(track.courseDeg)]);
    if (track.squawk) rows.push(['Squawk', track.squawk]);
  } else {
    rows.push(['Speed', formatSpeed(track.speedMps)]);
    rows.push(['Course', formatCourse(track.courseDeg)]);
    const destination = formatDestination(details?.ship);
    if (destination) rows.push(['Destination', destination]);
  }
  rows.push(['Identity', AFFILIATION_LABEL[track.affiliation]]);
  if (details?.airline) rows.push(['Airline', details.airline]);
  if (details?.country) rows.push([track.domain === 'sea' ? 'Flag' : 'Registered in', details.country]);
  rows.push(['Position', `${formatLat(track.lat)} ${formatLon(track.lon)}`]);
  rows.push(['Source', formatSource(track)]);
  rows.push(['Last report', `${formatAge(now - track.observedAt)}${stale ? ', stale' : ''}`]);
  return rows;
}
