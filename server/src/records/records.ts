import { metresToFeet, mpsToKnots, type Board, type BoardId, type RecordEntry, type Track } from '@watchfloor/shared';
import { createLogger } from '../log';
import { AIRCRAFT_TYPES, typeName } from './aircraftTypes';

const log = createLogger('records');

/** Places per board. */
const PLACES = 3;
/** Older reports say where something was, not where it is. */
const AIR_FRESH_MS = 2 * 60_000;
const SEA_FRESH_MS = 15 * 60_000;
/** Flying, not taxiing or parked with the transponder on. */
const AIRBORNE_MIN_ALTITUDE_M = 60;
const AIRBORNE_MIN_SPEED_MPS = 30;
/**
 * Past these, a figure is a garbled message, not a record: nothing with a
 * transponder flies above 40 km (a stratospheric balloon reaches about 35),
 * no airliner beats 740 kt over the ground even in the jet stream, and AIS
 * speeds over 58 kn are "not available" codes or junk. The longest ships
 * afloat are about 400 m.
 */
const MAX_ALTITUDE_M = 40_000;
const MAX_AIR_SPEED_MPS = 380;
const MAX_SEA_SPEED_MPS = 30;
const MIN_SEA_SPEED_MPS = 0.5;
const MAX_SHIP_LENGTH_M = 460;
const MIN_SHIP_LENGTH_M = 20;
/** An airline's ICAO designator starts its callsign, then a flight number: RYR4XW. */
const AIRLINE_CALLSIGN = /^([A-Z]{3})\d/;

export interface RecordSources {
  /** The owner asked not to be tracked publicly (LADD, PIA): kept off every board, as off the rare tab. */
  isPrivate?: (track: Track) => boolean;
  /** The airline a callsign names, from the airline register. */
  airlineOf?: (callsign: string) => string | undefined;
  /** A ship's length, from what it has broadcast about its hull. */
  shipLengthM?: (track: Track) => number | undefined;
}

/**
 * Every board, from the tracks in the picture now. Pure. A board nobody
 * qualifies for is left out (no ship lengths without AIS static data, no
 * types without type codes), rather than shown empty.
 */
export function leaderboards(tracks: readonly Track[], now: number, sources: RecordSources = {}): Board[] {
  const air: Track[] = [];
  const sea: Track[] = [];
  for (const t of tracks) {
    if (t.domain === 'air') {
      if (now - t.observedAt > AIR_FRESH_MS || t.speedMps < AIRBORNE_MIN_SPEED_MPS || t.speedMps > MAX_AIR_SPEED_MPS) continue;
      if (t.altitudeM === undefined || t.altitudeM < AIRBORNE_MIN_ALTITUDE_M || t.altitudeM > MAX_ALTITUDE_M) continue;
      if (sources.isPrivate?.(t)) continue;
      air.push(t);
    } else if (now - t.observedAt <= SEA_FRESH_MS) {
      sea.push(t);
    }
  }

  const boards: Board[] = [];
  const add = (id: BoardId, domain: Board['domain'], title: string, entries: RecordEntry[], note?: string) => {
    if (entries.length === 0) return;
    const board: Board = { id, domain, title, entries };
    if (note) board.note = note;
    boards.push(board);
  };

  add('highest', 'air', 'Highest', top(air, (t) => t.altitudeM!).map((t) => entry(t, `${feet(t.altitudeM!)} ft`, typeOf(t))));
  add(
    'fastest',
    'air',
    'Fastest',
    top(air, (t) => t.speedMps).map((t) => entry(t, `${knots(t.speedMps)} kt`, join(`${kmh(t.speedMps)} km/h`, typeOf(t)))),
    'Speed over the ground: a tailwind counts',
  );
  add('biggest', 'air', 'Biggest', biggest(air), 'By maximum take-off weight');
  add('types', 'air', 'Most common types', counts(air, (t) => t.typeCode, (code) => [typeName(code), code === typeName(code) ? undefined : code]));
  add(
    'airlines',
    'air',
    'Busiest airlines',
    counts(
      air,
      (t) => (t.callsign ? AIRLINE_CALLSIGN.exec(t.callsign)?.[1] : undefined),
      (code, holder) => {
        const name = holder.callsign ? sources.airlineOf?.(holder.callsign) : undefined;
        return name ? [name, code] : [code, undefined];
      },
    ),
  );
  add('north', 'air', 'Farthest north', top(air, (t) => t.lat).map((t) => entry(t, latitude(t.lat), typeOf(t))));
  add('south', 'air', 'Farthest south', top(air, (t) => -t.lat).map((t) => entry(t, latitude(t.lat), typeOf(t))));
  const moving = sea.filter((t) => t.speedMps >= MIN_SEA_SPEED_MPS && t.speedMps <= MAX_SEA_SPEED_MPS);
  add('fastest-ship', 'sea', 'Fastest ships', top(moving, (t) => t.speedMps).map((t) => entry(t, `${knots(t.speedMps)} kn`, `${kmh(t.speedMps)} km/h`)));
  if (sources.shipLengthM) {
    const lengths = new Map<Track, number>();
    for (const t of sea) {
      const l = sources.shipLengthM(t);
      if (l !== undefined && l >= MIN_SHIP_LENGTH_M && l <= MAX_SHIP_LENGTH_M) lengths.set(t, l);
    }
    add('longest-ship', 'sea', 'Longest ships', top([...lengths.keys()], (t) => lengths.get(t)!).map((t) => entry(t, `${lengths.get(t)!} m`)), 'As the ship itself reports');
  }
  return boards;
}

