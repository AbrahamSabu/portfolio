import type { BBox, LatLon } from '@watchfloor/shared';

export interface Route {
  name: string;
  points: LatLon[];
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
  /** Air traffic enters and leaves through the edges of this box. */
  bounds: BBox;
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
  /** How many of each archetype to keep alive. */
  population: Partial<Record<string, number>>;
}
