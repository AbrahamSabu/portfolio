import type { BBox, LatLon } from '@watchfloor/shared';

export interface Route {
  name: string;
  /** A point may carry its own spread: how far ships wander off it (degrees), tight in a strait, wide at sea. */
  points: (LatLon & { spreadDeg?: number })[];
  /** How likely a ship is to take this lane rather than another (default 1). */
  weight?: number;
}

/**
 * Where one of the rare types flies: between two different sites of these
 * each time (factories, bases), or round one of these orbits.
 */
export interface Mission {
  sites?: LatLon[];
  orbits?: Orbit[];
}

/** An airport airliners fly between, weighted by how busy it is. */
export interface Airport {
  code: string;
  lat: number;
  lon: number;
  weight: number;
}

export interface Racetrack {
  a: LatLon;
  b: LatLon;
  altitudeM: number;
}

export interface Orbit {
  center: LatLon;
  radiusM: number;
  altitudeM: number;
}

/**
 * Geography the simulator needs to produce believable traffic for one area.
 * Ships only ever move along lanes, routes and areas defined here, which is
 * how they stay off land without the simulator needing coastline data.
 */
export interface Scenario {
  id: string;
  name: string;
  center: LatLon;
  zoom: number;
  /** Air traffic enters and leaves through the edges of this box, unless there are airports. */
  bounds: BBox;
  /** When set, airliners fly between these instead of crossing the box: a world needs real routes. */
  airports?: Airport[];
  /** Directional shipping lanes; ships traverse them start to end. */
  shippingLanes: Route[];
  /** Port-to-port routes; ferries shuttle back and forth. */
  ferryRoutes: Route[];
  fishingAreas: BBox[];
  leisureAreas: BBox[];
  navalPatrolAreas: BBox[];
  helicopterAreas: BBox[];
  lightAircraftAreas: BBox[];
  patrolRacetracks: Racetrack[];
  uavOrbits: Orbit[];
  /** Rare types' routes and orbits, by archetype (beluga-xl, awacs...); a type with none isn't simulated. */
  missions?: Partial<Record<string, Mission>>;
  /** How many of each archetype to keep alive. */
  population: Partial<Record<string, number>>;
}