/** The biggest types in the air, one place each: three A380s are one A380 with a count. */
function biggest(air: readonly Track[]): RecordEntry[] {
  const byType = new Map<string, Track[]>();
  for (const t of air) {
    if (t.typeCode && AIRCRAFT_TYPES[t.typeCode]?.mtowT !== undefined) group(byType, t.typeCode, t);
  }
  return [...byType]
    .sort(([a], [b]) => AIRCRAFT_TYPES[b]!.mtowT! - AIRCRAFT_TYPES[a]!.mtowT!)
    .slice(0, PLACES)
    .map(([code, holders]) => {
      const holder = holders[0]!;
      return { ...where(holder), name: typeName(code), value: `~${AIRCRAFT_TYPES[code]!.mtowT} t`, detail: `${holders.length.toLocaleString('en-GB')} in the air` };
    });
}

/** The most numerous groups (by type, by airline), with one of each to show. */
function counts(
  air: readonly Track[],
  keyOf: (t: Track) => string | undefined,
  label: (key: string, holder: Track) => [string, string | undefined],
): RecordEntry[] {
  const groups = new Map<string, Track[]>();
  for (const t of air) {
    const key = keyOf(t);
    if (key) group(groups, key, t);
  }
  return [...groups]
    .sort(([ka, a], [kb, b]) => b.length - a.length || ka.localeCompare(kb))
    .slice(0, PLACES)
    .map(([key, holders]) => {
      const holder = holders[0]!;
      const [name, detail] = label(key, holder);
      const e: RecordEntry = { ...where(holder), name, value: `${holders.length.toLocaleString('en-GB')} in the air` };
      if (detail) e.detail = detail;
      return e;
    });
}

function group(groups: Map<string, Track[]>, key: string, t: Track): void {
  const list = groups.get(key);
  if (list) list.push(t);
  else groups.set(key, [t]);
}

/** The top few by a score, highest first; ties broken by id, so the board doesn't flicker. */
function top(tracks: readonly Track[], score: (t: Track) => number): Track[] {
  return [...tracks].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).slice(0, PLACES);
}

function entry(t: Track, value: string, detail?: string): RecordEntry {
  const e: RecordEntry = { ...where(t), name: nameOf(t), value };
  if (detail) e.detail = detail;
  return e;
}

function where(t: Track): Pick<RecordEntry, 'trackId' | 'lat' | 'lon'> {
  return { trackId: t.id, lat: t.lat, lon: t.lon };
}

function nameOf(t: Track): string {
  return t.callsign ?? t.id.split(':')[1]!.toUpperCase();
}

function typeOf(t: Track): string | undefined {
  return t.typeCode ? typeName(t.typeCode) : undefined;
}

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');
const feet = (m: number) => (Math.round(metresToFeet(m) / 100) * 100).toLocaleString('en-GB');
const knots = (mps: number) => Math.round(mpsToKnots(mps)).toLocaleString('en-GB');
const kmh = (mps: number) => Math.round(mps * 3.6).toLocaleString('en-GB');
const latitude = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;

export interface RecordsServiceOptions {
  tracks: () => readonly Track[];
  sources?: RecordSources;
  /** Every board, whenever any of them changes. */
  onChange?: (boards: Board[]) => void;
  now?: () => number;
  intervalMs?: number;
}

/** Records move constantly; half a minute is often enough to be news and cheap for thousands of tracks. */
const INTERVAL_MS = 30_000;

/** Works the boards out every half minute, and says when they change. */
export class RecordsService {
  private current: Board[] = [];
  private signature = '[]';
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => number;

  constructor(private readonly opts: RecordsServiceOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  start(): void {
    this.update();
    this.timer ??= setInterval(() => {
      try {
        this.update();
      } catch (err) {
        log.error('records update failed', { error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
      }
    }, this.opts.intervalMs ?? INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  boards(): Board[] {
    return this.current;
  }

  /** Work the boards out now. Public so tests (and the demo) drive it directly. */
  update(): void {
    const boards = leaderboards(this.opts.tracks(), this.now(), this.opts.sources);
    const signature = JSON.stringify(boards);
    if (signature === this.signature) return;
    this.current = boards;
    this.signature = signature;
    this.opts.onChange?.(boards);
  }
}
