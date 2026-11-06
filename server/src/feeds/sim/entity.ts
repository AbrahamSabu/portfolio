import type { Affiliation, BBox, Domain, LatLon, Platform } from '@watchfloor/shared';

/** How an entity decides where to go next. */
export type Behaviour =
  | {
      kind: 'route';
      points: LatLon[];
      /** Index of the waypoint currently being steered towards. */
      next: number;
      /** once: finish and leave. loop: circuit forever. pingpong: shuttle, pausing at each end. */
      mode: 'once' | 'loop' | 'pingpong';
      dwellAtEndsMs?: [number, number];
    }
  | { kind: 'orbit'; center: LatLon; radiusM: number; clockwise: boolean }
  | {
      kind: 'hold';
      /** The racetrack's corners in flying order, starting at the fix. */
      points: LatLon[];
      next: number;
      /** A level (1,000 ft) lower after each lap, down to this. */
      floorM: number;
      /** Off the bottom of the stack: these points, once, then landed. */
      exit: LatLon[];
    }
  | {
      kind: 'loiter';
      area: BBox;
      target: LatLon;
      /** Chance of stopping for a while on reaching each target (fishing, hovering). */
      dwellChance: number;
      dwellMs: [number, number];
    };

/** A simulated vehicle. Lives only inside the simulator; the outside world sees Tracks. */
export interface SimEntity {
  id: string;
  archetype: string;
  domain: Domain;
  platform: Platform;
  affiliation: Affiliation;
  callsign?: string;
  /** ICAO type designator, for the few simulated types that carry one (rare types). */
  typeCode?: string;

  pos: LatLon;
  courseDeg: number;
  speedMps: number;
  altitudeM?: number;

  // Performance envelope
  speedRangeMps: [number, number];
  cruiseSpeedMps: number;
  altitudeRangeM?: [number, number];
  targetAltitudeM?: number;
  maxTurnRateDps: number;
  accelMps2: number;
  climbRateMps: number;

  behaviour: Behaviour;
  /** ms epoch; while now < dwellUntil the entity slows to a stop and holds position. */
  dwellUntil: number;

  // Reporting
  reportIntervalMs: [number, number];
  nextReportAt: number;
  /** ms epoch; simulated transponder dropout. No reports until then. */
  silentUntil: number;

  /** Set when the entity has left the scenario and should be replaced. */
  done: boolean;
}
