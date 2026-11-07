import type { FeedStatus } from './feedStatus';
import { parseBriefEvent, parseFinding, type BriefEvent, type Finding } from './findings';
import { parseHazard, type Hazard } from './hazards';
import { parseNewsItem, type NewsItem } from './news';
import { parseBoard, type Board } from './records';
import type { BBox } from './geo';
import {
  CONSOLE_CALLSIGNS,
  LAYER_NAMES,
  MAX_JOIN_ORIGINS,
  ROOM_CLOSED_REASONS,
  SCREEN_NAMES,
  isConsoleCallsign,
  isJoinOrigin,
  isLayerName,
  isRoomCode,
  isRoomSecret,
  isScreenName,
  type ConsolePresence,
  type LayerState,
  type RoomAction,
  type RoomClientMessage,
  type RoomServerMessage,
  type ScreenPresence,
  type ScreenStatus,
} from './room';
import type { StalenessRules } from './staleness';
import { TRACK_VALUES, type Affiliation, type Domain, type Platform, type Track } from './track';
import type { TrailPoint } from './trail';
import { decodeTrack, decodeTrail, encodeTrack, encodeTrail, type TrackTuple, type TrailTuple } from './wire';

/**
 * Messages the server sends to browsers over the WebSocket.
 *
 * The flow is:
 *   1. `hello`    once, right after connecting (protocol version + settings)
 *   2. `snapshot` once, the full current picture plus each track's recent trail
 *   3. `delta`    every tick, only what changed since the last tick
 *
 * Applying a delta is idempotent: upserting a track the client already has,
 * or removing one it never had, is harmless. That keeps reconnects and
 * mid-tick joins simple. Bump PROTOCOL_VERSION on any breaking change.
 *
 * History:
 *   1  hello, snapshot, delta
 *   2  snapshot carries `trails`
 *   3  staleness is `{ byDomain, bySource }`, with per-source overrides;
 *      hello carries `traffic`
 *   4  browsers send `view` (what they're looking at), so a pay-per-area
 *      feed can poll only the watched areas
 *   5  hello carries `feeds` (each live feed's status); a delta carries
 *      `feeds` only in the tick where one changed
 *   6  tracks may carry `provider` (which service delivered the report)
 *   7  feed state `standing-aside`
 *   8  feed state `unconfigured`
 *   9  provider `adsb.fi`
 *  10  tracks and trails travel compact (wire.ts): tuples, codes, steps;
 *      snapshot trails are a list aligned with its tracks
 *  11  platforms `business-jet` and `military-aircraft`; aircraft tracks may
 *      carry `typeCode` and `model` from the aircraft database
 *  12  `path` request and reply: a selected track's whole path
 *  13  the request is `track`, answered with `path` and `details`
 *  14  `news`: political news stories, after the snapshot and as they arrive
 *  15  `hazards`: earthquakes and disasters, after the snapshot and when they change
 *  16  `findings`: what the server's watchers noticed (circling, AIS contact
 *      lost, converging military), whole list like hazards; `brief` request
 *      and reply (the last 24 h as events, for the handover brief); `replay`
 *      request and reply (recent paths through an area, for the scrubber)
 *  17  `records`: the leaderboard (highest, fastest, biggest...), whole like
 *      findings, after the findings and every half minute
 *  18  the ops room (room.ts): other screens and phone consoles join a
 *      main screen's room, and consoles steer a screen; `room-*` both ways
 */
export const PROTOCOL_VERSION = 18;

export interface HelloMessage {
  type: 'hello';
  protocol: number;
  serverTime: number;
  tickMs: number;
  staleness: StalenessRules;
  scenario: ScenarioInfo | null;
  /** Whether the picture is real, invented or both, so the UI never passes off a simulation as live. */
  traffic: TrafficKind;
  /** How each feed that can fail is doing (rate limited, failing...). */
  feeds: FeedStatus[];
}

export type TrafficKind = 'simulated' | 'live' | 'mixed';

export interface SnapshotMessage {
  type: 'snapshot';
  serverTime: number;
  tracks: Track[];
  /**
   * Recent reported positions per track id, oldest first. Deltas don't repeat
   * these: the client extends each trail from the upserts it receives.
   */
  trails: Record<string, TrailPoint[]>;
}

