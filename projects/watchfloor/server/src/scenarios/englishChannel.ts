import type { Scenario } from './types';

/**
 * The English Channel and Dover Strait: one of the busiest sea areas in the
 * world, under a busy air corridor. Coordinates are hand-placed to keep ships
 * at sea; shipping lanes follow the real separation scheme (north-east bound
 * on the French side, south-west bound on the English side).
 */
export const englishChannel: Scenario = {
  id: 'english-channel',
  name: 'English Channel',
  center: { lat: 50.45, lon: -0.85 },
  zoom: 7,
  bounds: { south: 49.3, west: -4.5, north: 51.6, east: 2.8 },

  shippingLanes: [
    {
      name: 'North-east bound',
      points: [
        { lat: 49.75, lon: -4.7 },
        { lat: 49.95, lon: -2.5 },
        { lat: 50.05, lon: -1.0 },
        { lat: 50.2, lon: 0.2 },
        { lat: 50.55, lon: 1.2 },
        { lat: 50.95, lon: 1.55 },
        { lat: 51.3, lon: 2.1 },
        { lat: 51.55, lon: 2.95 },
      ],
    },
    {
      name: 'South-west bound',
      points: [
        { lat: 51.65, lon: 2.6 },
        { lat: 51.35, lon: 1.85 },
        { lat: 51.05, lon: 1.42 },
        { lat: 50.75, lon: 1.0 },
        { lat: 50.45, lon: 0.0 },
        { lat: 50.3, lon: -1.2 },
        { lat: 50.1, lon: -2.6 },
        { lat: 49.95, lon: -4.7 },
      ],
    },
  ],

  ferryRoutes: [
    {
      name: 'Dover – Calais',
      points: [
        { lat: 51.11, lon: 1.35 },
        { lat: 51.05, lon: 1.55 },
        { lat: 50.99, lon: 1.8 },
        { lat: 50.975, lon: 1.845 },
      ],
    },
    {
      name: 'Newhaven – Dieppe',
      points: [
        { lat: 50.775, lon: 0.06 },
        { lat: 50.7, lon: 0.12 },
        { lat: 49.96, lon: 1.04 },
        { lat: 49.935, lon: 1.08 },
      ],
    },
    {
      name: 'Portsmouth – Cherbourg',
      points: [
        { lat: 50.785, lon: -1.11 },
        { lat: 50.75, lon: -1.05 },
        { lat: 50.7, lon: -0.95 },
        { lat: 50.4, lon: -1.2 },
        { lat: 49.69, lon: -1.6 },
      ],
    },
  ],

  fishingAreas: [
    { south: 50.0, west: -2.0, north: 50.35, east: -1.4 },
    { south: 49.9, west: -0.8, north: 50.4, east: -0.1 },
    { south: 50.35, west: 0.6, north: 50.72, east: 1.2 },
  ],
  leisureAreas: [
    { south: 50.6, west: -0.45, north: 50.76, east: 0.1 },
    { south: 49.72, west: -1.8, north: 49.9, east: -1.3 },
    { south: 50.5, west: -1.9, north: 50.62, east: -1.5 },
  ],
  navalPatrolAreas: [
    { south: 49.95, west: -2.2, north: 50.3, east: -0.8 },
    { south: 50.3, west: 0.3, north: 50.65, east: 1.2 },
  ],
  helicopterAreas: [
    { south: 50.6, west: -1.5, north: 50.95, east: -0.6 },
    { south: 50.85, west: 1.0, north: 51.2, east: 1.6 },
  ],
  lightAircraftAreas: [
    { south: 50.7, west: -1.0, north: 51.2, east: 0.4 },
    { south: 49.3, west: -1.6, north: 49.7, east: -0.6 },
  ],
  patrolRacetracks: [
    { a: { lat: 50.05, lon: -2.4 }, b: { lat: 50.3, lon: -0.2 }, altitudeM: 5500 },
  ],
  uavOrbits: [{ center: { lat: 50.15, lon: 0.6 }, radiusM: 9000, altitudeM: 3600 }],
  // Heathrow's four holding stacks, at their real fixes (the Bovingdon,
  // Lambourne, Ockham and Biggin Hill beacons), 7,000 to 13,000 ft. The
  // racetracks are this simulation's own, inbound legs pointing at
  // Heathrow, not the published patterns. Off the bottom, arrivals join a
  // westerly approach from over central London.
  holds: [
    { name: 'BNN', fix: { lat: 51.726, lon: -0.55 }, inboundDeg: 165 },
    { name: 'LAM', fix: { lat: 51.646, lon: 0.152 }, inboundDeg: 245 },
    { name: 'OCK', fix: { lat: 51.305, lon: -0.447 }, inboundDeg: 0 },
    { name: 'BIG', fix: { lat: 51.331, lon: 0.035 }, inboundDeg: 295 },
  ].map((h) => ({
    ...h,
    rightHand: true,
    floorM: 2133.6,
    topM: 3962.4,
    exit: [
      { lat: 51.475, lon: -0.18 },
      { lat: 51.47, lon: -0.454 },
    ],
  })),

  population: {
    airliner: 22,
    'light-aircraft': 4,
    helicopter: 2,
    'military-helicopter': 1,
    'maritime-patrol': 1,
    uav: 1,
    holding: 12,
    cargo: 18,
    tanker: 8,
    ferry: 6,
    fishing: 12,
    leisure: 8,
    warship: 2,
  },
};
