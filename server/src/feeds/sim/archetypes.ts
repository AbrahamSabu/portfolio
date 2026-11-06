import {
  bearingDeg,
  destination,
  distanceM,
  normalizeDeg,
  type Affiliation,
  type BBox,
  type Domain,
  type LatLon,
  type Platform,
} from '@watchfloor/shared';
import type { Airport, Scenario } from '../../scenarios';
import type { Hold, Orbit } from '../../scenarios/types';
import type { Behaviour, SimEntity } from './entity';
import { HOLD_LEVEL_M, randomPointIn } from './motion';
import { names, uniqueName } from './names';
import type { Rng } from './rng';

export interface SpawnContext {
  rng: Rng;
  scenario: Scenario;
  now: number;
  id: string;
  /** True at startup: place mid-journey so the picture is full immediately. */
  initial: boolean;
  /** Callsigns already in use by active entities; the new one must differ. */
  takenCallsigns: ReadonlySet<string>;
}

interface Profile {
  domain: Domain;
  platform: Platform;
  affiliation: Affiliation;
  speedRangeMps: [number, number];
  altitudeRangeM?: [number, number];
  maxTurnRateDps: number;
  accelMps2: number;
  climbRateMps: number;
  reportIntervalMs: [number, number];
  callsign: (rng: Rng) => string | undefined;
  /** ICAO type designator: only the rare types carry one, so the rare watcher can find them. */
  typeCode?: string;
}


const AIR_REPORT: [number, number] = [2000, 5000];
const SEA_REPORT: [number, number] = [6000, 15000];
/** A large jet's handling: gentle turns, slow climbs. */
const HEAVY = { maxTurnRateDps: 2, accelMps2: 1, climbRateMps: 6, reportIntervalMs: AIR_REPORT };