export interface DeltaMessage {
  type: 'delta';
  serverTime: number;
  upserts: Track[];
  removals: string[];
  /** Present only when a feed's status changed this tick: the full new list. */
  feeds?: FeedStatus[];
}

/**
 * One track's longer path, in answer to a browser's `path` request. Sent once
 * with what the server has, and again if earlier history arrives (OpenSky's
 * record of the flight since takeoff). The browser extends it from deltas.
 */
export interface PathMessage {
  type: 'path';
  serverTime: number;
  id: string;
  /** Oldest first. */
  points: TrailPoint[];
  /** Where the earlier part came from: 'pending' while it's being fetched. */
  backfill: PathBackfill;
}

export type PathBackfill = 'none' | 'pending' | 'opensky';

/**
 * More about one track than every browser needs for the map: who flies it,
 * where it's from, what a ship has said about its voyage. Sent in answer to a
 * `track` request, so the snapshot stays small.
 */
export interface DetailsMessage {
  type: 'details';
  serverTime: number;
  id: string;
  details: TrackDetails;
}

export interface TrackDetails {
  /** State of registry (aircraft, from its ICAO address) or flag (ships, from the MMSI). */
  country?: string;
  /** The airline named by the callsign's ICAO designator. */
  airline?: string;
  /** Flown by a military, by the aircraft database's flag or the platform. */
  military?: boolean;
  /**
   * The owner asked not to be tracked publicly (FAA LADD), or the aircraft
   * flies a privacy address (PIA): show nothing that identifies it, no photo.
   */
  private?: boolean;
  ship?: ShipDetails;
}

/** What a ship broadcasts about its voyage and hull (AIS static data). */
export interface ShipDetails {
  /** AIS ship and cargo type (ITU-R M.1371, 20-99): finer than the platform, e.g. 52 tug, 50 pilot vessel. */
  aisType?: number;
  imo?: number;
  callSign?: string;
  /** Free text, as the crew typed it. */
  destination?: string;
  /** "MM-DDTHH:MMZ": AIS sends no year. */
  eta?: string;
  lengthM?: number;
  beamM?: number;
  draughtM?: number;
}

/**
 * News stories (news.ts): the day's, after the snapshot (`replace`), then
 * each new batch's as it arrives, about every 15 minutes.
 */
export interface NewsMessage {
  type: 'news';
  serverTime: number;
  /** Newest first. */
  items: NewsItem[];
  /** True: these are all the stories, replacing any the page has. False: add them. */
  replace: boolean;
}

/**
 * Natural hazards (hazards.ts): all of them each time, after the snapshot
 * and whenever a source's list changes. A few hundred at most, so the whole
 * list is simpler than changes.
 */
export interface HazardsMessage {
  type: 'hazards';
  serverTime: number;
  items: Hazard[];
}

/**
 * Watcher findings (findings.ts): all of them each time, after the snapshot
 * and whenever the list changes. Like hazards, the whole list is simpler
 * than changes, and a finding that ended simply stops being in it.
 */
export interface FindingsMessage {
  type: 'findings';
  serverTime: number;
  items: Finding[];
  /**
   * Rare sightings that have ended in the last 24 hours, newest first, each
   * with `endedAt`: what the Rare aircraft tab lists besides the live ones.
   * Optional, so a page without the tab simply ignores it.
   */
  recent?: Finding[];
}

/**
 * The leaderboard (records.ts): every board each time, after the findings
 * and whenever a record changes hands or moves (every half minute at most).
 */
export interface RecordsMessage {
  type: 'records';
  serverTime: number;
  boards: Board[];
}

/** The last day's events, in answer to a browser's `brief` request. Oldest first. */
export interface BriefMessage {
  type: 'brief';
  serverTime: number;
  /** Events before this were outside the log's window (or the server started then). */
  sinceTime: number;
  events: BriefEvent[];
}

/**
 * Recent paths through an area, in answer to a browser's `replay` request:
 * what the scrubber replays. Tracks the server still holds history for,
 * capped so a worldwide view doesn't ship a million points.
 */
