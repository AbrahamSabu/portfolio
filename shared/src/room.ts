/**
 * The ops room: one main screen (the map on a TV or laptop) and the phones
 * that joined it as consoles. A console browses the picture, says which
 * track it has open (presence, drawn on the main map) and can send a track
 * to the main screen. Rooms live in the server's memory only: nothing about
 * them is saved, and they end when the main screen leaves.
 *
 * Flow (protocol v17):
 *   main screen  room-open                 -> room { role: 'main', code, key, origins }
 *   console      room-join { code }        -> room { role: 'console', callsign, token }
 *   everyone in the room                   <- room-presence, whenever it changes
 *   console      room-look { id | null }      (the track it has open)
 *   console      room-send { id }          -> the main screen gets room-show { id, from }
 *   either       room-leave                   (the main screen leaving closes the room)
 *   refusals and endings                   <- room-closed { reason }
 *
 * After a reconnect the main screen reclaims its room with `code` and `key`,
 * and a console rejoins with its `token`, which keeps its callsign.
 */

/**
 * Room codes are short enough to type on a phone: four characters, without
 * vowels (so a code never spells a word) and without the characters people
 * misread (0 and O, 1, I and L).
 */
export const ROOM_CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXZ23456789';
export const ROOM_CODE_LENGTH = 4;
const ROOM_CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** The main screen's key and a console's token: 16 random bytes in base64url. */
const ROOM_SECRET = /^[A-Za-z0-9_-]{22}$/;

/**
 * What consoles are called on the wall, as in CONSOLE ALFA. The server picks
 * one, so nothing a phone types ever reaches the main screen.
 */
export const CONSOLE_CALLSIGNS = [
  'ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA',
  'JULIETT', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO',
  'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY', 'XRAY', 'YANKEE', 'ZULU',
] as const;
export type ConsoleCallsign = (typeof CONSOLE_CALLSIGNS)[number];

/** The most consoles one room takes (fewer than there are callsigns). */
export const MAX_CONSOLES = 12;
/** The most addresses the server offers for the join link. */
export const MAX_JOIN_ORIGINS = 8;

export const isRoomCode = (v: unknown): v is string => typeof v === 'string' && ROOM_CODE.test(v);
export const isRoomSecret = (v: unknown): v is string => typeof v === 'string' && ROOM_SECRET.test(v);
export const isConsoleCallsign = (v: unknown): v is ConsoleCallsign =>
  typeof v === 'string' && (CONSOLE_CALLSIGNS as readonly string[]).includes(v);

/**
 * An address a phone can open, and nothing else: http or https, a host name,
 * IPv4 or bracketed IPv6 address, and maybe a port. It ends up in a link and
 * a QR code, so a `javascript:` URL or a path must never pass.
 */
export const isJoinOrigin = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 100 && /^https?:\/\/(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/.test(v);

/** A code as someone typed it: any case, spaces or a dash in the middle. */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]+/g, '');
}

/** Where a phone joins: the console page, with the code in the link. */
export function joinUrl(origin: string, code: string): string {
  return `${origin}/console.html?room=${code}`;
}

// Browser -> server

/** Main screen: open a room, or reclaim its own after a reconnect (`code` and `key` together). */
export interface RoomOpenMessage {
  type: 'room-open';
  code?: string;
  key?: string;
}

/** Console: join by code; `token` (from an earlier `room`) keeps its callsign. */
export interface RoomJoinMessage {
  type: 'room-join';
  code: string;
  token?: string;
}

/** Either side leaves. The main screen leaving closes the room. */
export interface RoomLeaveMessage {
  type: 'room-leave';
}

/** Console: the track it has open, or null when it's back on the list. */
export interface RoomLookMessage {
  type: 'room-look';
  id: string | null;
}

/** Console: ask the main screen to show this track. */
export interface RoomSendMessage {
  type: 'room-send';
  id: string;
}

export type RoomClientMessage = RoomOpenMessage | RoomJoinMessage | RoomLeaveMessage | RoomLookMessage | RoomSendMessage;

const ROOM_CLIENT_TYPES: readonly string[] = ['room-open', 'room-join', 'room-leave', 'room-look', 'room-send'];

/** Whether a (parsed) browser message belongs to the ops room. */
export function isRoomRequest<M extends { type: string }>(message: M): message is Extract<M, RoomClientMessage> {
  return ROOM_CLIENT_TYPES.includes(message.type);
}

// Server -> browser

/** You opened (or reclaimed) this room as its main screen. */
export interface RoomMainMessage {
  type: 'room';
  serverTime: number;
  role: 'main';
  code: string;
  /** Proves this screen is the room's main screen when it reconnects. */
  key: string;
  /**
   * Addresses on this machine's network that phones can use, best first;
   * empty when the server listens only on this computer.
   */
  origins: string[];
}

/** You joined this room as a console. */
export interface RoomConsoleMessage {
  type: 'room';
  serverTime: number;
  role: 'console';
  code: string;
  callsign: ConsoleCallsign;
  /** Send it with the next join (after a reconnect) to keep this callsign. */
  token: string;
}

export type RoomMessage = RoomMainMessage | RoomConsoleMessage;

/** One console in the room and the track it has open, if any. */
export interface ConsolePresence {
  callsign: ConsoleCallsign;
  id: string | null;
}

/** Who is in the room now. Sent to every member whenever it changes. */
export interface RoomPresenceMessage {
  type: 'room-presence';
  serverTime: number;
  /** Whether the main screen is connected (it may be reconnecting). */
  main: boolean;
  /** Connected consoles only. */
  consoles: ConsolePresence[];
}

/** To the main screen: a console asks it to show this track. */
export interface RoomShowMessage {
  type: 'room-show';
  serverTime: number;
  id: string;
  from: ConsoleCallsign;
}

/**
 * Why you're not (or no longer) in a room: the main screen closed it or
 * never came back ('closed'), there's no room with that code ('not-found'),
 * the room or the server is full ('full'), or too many wrong codes were
 * tried lately and joining is paused for a minute ('busy').
 */
export type RoomClosedReason = 'closed' | 'not-found' | 'full' | 'busy';
export const ROOM_CLOSED_REASONS: readonly RoomClosedReason[] = ['closed', 'not-found', 'full', 'busy'];

export interface RoomClosedMessage {
  type: 'room-closed';
  serverTime: number;
  reason: RoomClosedReason;
}

export type RoomServerMessage = RoomMessage | RoomPresenceMessage | RoomShowMessage | RoomClosedMessage;
