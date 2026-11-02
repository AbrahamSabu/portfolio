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
import type { Scenario } from '../../scenarios';
import type { Behaviour, SimEntity } from './entity';
import { randomPointIn } from './motion';
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
}

const AIR_REPORT: [number, number] = [2000, 5000];
const SEA_REPORT: [number, number] = [6000, 15000];

const PROFILES = {
  airliner: {
    domain: 'air', platform: 'airliner', affiliation: 'neutral',
    speedRangeMps: [215, 250], altitudeRangeM: [8500, 12000],
    maxTurnRateDps: 2.5, accelMps2: 1.5, climbRateMps: 8,
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

/** Nudge each waypoint so ships in the same lane don't sit on one line. */
function jitter(points: LatLon[], rng: Rng, deg: number): LatLon[] {
  return points.map((p) => ({ lat: p.lat + rng.range(-deg, deg) * 0.6, lon: p.lon + rng.range(-deg, deg) }));
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

function place(archetype: Archetype, ctx: SpawnContext): Placement | null {
  const { rng, scenario: s } = ctx;
  switch (archetype) {
    case 'airliner':
      return routePlacement(airway(s.bounds, rng), 'once', ctx);
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
    case 'uav': {
      if (!s.uavOrbits.length) return null;
      const o = rng.pick(s.uavOrbits);
      const clockwise = rng.chance(0.5);
      const angle = rng.range(0, 360);
      return {
        behaviour: { kind: 'orbit', center: o.center, radiusM: o.radiusM, clockwise },
        pos: destination(o.center, angle, o.radiusM),
        courseDeg: normalizeDeg(angle + (clockwise ? 90 : -90)),
      };
    }
    case 'cargo':
    case 'tanker': {
      if (!s.shippingLanes.length) return null;
      return routePlacement(jitter(rng.pick(s.shippingLanes).points, rng, 0.03), 'once', ctx);
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

  const callsign = uniqueName(() => profile.callsign(rng), ctx.takenCallsigns);
  if (callsign) entity.callsign = callsign;

  if (profile.altitudeRangeM) {
    const alt = rng.range(...profile.altitudeRangeM);
    entity.altitudeRangeM = profile.altitudeRangeM;
    entity.targetAltitudeM = alt;
    // New arrivals at the edge are already at cruise; nothing in this sim takes off yet.
    entity.altitudeM = alt;
  }
  return entity;
}