export interface ReplayMessage {
  type: 'replay';
  serverTime: number;
  tracks: ReplayTrack[];
  /** True when the cap cut tracks that were in the area. */
  truncated: boolean;
}

export interface ReplayTrack {
  id: string;
  domain: Domain;
  platform: Platform;
  affiliation: Affiliation;
  callsign?: string;
  /** Oldest first. */
  points: TrailPoint[];
}

export type ServerMessage =
  | HelloMessage
  | SnapshotMessage
  | DeltaMessage
  | PathMessage
  | DetailsMessage
  | NewsMessage
  | HazardsMessage
  | FindingsMessage
  | RecordsMessage
  | BriefMessage
  | ReplayMessage
  | RoomServerMessage;

/** Where the picture is centred, so the client can frame the map on first load. */
export interface ScenarioInfo {
  id: string;
  name: string;
  center: { lat: number; lon: number };
  zoom: number;
}

/** Snapshot and delta as sent: tracks as tuples, trails aligned with the snapshot's tracks. */
interface WireSnapshot {
  type: 'snapshot';
  serverTime: number;
  tracks: TrackTuple[];
  trails: TrailTuple[];
}
interface WirePath {
  type: 'path';
  serverTime: number;
  id: string;
  points: TrailTuple;
  backfill: PathBackfill;
}
interface WireDelta {
  type: 'delta';
  serverTime: number;
  upserts: TrackTuple[];
  removals: string[];
  feeds?: FeedStatus[];
}
interface WireReplayTrack {
  id: string;
  domain: Domain;
  platform: Platform;
  affiliation: Affiliation;
  callsign?: string;
  points: TrailTuple;
}
interface WireReplay {
  type: 'replay';
  serverTime: number;
  tracks: WireReplayTrack[];
  truncated: boolean;
}

/** The JSON text the server sends for a message, in the compact wire form. */
export function encodeServerMessage(message: ServerMessage): string {
  switch (message.type) {
    case 'hello':
    case 'room':
    case 'room-presence':
    case 'room-control':
    case 'room-closed':
    case 'details':
    case 'news':
    case 'hazards':
    case 'findings':
    case 'records':
    case 'brief':
      return JSON.stringify(message);
    case 'replay': {
      const wire: WireReplay = {
        type: 'replay',
        serverTime: message.serverTime,
        truncated: message.truncated,
        tracks: message.tracks.map((t) => ({ ...t, points: encodeTrail(t.points, message.serverTime) })),
      };
      return JSON.stringify(wire);
    }
    case 'snapshot': {
      const { serverTime, tracks, trails } = message;
      const wire: WireSnapshot = {
        type: 'snapshot',
        serverTime,
        tracks: tracks.map((t) => encodeTrack(t, serverTime)),
        // By position, so ids aren't sent twice; a track without one gets [].
        trails: tracks.map((t) => encodeTrail(trails[t.id] ?? [], serverTime)),
      };
      return JSON.stringify(wire);
    }
    case 'path': {
      const wire: WirePath = { ...message, points: encodeTrail(message.points, message.serverTime) };
      return JSON.stringify(wire);
    }
    case 'delta': {
      const { upserts, ...rest } = message;
      const wire: WireDelta = { ...rest, upserts: upserts.map((t) => encodeTrack(t, message.serverTime)) };
      return JSON.stringify(wire);
    }
  }
}