const PROFILES = {
  airliner: {
    domain: 'air', platform: 'airliner', affiliation: 'neutral',
    speedRangeMps: [215, 250], altitudeRangeM: [8500, 12000],
    maxTurnRateDps: 2.5, accelMps2: 1.5, climbRateMps: 8,
    reportIntervalMs: AIR_REPORT, callsign: names.airliner,
  },
  /** An arrival in a holding stack: an airliner at holding speed (about 220 kt), turning at rate one (3°/s). */
  holding: {
    domain: 'air', platform: 'airliner', affiliation: 'neutral',
    speedRangeMps: [108, 118],
    maxTurnRateDps: 3, accelMps2: 1.5, climbRateMps: 8,
    reportIntervalMs: AIR_REPORT, callsign: names.airliner,
  },
  'light-aircraft': {
    domain: 'air', platform: 'light-aircraft', affiliation: 'neutral',
    speedRangeMps: [45, 65], altitudeRangeM: [600, 2400],
    maxTurnRateDps: 6, accelMps2: 1, climbRateMps: 3,
    reportIntervalMs: AIR_REPORT, callsign: names.registration,
  },
  helicopter: {
    domain: 'air', platform: 'helicopter', affiliation: 'neutral',
    speedRangeMps: [45, 70], altitudeRangeM: [300, 900],
    maxTurnRateDps: 8, accelMps2: 1.5, climbRateMps: 4,
    reportIntervalMs: AIR_REPORT, callsign: names.registration,
  },
  'military-helicopter': {
    domain: 'air', platform: 'military-helicopter', affiliation: 'friend',
    speedRangeMps: [50, 75], altitudeRangeM: [150, 600],
    maxTurnRateDps: 8, accelMps2: 1.5, climbRateMps: 4,
    reportIntervalMs: AIR_REPORT, callsign: names.militaryAir,
  },
  'maritime-patrol': {
    domain: 'air', platform: 'maritime-patrol', affiliation: 'friend',
    speedRangeMps: [120, 150], altitudeRangeM: [5000, 6000],
    maxTurnRateDps: 3, accelMps2: 1, climbRateMps: 6,
    reportIntervalMs: AIR_REPORT, callsign: names.militaryAir,
  },
  uav: {
    domain: 'air', platform: 'uav', affiliation: 'unknown',
    speedRangeMps: [35, 45], altitudeRangeM: [3400, 3800],
    maxTurnRateDps: 5, accelMps2: 0.5, climbRateMps: 2,
    reportIntervalMs: [2000, 4000], callsign: () => undefined,
  },
  // The rare types: built in tiny numbers (rare.ts has the list), each flying
  // where it really works. Callsign prefixes are the operators' real ICAO
  // codes (BGA Airbus Transport International, GTI Atlas Air, ADB Antonov
  // Airlines, RCH US Air Mobility Command); the numbers are made up.
  'beluga-xl': {
    domain: 'air', platform: 'airliner', affiliation: 'neutral',
    speedRangeMps: [205, 220], altitudeRangeM: [8000, 10000], ...HEAVY,
    callsign: (rng: Rng) => `BGA${rng.int(101, 199)}`, typeCode: 'A337',
  },
  beluga: {
    domain: 'air', platform: 'airliner', affiliation: 'neutral',
    speedRangeMps: [200, 215], altitudeRangeM: [8000, 10000], ...HEAVY,
    callsign: (rng: Rng) => `BGA${rng.int(201, 299)}`, typeCode: 'A3ST',
  },
  dreamlifter: {
    domain: 'air', platform: 'airliner', affiliation: 'neutral',
    speedRangeMps: [235, 250], altitudeRangeM: [10500, 12000], ...HEAVY,
    callsign: (rng: Rng) => `GTI${rng.int(4100, 4199)}`, typeCode: 'BLCF',
  },
  'an-124': {
    domain: 'air', platform: 'airliner', affiliation: 'neutral',
    speedRangeMps: [215, 230], altitudeRangeM: [9000, 10500], ...HEAVY,
    callsign: (rng: Rng) => `ADB${rng.int(1001, 4999)}`, typeCode: 'A124',
  },
  'c-5': {
    domain: 'air', platform: 'military-aircraft', affiliation: 'friend',
    speedRangeMps: [220, 235], altitudeRangeM: [9000, 10500], ...HEAVY,
    callsign: (rng: Rng) => `RCH${rng.int(100, 999)}`, typeCode: 'C5M',
  },
  'b-52': {
    domain: 'air', platform: 'military-aircraft', affiliation: 'friend',
    speedRangeMps: [225, 240], altitudeRangeM: [10000, 12000], ...HEAVY,
    callsign: names.militaryAir, typeCode: 'B52',
  },
  awacs: {
    domain: 'air', platform: 'military-aircraft', affiliation: 'friend',
    speedRangeMps: [140, 160], altitudeRangeM: [8800, 9400], ...HEAVY,
    callsign: (rng: Rng) => `NATO0${rng.int(1, 9)}`, typeCode: 'E3TF',
  },
  'global-hawk': {
    domain: 'air', platform: 'uav', affiliation: 'friend',
    speedRangeMps: [155, 170], altitudeRangeM: [15500, 17500], ...HEAVY,
    callsign: (rng: Rng) => `FORTE${rng.int(10, 12)}`, typeCode: 'Q4',
  },
  cargo: {
    domain: 'sea', platform: 'cargo', affiliation: 'neutral',
    speedRangeMps: [6.5, 10], maxTurnRateDps: 0.6, accelMps2: 0.03, climbRateMps: 0,
    reportIntervalMs: SEA_REPORT, callsign: names.merchant,
  },
  tanker: {
    domain: 'sea', platform: 'tanker', affiliation: 'neutral',
    speedRangeMps: [5.5, 7.5], maxTurnRateDps: 0.5, accelMps2: 0.02, climbRateMps: 0,
    reportIntervalMs: SEA_REPORT, callsign: names.merchant,
  },
  ferry: {
    domain: 'sea', platform: 'passenger', affiliation: 'neutral',
    speedRangeMps: [9, 11.5], maxTurnRateDps: 1.2, accelMps2: 0.05, climbRateMps: 0,
    reportIntervalMs: SEA_REPORT, callsign: names.ferry,
  },
  fishing: {
    domain: 'sea', platform: 'fishing', affiliation: 'neutral',
    speedRangeMps: [1.5, 4.5], maxTurnRateDps: 2, accelMps2: 0.05, climbRateMps: 0,
    reportIntervalMs: SEA_REPORT, callsign: names.fishing,
  },
  leisure: {
    domain: 'sea', platform: 'leisure', affiliation: 'neutral',
    speedRangeMps: [2, 6], maxTurnRateDps: 3, accelMps2: 0.1, climbRateMps: 0,
    reportIntervalMs: SEA_REPORT, callsign: names.yacht,
  },
  warship: {
    domain: 'sea', platform: 'warship', affiliation: 'friend',
    speedRangeMps: [6, 9], maxTurnRateDps: 1, accelMps2: 0.05, climbRateMps: 0,
    reportIntervalMs: SEA_REPORT, callsign: names.naval,
  },
} satisfies Record<string, Profile>;

