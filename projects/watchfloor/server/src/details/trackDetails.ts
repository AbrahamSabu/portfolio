import { flagCountry, registrationCountry, type Platform, type ShipDetails, type Track, type TrackDetails } from '@watchfloor/shared';
import type { AircraftInfo } from '../feeds/adsb/aircraftDb';
import { airlineFor, type Airlines } from '../feeds/adsb/airlines';

/** Where the details come from; each is optional, and missing ones just leave fields out. */
export interface DetailsSources {
  aircraft?: (icao24: string) => AircraftInfo | undefined;
  airlines?: Airlines;
  ships?: (mmsi: string) => ShipDetails | undefined;
}

const MILITARY_PLATFORMS: ReadonlySet<Platform> = new Set([
  'military-aircraft',
  'military-helicopter',
  'maritime-patrol',
  'warship',
]);

/**
 * Everything we can say about one track beyond what the map draws. Pure: the
 * country comes from the id (ICAO address block or MMSI), the rest from the
 * reference data the server has loaded.
 */
export function trackDetails(track: Track, sources: DetailsSources): TrackDetails {
  const native = track.id.slice(track.id.indexOf(':') + 1);
  const details: TrackDetails = {};
  if (track.source === 'adsb') {
    const country = registrationCountry(native);
    if (country) details.country = country;
    const info = sources.aircraft?.(native);
    if (info?.private) details.private = true;
    // A private aircraft's callsign may still name its operator, but we say no more than the map does.
    const airline = info?.private ? undefined : sources.airlines && airlineFor(track.callsign, sources.airlines);
    if (airline) details.airline = airline;
    if (info?.military || MILITARY_PLATFORMS.has(track.platform)) details.military = true;
  } else if (track.source === 'ais') {
    const country = flagCountry(native);
    if (country) details.country = country;
    const ship = sources.ships?.(native);
    if (ship) details.ship = ship;
    // Type 35: the ship itself says it's on military operations.
    if (track.platform === 'warship') details.military = true;
  }
  return details;
}
