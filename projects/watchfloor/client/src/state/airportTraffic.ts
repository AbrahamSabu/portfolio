import { bearingDeg, distanceM, headingDelta, type LatLon, type Track } from '@watchfloor/shared';

/** Close enough to be arriving or leaving: about 20 nm, and below 3,000 m (10,000 ft). */
export const NEAR_M = 40_000;
export const LOW_M = 3_000;

export interface NearbyAircraft {
  track: Track;
  distanceM: number;
}

export interface AirportTraffic {
  inbound: NearbyAircraft[];
  outbound: NearbyAircraft[];
  /** Low and close but crossing: circling, in the pattern, or passing by. */
  nearby: NearbyAircraft[];
}

/**
 * The aircraft around an airport now, from the live picture: not a
 * timetable (that data isn't free). Low and close aircraft pointing at the
 * airport (within 60° of it) are inbound, pointing away (more than 120°)
 * outbound; the rest are nearby. Aircraft on the ground aren't tracked, so
 * a departure shows once it's airborne. Nearest first.
 */
export function airportTraffic(airport: LatLon, tracks: Iterable<Track>): AirportTraffic {
  const traffic: AirportTraffic = { inbound: [], outbound: [], nearby: [] };
  for (const track of tracks) {
    if (track.domain !== 'air' || (track.altitudeM !== undefined && track.altitudeM > LOW_M)) continue;
    const d = distanceM(track, airport);
    if (d > NEAR_M) continue;
    const off = Math.abs(headingDelta(track.courseDeg, bearingDeg(track, airport)));
    // Right over the field, the bearing to it means little: count it as nearby.
    const list = d < 1_500 ? traffic.nearby : off < 60 ? traffic.inbound : off > 120 ? traffic.outbound : traffic.nearby;
    list.push({ track, distanceM: d });
  }
  for (const list of Object.values(traffic) as NearbyAircraft[][]) list.sort((a, b) => a.distanceM - b.distanceM);
  return traffic;
}
