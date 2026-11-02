import type { Scenario } from './types';

/**
 * Cork and the south coast of Ireland: Cork, Kerry and Waterford, the Celtic
 * Sea approaches and the transatlantic traffic overhead. A live-only area:
 * the simulator has no lanes or routes here (its population is empty), so it
 * refuses to run on it rather than inventing traffic on land.
 */
export const cork: Scenario = {
  id: 'cork',
  name: 'Cork',
  center: { lat: 51.75, lon: -8.4 },
  zoom: 8,
  bounds: { south: 50.8, west: -10.8, north: 52.6, east: -6.0 },

  shippingLanes: [],
  ferryRoutes: [],
  fishingAreas: [],
  leisureAreas: [],
  navalPatrolAreas: [],
  helicopterAreas: [],
  lightAircraftAreas: [],
  patrolRacetracks: [],
  uavOrbits: [],
  population: {},
};