/**
 * Narrow parse of an incoming message, decoding the compact wire form back
 * into Tracks and trail points. Track contents are trusted (the server
 * sanitized them); only the message's shape is checked.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (typeof m.serverTime !== 'number') return null;
  switch (m.type) {
    case 'hello':
      return typeof m.protocol === 'number' ? (m as unknown as HelloMessage) : null;
    case 'room':
    case 'room-presence':
    case 'room-control':
    case 'room-closed':
      return parseRoomNotice(m, m.serverTime);
    case 'snapshot': {
      if (!Array.isArray(m.tracks) || !Array.isArray(m.trails) || !m.tracks.every(Array.isArray)) return null;
      const w = m as unknown as WireSnapshot;
      const tracks = w.tracks.map((t) => decodeTrack(t, w.serverTime));
      const trails: Record<string, TrailPoint[]> = {};
      tracks.forEach((t, i) => {
        const trail = w.trails[i];
        if (Array.isArray(trail) && trail.length > 0) trails[t.id] = decodeTrail(trail, w.serverTime);
      });
      return { type: 'snapshot', serverTime: w.serverTime, tracks, trails };
    }
    case 'delta': {
      if (!Array.isArray(m.upserts) || !Array.isArray(m.removals) || !m.upserts.every(Array.isArray)) return null;
      const w = m as unknown as WireDelta;
      const delta: DeltaMessage = {
        type: 'delta',
        serverTime: w.serverTime,
        upserts: w.upserts.map((t) => decodeTrack(t, w.serverTime)),
        removals: w.removals,
      };
      if (w.feeds) delta.feeds = w.feeds;
      return delta;
    }
    case 'path': {
      if (typeof m.id !== 'string' || !Array.isArray(m.points) || typeof m.backfill !== 'string') return null;
      const w = m as unknown as WirePath;
      return { type: 'path', serverTime: w.serverTime, id: w.id, points: decodeTrail(w.points, w.serverTime), backfill: w.backfill };
    }
    case 'details': {
      if (typeof m.id !== 'string' || typeof m.details !== 'object' || m.details === null) return null;
      return m as unknown as DetailsMessage;
    }
    case 'news': {
      if (!Array.isArray(m.items) || typeof m.replace !== 'boolean') return null;
      // Headlines and links go into the page: each story is checked.
      const items = m.items.map(parseNewsItem).filter((i): i is NewsItem => i !== null);
      return { type: 'news', serverTime: m.serverTime, items, replace: m.replace };
    }
    case 'hazards': {
      if (!Array.isArray(m.items)) return null;
      const items = m.items.map(parseHazard).filter((h): h is Hazard => h !== null);
      return { type: 'hazards', serverTime: m.serverTime, items };
    }
    case 'findings': {
      if (!Array.isArray(m.items)) return null;
      const items = m.items.map(parseFinding).filter((f): f is Finding => f !== null);
      const message: FindingsMessage = { type: 'findings', serverTime: m.serverTime, items };
      if (Array.isArray(m.recent)) message.recent = m.recent.map(parseFinding).filter((f): f is Finding => f !== null);
      return message;
    }
    case 'records': {
      if (!Array.isArray(m.boards)) return null;
      const boards = m.boards.map(parseBoard).filter((b): b is Board => b !== null);
      return { type: 'records', serverTime: m.serverTime, boards };
    }
    case 'brief': {
      if (!Array.isArray(m.events) || typeof m.sinceTime !== 'number') return null;
      const events = m.events.map(parseBriefEvent).filter((e): e is BriefEvent => e !== null);
      return { type: 'brief', serverTime: m.serverTime, sinceTime: m.sinceTime, events };
    }
    case 'replay': {
      if (!Array.isArray(m.tracks) || typeof m.truncated !== 'boolean') return null;
      const w = m as unknown as WireReplay;
      const tracks: ReplayTrack[] = [];
      for (const t of w.tracks) {
        if (typeof t !== 'object' || t === null || typeof t.id !== 'string' || !Array.isArray(t.points)) return null;
        if (!TRACK_VALUES.domain.includes(t.domain) || !TRACK_VALUES.platform.includes(t.platform)) return null;
        if (!TRACK_VALUES.affiliation.includes(t.affiliation)) return null;
        const track: ReplayTrack = {
          id: t.id,
          domain: t.domain,
          platform: t.platform,
          affiliation: t.affiliation,
          points: decodeTrail(t.points, w.serverTime),
        };
        if (typeof t.callsign === 'string') track.callsign = t.callsign;
        tracks.push(track);
      }
      return { type: 'replay', serverTime: w.serverTime, tracks, truncated: w.truncated };
    }
    default:
      return null;
  }
}

/**
 * Messages browsers send to the server. Only one so far: the area on screen
 * (plus a margin), sent on connect and after each pan or zoom settles.
 * Longitudes may run past ±180 when the map has wrapped around the world.
 */
