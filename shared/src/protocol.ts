import type { StalenessRules } from './staleness';
import type { Track } from './track';

/**
 * Messages the server sends to browsers over the WebSocket.
 *
 * The flow is:
 *   1. `hello`    once, right after connecting (protocol version + settings)
 *   2. `snapshot` once, the full current picture
 *   3. `delta`    every tick, only what changed since the last tick
 *
 * Applying a delta is idempotent: upserting a track the client already has,
 * or removing one it never had, is harmless. That keeps reconnects and
 * mid-tick joins simple. Bump PROTOCOL_VERSION on any breaking change.
 */
export const PROTOCOL_VERSION = 1;

export interface HelloMessage {
  type: 'hello';
  protocol: number;
  serverTime: number;
  tickMs: number;
  staleness: StalenessRules;
  scenario: ScenarioInfo | null;
}

export interface SnapshotMessage {
  type: 'snapshot';
  serverTime: number;
  tracks: Track[];
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
      return Array.isArray(m.tracks) ? (m as unknown as SnapshotMessage) : null;
    case 'delta':
      return Array.isArray(m.upserts) && Array.isArray(m.removals)
        ? (m as unknown as DeltaMessage)
        : null;
    default:
      return null;
  }
}
