import type { BBox } from './geo';
import type { StalenessRules } from './staleness';
import type { Track } from './track';
import type { TrailPoint } from './trail';

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
 */
export const PROTOCOL_VERSION = 4;

export interface HelloMessage {
  type: 'hello';
  protocol: number;
  serverTime: number;
  tickMs: number;
  staleness: StalenessRules;
  scenario: ScenarioInfo | null;
  /** Whether the picture is real, invented or both, so the UI never passes off a simulation as live. */
  traffic: TrafficKind;
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
}

export type ServerMessage = HelloMessage | SnapshotMessage | DeltaMessage;

/** Where the picture is centred, so the client can frame the map on first load. */
export interface ScenarioInfo {
  id: string;
  name: string;
  center: { lat: number; lon: number };
  zoom: number;
}

/** Narrow parse of an incoming message. Track contents are trusted (the server sanitized them). */
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
    case 'snapshot':
      return Array.isArray(m.tracks) && typeof m.trails === 'object' && m.trails !== null
        ? (m as unknown as SnapshotMessage)
        : null;
    case 'delta':
      return Array.isArray(m.upserts) && Array.isArray(m.removals)
        ? (m as unknown as DeltaMessage)
        : null;
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

export type ClientMessage = ViewMessage;

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
  if (m.type !== 'view' || typeof m.bbox !== 'object' || m.bbox === null) return null;
  const { south, west, north, east } = m.bbox as Record<string, unknown>;
  if (!finite(south) || !finite(west) || !finite(north) || !finite(east)) return null;
  if (south > north || west > east) return null;
  if (south < -90 || north > 90 || west < -720 || east > 720) return null;
  return { type: 'view', bbox: { south, west, north, east } };
}