export interface ViewMessage {
  type: 'view';
  bbox: BBox;
}

/**
 * Ask about one track: its whole path and its details. Sent when a track is
 * selected, and again after reconnecting.
 */
export interface TrackRequestMessage {
  type: 'track';
  id: string;
}

/** Ask for the last day's events, for the handover brief. */
export interface BriefRequestMessage {
  type: 'brief';
}

/** Ask for recent paths through an area, for the replay scrubber. */
export interface ReplayRequestMessage {
  type: 'replay';
  bbox: BBox;
}

export type ClientMessage = ViewMessage | TrackRequestMessage | BriefRequestMessage | ReplayRequestMessage | RoomClientMessage;

/** As validation allows track ids: 1-128 characters, here printable ASCII only. */
const TRACK_ID = /^[!-~]{1,128}$/;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Strict parse of a browser message. The server must treat these as untrusted:
 * a view decides what a paid API is asked for.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (typeof m.type === 'string' && m.type.startsWith('room-')) return parseRoomRequest(m);
  if (m.type === 'track') return typeof m.id === 'string' && TRACK_ID.test(m.id) ? { type: 'track', id: m.id } : null;
  if (m.type === 'brief') return { type: 'brief' };
  if (m.type !== 'view' && m.type !== 'replay') return null;
  if (typeof m.bbox !== 'object' || m.bbox === null) return null;
  const { south, west, north, east } = m.bbox as Record<string, unknown>;
  if (!finite(south) || !finite(west) || !finite(north) || !finite(east)) return null;
  if (south > north || west > east) return null;
  if (south < -90 || north > 90 || west < -720 || east > 720) return null;
  return { type: m.type, bbox: { south, west, north, east } };
}

const isTrackId = (v: unknown): v is string => typeof v === 'string' && TRACK_ID.test(v);

/**
 * A browser's ops-room message (room.ts), strictly: a field out of shape
 * drops the whole message, and only known fields are copied.
 */
function parseRoomRequest(m: Record<string, unknown>): RoomClientMessage | null {
  switch (m.type) {
    case 'room-open':
      if (m.code === undefined && m.key === undefined) return { type: 'room-open' };
      return isRoomCode(m.code) && isRoomSecret(m.key) ? { type: 'room-open', code: m.code, key: m.key } : null;
    case 'room-join': {
      const { code, token, as } = m;
      if (!isRoomCode(code)) return null;
      if (token !== undefined && !isRoomSecret(token)) return null;
      if (as !== undefined && as !== 'screen') return null;
      return { type: 'room-join', code, ...(token !== undefined ? { token } : {}), ...(as === 'screen' ? { as } : {}) };
    }
    case 'room-leave':
      return { type: 'room-leave' };
    case 'room-look':
      if (m.id === null) return { type: 'room-look', id: null };
      return isTrackId(m.id) ? { type: 'room-look', id: m.id } : null;
    case 'room-control': {
      const action = parseRoomAction(m.action);
      return isScreenName(m.to) && action ? { type: 'room-control', to: m.to, action } : null;
    }
    case 'room-status': {
      const status = parseScreenStatus(m.status);
      return status ? { type: 'room-status', status } : null;
    }
    default:
      return null;
  }
}

const inRange = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** One thing a console asks a screen to do (room.ts): a closed list, every number in range. */
function parseRoomAction(value: unknown): RoomAction | null {
  if (typeof value !== 'object' || value === null) return null;
  const a = value as Record<string, unknown>;
  switch (a.do) {
    case 'show':
      return isTrackId(a.id) ? { do: 'show', id: a.id } : null;
    case 'pan':
      return inRange(a.dx, -1, 1) && inRange(a.dy, -1, 1) ? { do: 'pan', dx: a.dx, dy: a.dy } : null;
    case 'zoom':
      return a.by === 1 || a.by === -1 ? { do: 'zoom', by: a.by } : null;
    case 'home':
      return { do: 'home' };
    case 'clear':
      return { do: 'clear' };
    case 'follow':
      return typeof a.on === 'boolean' ? { do: 'follow', on: a.on } : null;
    case 'tour':
      return typeof a.on === 'boolean' ? { do: 'tour', on: a.on } : null;
    case 'layer':
      return isLayerName(a.layer) && typeof a.on === 'boolean' ? { do: 'layer', layer: a.layer, on: a.on } : null;
    case 'ride':
      if (a.id === null) return { do: 'ride', id: null };
      return isTrackId(a.id) ? { do: 'ride', id: a.id } : null;
    case 'fly':
      return inRange(a.lon, -180, 180) && inRange(a.lat, -85, 85) && inRange(a.zoom, 0, 18)
        ? { do: 'fly', lon: a.lon, lat: a.lat, zoom: a.zoom }
        : null;
    default:
      return null;
  }
}