export type Archetype = keyof typeof PROFILES;
export const ARCHETYPES = Object.keys(PROFILES) as Archetype[];

export function isArchetype(name: string): name is Archetype {
  return name in PROFILES;
}

// ---------------------------------------------------------------------------
// Geometry helpers

/** Nudge each waypoint so ships in the same lane don't sit on one line; a point's own spread wins. */
function jitter(points: (LatLon & { spreadDeg?: number })[], rng: Rng, deg: number): LatLon[] {
  return points.map((p) => {
    const d = p.spreadDeg ?? deg;
    return { lat: p.lat + rng.range(-d, d) * 0.6, lon: p.lon + rng.range(-d, d) };
  });
}

/** One of the items, more likely the heavier it is. */
function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T {
  let total = 0;
  for (const item of items) total += weight(item);
  let r = rng.next() * total;
  for (const item of items) {
    r -= weight(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

/** Most flights are short; a few cross oceans. Beyond this, no airliner flies non-stop. */
const SHORT_HAUL_M = 2_500_000;
const LONGEST_FLIGHT_M = 15_000_000;
const SHORTEST_FLIGHT_M = 300_000;

/**
 * A flight between two airports, both picked by how busy they are, the
 * destination also by distance: busy pairs close together most, the long
 * haul now and then. Two points: the motion model steers for the next one
 * all the way, which is a great circle, as airliners fly.
 */
function flight(airports: readonly Airport[], rng: Rng): LatLon[] {
  const from = pickWeighted(airports, (a) => a.weight, rng);
  const to = pickWeighted(
    airports,
    (a) => {
      const d = distanceM(from, a);
      if (d < SHORTEST_FLIGHT_M || d > LONGEST_FLIGHT_M) return 0;
      return a.weight * (Math.exp(-d / SHORT_HAUL_M) + 0.06);
    },
    rng,
  );
  return [
    { lat: from.lat, lon: from.lon },
    { lat: to.lat, lon: to.lon },
  ];
}

/** A random spot along a polyline, weighted by segment length, plus the index of the next waypoint. */
function placeAlong(points: LatLon[], rng: Rng): { pos: LatLon; next: number } {
  const lengths = points.slice(1).map((p, i) => distanceM(points[i]!, p));
  let d = rng.next() * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!;
    if (d <= len) {
      const a = points[i]!;
      const b = points[i + 1]!;
      return { pos: destination(a, bearingDeg(a, b), d), next: i + 1 };
    }
    d -= len;
  }
  return { pos: { ...points[points.length - 1]! }, next: points.length - 1 };
}

/** A point on one edge of the box: 0 north, 1 east, 2 south, 3 west. */
function edgePoint(b: BBox, edge: number, rng: Rng): LatLon {
  switch (edge) {
    case 0: return { lat: b.north, lon: rng.range(b.west, b.east) };
    case 1: return { lat: rng.range(b.south, b.north), lon: b.east };
    case 2: return { lat: b.south, lon: rng.range(b.west, b.east) };
    default: return { lat: rng.range(b.south, b.north), lon: b.west };
  }
}

/** A cross-country airway: in through one edge, a dog-leg, out through another. Mostly east-west. */
function airway(b: BBox, rng: Rng): LatLon[] {
  const entry = rng.pick([1, 1, 3, 3, 0, 2]);
  const exit = rng.chance(0.7) ? (entry + 2) % 4 : rng.pick([0, 1, 2, 3].filter((e) => e !== entry));
  const a = edgePoint(b, entry, rng);
  const c = edgePoint(b, exit, rng);
  const midLat = (a.lat + c.lat) / 2 + rng.range(-0.3, 0.3);
  const midLon = (a.lon + c.lon) / 2 + rng.range(-0.5, 0.5);
  const mid = {
    lat: Math.min(b.north - 0.1, Math.max(b.south + 0.1, midLat)),
    lon: Math.min(b.east - 0.1, Math.max(b.west + 0.1, midLon)),
  };
  return [a, mid, c];
}

// ---------------------------------------------------------------------------
// Spawning

interface Placement {
  behaviour: Behaviour;
  pos: LatLon;
  courseDeg: number;
  dwellUntil?: number;
  /** A set altitude (m), rather than one picked from the profile's range. */
  altitudeM?: number;
}

/** A rate-one turn at holding speed is about 2.2 km across the turn's radius. */
const HOLD_TURN_RADIUS_M = 2_200;
/** The straight legs: a minute at holding speed, so a lap takes about four minutes. */
const HOLD_LEG_M = 7_000;

/**
 * A hold's racetrack corners in flying order: the fix, abeam it after the
 * turn, the end of the outbound leg, the start of the inbound leg. Flown
 * with the simulator's turn limits, the corners round off into the oval.
 */
export function racetrack(hold: Hold, turnRadiusM = HOLD_TURN_RADIUS_M, legM = HOLD_LEG_M): LatLon[] {
  const side = hold.inboundDeg + (hold.rightHand ? 90 : -90);
  const outbound = hold.inboundDeg + 180;
  const abeam = destination(hold.fix, side, 2 * turnRadiusM);
  return [hold.fix, abeam, destination(abeam, outbound, legM), destination(hold.fix, outbound, legM)];
}

/**
 * A place in a holding stack. New arrivals join at the top, over the fix;
 * at startup the stacks are already busy, so aircraft are spread over the
 * levels and round the racetrack.
 */
function holdPlacement(holds: readonly Hold[], ctx: SpawnContext): Placement {
  const { rng } = ctx;
  const hold = rng.pick(holds);
  const points = racetrack(hold);
  const levels = Math.round((hold.topM - hold.floorM) / HOLD_LEVEL_M);
  const level = ctx.initial ? rng.int(0, levels) : levels;
  const from = ctx.initial ? rng.int(0, points.length - 1) : 0;
  const next = (from + 1) % points.length;
  return {
    behaviour: { kind: 'hold', points, next, floorM: hold.floorM, exit: hold.exit },
    pos: { ...points[from]! },
    courseDeg: bearingDeg(points[from]!, points[next]!),
    altitudeM: hold.floorM + level * HOLD_LEVEL_M,
  };
}

function routePlacement(
  points: LatLon[],
  mode: 'once' | 'loop' | 'pingpong',
  ctx: SpawnContext,
  dwellAtEndsMs?: [number, number],
): Placement {
  const { pos, next } = ctx.initial ? placeAlong(points, ctx.rng) : { pos: { ...points[0]! }, next: 1 };
  const behaviour: Behaviour = { kind: 'route', points, next, mode };
  if (dwellAtEndsMs) behaviour.dwellAtEndsMs = dwellAtEndsMs;
  return { behaviour, pos, courseDeg: bearingDeg(pos, points[next]!) };
}

function loiterPlacement(areas: BBox[], ctx: SpawnContext, dwellChance: number, dwellMs: [number, number]): Placement {
  const area = ctx.rng.pick(areas);
  const pos = randomPointIn(area, ctx.rng);
  const target = randomPointIn(area, ctx.rng);
  return {
    behaviour: { kind: 'loiter', area, target, dwellChance, dwellMs },
    pos,
    courseDeg: bearingDeg(pos, target),
  };
}

/** Somewhere on one of these circles, flying round it one way or the other. */
function orbitPlacement(orbits: readonly Orbit[], rng: Rng): Placement {
  const o = rng.pick(orbits);
  const clockwise = rng.chance(0.5);
  const angle = rng.range(0, 360);
  return {
    behaviour: { kind: 'orbit', center: o.center, radiusM: o.radiusM, clockwise },
    pos: destination(o.center, angle, o.radiusM),
    courseDeg: normalizeDeg(angle + (clockwise ? 90 : -90)),
  };
}

function place(archetype: Archetype, ctx: SpawnContext): Placement | null {
  const { rng, scenario: s } = ctx;
  switch (archetype) {
    case 'airliner':
      return routePlacement(s.airports?.length ? flight(s.airports, rng) : airway(s.bounds, rng), 'once', ctx);
    case 'light-aircraft':
      return s.lightAircraftAreas.length ? loiterPlacement(s.lightAircraftAreas, ctx, 0, [0, 0]) : null;
    case 'helicopter':
      return s.helicopterAreas.length ? loiterPlacement(s.helicopterAreas, ctx, 0.3, [60_000, 240_000]) : null;
    case 'military-helicopter':
      return s.navalPatrolAreas.length ? loiterPlacement(s.navalPatrolAreas, ctx, 0.2, [60_000, 180_000]) : null;
    case 'maritime-patrol': {
      if (!s.patrolRacetracks.length) return null;
      const r = rng.pick(s.patrolRacetracks);
      return routePlacement([r.a, r.b], 'loop', { ...ctx, initial: true });
    }
    case 'uav':
      return s.uavOrbits.length ? orbitPlacement(s.uavOrbits, rng) : null;
    case 'holding':
      return s.holds?.length ? holdPlacement(s.holds, ctx) : null;
    case 'beluga-xl':
    case 'beluga':
    case 'dreamlifter':
    case 'an-124':
    case 'c-5':
    case 'b-52': {
      // From one of its sites to a different one.
      const sites = s.missions?.[archetype]?.sites ?? [];
      if (sites.length < 2) return null;
      const from = rng.pick(sites);
      const to = rng.pick(sites.filter((x) => x !== from));
      return routePlacement([from, to], 'once', ctx);
    }
    case 'awacs':
    case 'global-hawk': {
      const orbits = s.missions?.[archetype]?.orbits ?? [];
      return orbits.length ? orbitPlacement(orbits, rng) : null;
    }
    case 'cargo':
    case 'tanker': {
      if (!s.shippingLanes.length) return null;
      const lane = pickWeighted(s.shippingLanes, (l) => l.weight ?? 1, rng);
      return routePlacement(jitter(lane.points, rng, 0.03), 'once', ctx);
    }
    case 'ferry': {
      if (!s.ferryRoutes.length) return null;
      const route = rng.pick(s.ferryRoutes);
      const points = rng.chance(0.5) ? [...route.points] : [...route.points].reverse();
      return routePlacement(points, 'pingpong', { ...ctx, initial: true }, [6 * 60_000, 14 * 60_000]);
    }
    case 'fishing':
      return s.fishingAreas.length ? loiterPlacement(s.fishingAreas, ctx, 0.5, [3 * 60_000, 15 * 60_000]) : null;
    case 'leisure':
      return s.leisureAreas.length ? loiterPlacement(s.leisureAreas, ctx, 0.2, [5 * 60_000, 20 * 60_000]) : null;
    case 'warship':
      return s.navalPatrolAreas.length ? loiterPlacement(s.navalPatrolAreas, ctx, 0, [0, 0]) : null;
  }
}

/** Create one entity of the given archetype, or null if the scenario has no geography for it. */
export function spawn(archetype: Archetype, ctx: SpawnContext): SimEntity | null {
  const profile: Profile = PROFILES[archetype];
  const placement = place(archetype, ctx);
  if (!placement) return null;

  const { rng, now } = ctx;
  const cruise = rng.range(...profile.speedRangeMps);
  const entity: SimEntity = {
    id: ctx.id,
    archetype,
    domain: profile.domain,
    platform: profile.platform,
    affiliation: profile.affiliation,
    pos: placement.pos,
    courseDeg: placement.courseDeg,
    speedMps: cruise,
    speedRangeMps: profile.speedRangeMps,
    cruiseSpeedMps: cruise,
    maxTurnRateDps: profile.maxTurnRateDps,
    accelMps2: profile.accelMps2,
    climbRateMps: profile.climbRateMps,
    behaviour: placement.behaviour,
    dwellUntil: placement.dwellUntil ?? 0,
    reportIntervalMs: profile.reportIntervalMs,
    nextReportAt: now,
    silentUntil: 0,
    done: false,
  };

  if (profile.typeCode) entity.typeCode = profile.typeCode;
  const callsign = uniqueName(() => profile.callsign(rng), ctx.takenCallsigns);
  if (callsign) entity.callsign = callsign;

  if (profile.altitudeRangeM) {
    const alt = rng.range(...profile.altitudeRangeM);
    entity.altitudeRangeM = profile.altitudeRangeM;
    entity.targetAltitudeM = alt;
    // New arrivals at the edge are already at cruise; nothing in this sim takes off yet.
    entity.altitudeM = alt;
  }
  if (placement.altitudeM !== undefined) {
    entity.altitudeM = placement.altitudeM;
    entity.targetAltitudeM = placement.altitudeM;
  }
  return entity;
}