/** What a screen says it is showing: known layers only, each a boolean, and a track id if it is riding along. */
function parseScreenStatus(value: unknown): ScreenStatus | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  if (typeof s.tour !== 'boolean' || typeof s.follow !== 'boolean') return null;
  if (typeof s.layers !== 'object' || s.layers === null) return null;
  const given = s.layers as Record<string, unknown>;
  const layers: LayerState = {};
  for (const name of LAYER_NAMES) {
    const on = given[name];
    if (typeof on === 'boolean') layers[name] = on;
  }
  const riding = s.riding;
  if (riding !== undefined && !isTrackId(riding)) return null;
  const status: ScreenStatus = { layers, tour: s.tour, follow: s.follow };
  if (typeof riding === 'string') status.riding = riding;
  return status;
}

/** The server's ops-room messages, checked: callsigns and addresses end up on screen and in a QR code. */
function parseRoomNotice(m: Record<string, unknown>, serverTime: number): RoomServerMessage | null {
  switch (m.type) {
    case 'room':
      if (!isRoomCode(m.code)) return null;
      if (m.role === 'main') {
        const { key, origins } = m;
        if (!isRoomSecret(key) || !Array.isArray(origins) || origins.length > MAX_JOIN_ORIGINS) return null;
        if (!origins.every(isJoinOrigin)) return null;
        return { type: 'room', serverTime, role: 'main', code: m.code, key, origins };
      }
      if (m.role === 'screen') {
        const { name, token } = m;
        if (!isScreenName(name) || !isRoomSecret(token)) return null;
        return { type: 'room', serverTime, role: 'screen', code: m.code, name, token };
      }
      if (m.role === 'console') {
        const { callsign, token } = m;
        if (!isConsoleCallsign(callsign) || !isRoomSecret(token)) return null;
        return { type: 'room', serverTime, role: 'console', code: m.code, callsign, token };
      }
      return null;
    case 'room-presence': {
      if (!Array.isArray(m.screens) || m.screens.length > SCREEN_NAMES.length) return null;
      if (!Array.isArray(m.consoles) || m.consoles.length > CONSOLE_CALLSIGNS.length) return null;
      const screens: ScreenPresence[] = [];
      for (const s of m.screens as unknown[]) {
        if (typeof s !== 'object' || s === null) return null;
        const { name, status } = s as Record<string, unknown>;
        if (!isScreenName(name)) return null;
        if (status === undefined) {
          screens.push({ name });
          continue;
        }
        const parsed = parseScreenStatus(status);
        if (!parsed) return null;
        screens.push({ name, status: parsed });
      }
      const consoles: ConsolePresence[] = [];
      for (const c of m.consoles as unknown[]) {
        if (typeof c !== 'object' || c === null) return null;
        const { callsign, id } = c as Record<string, unknown>;
        if (!isConsoleCallsign(callsign) || (id !== null && !isTrackId(id))) return null;
        consoles.push({ callsign, id });
      }
      return { type: 'room-presence', serverTime, screens, consoles };
    }
    case 'room-control': {
      const action = parseRoomAction(m.action);
      return isConsoleCallsign(m.from) && action ? { type: 'room-control', serverTime, from: m.from, action } : null;
    }
    case 'room-closed': {
      const reason = ROOM_CLOSED_REASONS.find((r) => r === m.reason);
      return reason ? { type: 'room-closed', serverTime, reason } : null;
    }
    default:
      return null;
  }
}
