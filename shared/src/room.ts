/**
 * The ops room: one main screen (the map on a laptop or TV), other screens
 * that joined it (a TV showing its own view), and the phones that joined it
 * as consoles. A console browses the picture, says which track it has open
 * (presence, tagged on every screen's map), and steers one screen of its
 * choosing: show a track, pan and zoom, switch layers, start the tour, ride
 * along with an aircraft, fly to a place, point and click on it as a mouse
 * would, or press its keys. Screens never steer each other. Rooms live in the server's
 * memory only, and end when the main screen leaves.
 *
 * Flow (protocol v18):
 *   main screen  room-open                        -> room { role: 'main', code, key, origins }
 *   screen       room-join { code, as: 'screen' } -> room { role: 'screen', name, token }
 *   console      room-join { code }               -> room { role: 'console', callsign, token }
 *   everyone in the room                          <- room-presence, whenever it changes
 *   screens      room-status { status }              (layers, tour, follow, riding: for consoles' switches)
 *   console      room-look { id | null }             (the track it has open)
 *   console      room-control { to, action }      -> that screen gets room-control { from, action }
 *   anyone       room-leave                          (the main screen leaving closes the room)
 *   refusals and endings                          <- room-closed { reason }
 *
 * After a reconnect the main screen reclaims its room with `code` and `key`,
 * and a screen or console rejoins with its `token`, which keeps its name.
 */

/**
 * Room codes are short enough to type on a phone or with a TV remote: four
 * characters, without vowels (so a code never spells a word) and without
 * the characters people misread (0 and O, 1, I and L).
 */
export const ROOM_CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXZ23456789';
export const ROOM_CODE_LENGTH = 4;
const ROOM_CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** The main screen's key and a screen's or console's token: 16 random bytes in base64url. */
const ROOM_SECRET = /^[A-Za-z0-9_-]{22}$/;

/**
 * What consoles are called on the screens, as in CONSOLE ALFA. The server
 * picks one, so nothing a phone types ever reaches a screen.
 */
export const CONSOLE_CALLSIGNS = [
  'ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA',
  'JULIETT', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO',
  'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY', 'XRAY', 'YANKEE', 'ZULU',
] as const;
export type ConsoleCallsign = (typeof CONSOLE_CALLSIGNS)[number];

/**
 * Screens by name: the one that opened the room, then the others in the
 * order of the free names. These are addresses, and never change while a
 * screen is in the room; people see each screen's kind instead (below).
 */
export const SCREEN_NAMES = ['MAIN', 'SCREEN 2', 'SCREEN 3', 'SCREEN 4', 'SCREEN 5'] as const;
export type ScreenName = (typeof SCREEN_NAMES)[number];

/**
 * What a screen is, as people call it: the label on the phones' steering
 * buttons and in every screen's room list. Chosen on the screen itself from
 * this closed list (nothing typed reaches another device) and sent with its
 * status, so changing it never changes the screen's address.
 */
export const SCREEN_KINDS = ['laptop', 'tablet', 'tv', 'phone', 'monitor', 'projector'] as const;
export type ScreenKind = (typeof SCREEN_KINDS)[number];
export const SCREEN_KIND_LABEL: Record<ScreenKind, string> = {
  laptop: 'Laptop',
  tablet: 'Tablet',
  tv: 'TV',
  phone: 'Phone',
  monitor: 'Monitor',
  projector: 'Projector',
};

/** The most consoles one room takes (fewer than there are callsigns). */
export const MAX_CONSOLES = 12;
/** The most screens besides the main one. */
export const MAX_SCREENS = SCREEN_NAMES.length - 1;
/** The most addresses the server offers for the join link. */
export const MAX_JOIN_ORIGINS = 8;

/**
 * The map layers a console can switch on a screen. Trails count as on
 * unless off; `symbols` on means military symbols instead of vehicle shapes;
 * `stack` is the tilted 3D view (E), and `score` the sound of the sky (Y),
 * which a browser lets a page play only once someone has touched it.
 */
export const LAYER_NAMES = [
  'news', 'trails', 'symbols', 'radar', 'airports', 'hazards', 'findings', 'chokepoints',
  'satellites', 'currents', 'stack', 'score',
] as const;
export type LayerName = (typeof LAYER_NAMES)[number];
export type LayerState = Partial<Record<LayerName, boolean>>;

/** What a screen is showing, so a console's switches tell the truth. */
export interface ScreenStatus {
  layers: LayerState;
  /** The cinematic tour is running. */
  tour: boolean;
  /** The camera follows the selected track. */
  follow: boolean;
  /** The aircraft this screen is riding along with (J), while it is. */
  riding?: string;
  /** What the screen is (a laptop, a TV...), as its own Ops room dialog says. */
  kind?: ScreenKind;
  /** The track selected on the screen, if any: a console opens its card. */
  selected?: string;
}

/**
 * Everything a console can ask a screen to do: a closed list, each checked
 * strictly. Pan is a fraction of the screen (drag the map with your finger),
 * zoom one step either way, fly to a place, or show a track as a search pick
 * would.
 */
export type RoomAction =
  | { do: 'show'; id: string }
  | { do: 'pan'; dx: number; dy: number }
  | { do: 'zoom'; by: 1 | -1 }
  | { do: 'home' }
  | { do: 'follow'; on: boolean }
  | { do: 'clear' }
  | { do: 'tour'; on: boolean }
  | { do: 'layer'; layer: LayerName; on: boolean }
  /** Ride along with an aircraft, as J would; null leaves the ride. */
  | { do: 'ride'; id: string | null }
  | { do: 'fly'; lon: number; lat: number; zoom: number }
  /** Move the screen's pointer by a fraction of the screen: a finger on the phone's pad. */
  | { do: 'point'; dx: number; dy: number }
  /** Click whatever is under the pointer, as a mouse would. */
  | { do: 'click' }
  /** Press (true) or release (false) at the pointer; moves in between drag. */
  | { do: 'press'; down: boolean }
  /** Press one of the map's keys on the screen, as if typed there. */
  | { do: 'key'; key: RemoteKey };

/**
 * The keys a console can press on a screen: the map key's shortcuts, less
 * those that need typing there (/ search, W drawing an area) and Q (a
 * console mustn't open the room's own dialog). The client's shortcut list
 * is checked against this in a test, so a new shortcut can't be forgotten.
 */
export const REMOTE_KEYS = [
  'M', 'L', 'G', 'Y', 'V', 'Z', 'U', 'P', 'E', 'J', 'F', 'T', 'I', 'S', 'N', 'B', 'A', 'H', 'D', 'C', 'O', 'X', 'R', '?', 'Escape',
] as const;
export type RemoteKey = (typeof REMOTE_KEYS)[number];
export const isRemoteKey = (v: unknown): v is RemoteKey => typeof v === 'string' && (REMOTE_KEYS as readonly string[]).includes(v);

export const isRoomCode = (v: unknown): v is string => typeof v === 'string' && ROOM_CODE.test(v);
export const isRoomSecret = (v: unknown): v is string => typeof v === 'string' && ROOM_SECRET.test(v);
export const isConsoleCallsign = (v: unknown): v is ConsoleCallsign =>
  typeof v === 'string' && (CONSOLE_CALLSIGNS as readonly string[]).includes(v);
export const isScreenName = (v: unknown): v is ScreenName => typeof v === 'string' && (SCREEN_NAMES as readonly string[]).includes(v);
export const isLayerName = (v: unknown): v is LayerName => typeof v === 'string' && (LAYER_NAMES as readonly string[]).includes(v);
export const isScreenKind = (v: unknown): v is ScreenKind => typeof v === 'string' && (SCREEN_KINDS as readonly string[]).includes(v);

/**
 * What people call each screen: its kind, numbered when two share one
 * ("Tablet", "Tablet 2"), or, before it has said, "Main screen" or
 * "Screen 2" from its name.
 */
export function screenLabels(screens: readonly { name: ScreenName; status?: { kind?: ScreenKind } }[]): Map<ScreenName, string> {
  const labels = new Map<ScreenName, string>();
  const seen = new Map<ScreenKind, number>();
  for (const { name, status } of screens) {
    const kind = status?.kind;
    if (!kind) {
      labels.set(name, name === 'MAIN' ? 'Main screen' : `Screen ${name.slice('SCREEN '.length)}`);
      continue;
    }
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    labels.set(name, n === 1 ? SCREEN_KIND_LABEL[kind] : `${SCREEN_KIND_LABEL[kind]} ${n}`);
  }
  return labels;
}

/**
 * An address a phone can open, and nothing else: http or https, a host name,
 * IPv4 or bracketed IPv6 address, and maybe a port. It ends up in a link and
 * a QR code, so a `javascript:` URL or a path must never pass.
 */
export const isJoinOrigin = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 100 && /^https?:\/\/(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/.test(v);

/**
 * Whether a host (one the server binds, or a page's) is reachable from this
 * computer only, so a phone can't use it.
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h);
}

/**
 * Where phones should be sent to join: the page's own address when other
 * devices can use it (opened by network address, or a public https host),
 * otherwise the server's network addresses, which are none while it listens
 * on this computer only.
 */
export function joinOrigins(page: { origin: string; hostname: string }, serverOrigins: readonly string[]): string[] {
  return isLoopbackHost(page.hostname) ? [...serverOrigins] : [page.origin];
}

/** A code as someone typed it: any case, spaces or a dash in the middle. */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]+/g, '');
}

/** Where a phone joins: the console page, with the code in the link. */
export function joinUrl(origin: string, code: string): string {
  return `${origin}/console.html?room=${code}`;
}

/** Where another screen joins: the map itself, with the code in the link. */
export function screenUrl(origin: string, code: string): string {
  return `${origin}/?screen=${code}`;
}

// Browser -> server

/** Main screen: open a room, or reclaim its own after a reconnect (`code` and `key` together). */
export interface RoomOpenMessage {
  type: 'room-open';
  code?: string;
  key?: string;
}

/** A console (or, with `as: 'screen'`, another screen) joins by code; `token` keeps its name. */
export interface RoomJoinMessage {
  type: 'room-join';
  code: string;
  token?: string;
  as?: 'screen';
}

/** Anyone leaves. The main screen leaving closes the room. */
export interface RoomLeaveMessage {
  type: 'room-leave';
}

/** Console: the track it has open, or null when it's back on the list. */
export interface RoomLookMessage {
  type: 'room-look';
  id: string | null;
}

/** Console: ask one screen to do something. */
export interface RoomControlMessage {
  type: 'room-control';
  to: ScreenName;
  action: RoomAction;
}

/** A screen (the main one included): what it is showing now. */
export interface RoomStatusMessage {
  type: 'room-status';
  status: ScreenStatus;
}

export type RoomClientMessage =
  | RoomOpenMessage
  | RoomJoinMessage
  | RoomLeaveMessage
  | RoomLookMessage
  | RoomControlMessage
  | RoomStatusMessage;

const ROOM_CLIENT_TYPES: readonly string[] = ['room-open', 'room-join', 'room-leave', 'room-look', 'room-control', 'room-status'];

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

/** You joined this room as another screen. */
export interface RoomScreenMessage {
  type: 'room';
  serverTime: number;
  role: 'screen';
  code: string;
  name: ScreenName;
  /** Send it with the next join (after a reconnect) to keep this name. */
  token: string;
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

export type RoomMessage = RoomMainMessage | RoomScreenMessage | RoomConsoleMessage;

/** One console in the room and the track it has open, if any. */
export interface ConsolePresence {
  callsign: ConsoleCallsign;
  id: string | null;
}

/** One connected screen, and what it last said it is showing. */
export interface ScreenPresence {
  name: ScreenName;
  status?: ScreenStatus;
}

/** Who is in the room now. Sent to every member whenever it changes. */
export interface RoomPresenceMessage {
  type: 'room-presence';
  serverTime: number;
  /** Connected screens only; MAIN missing means the main screen is away (hidden or reconnecting). */
  screens: ScreenPresence[];
  /** Connected consoles only. */
  consoles: ConsolePresence[];
}

/** To one screen: a console asks it to do this. */
export interface RoomControlNotice {
  type: 'room-control';
  serverTime: number;
  from: ConsoleCallsign;
  action: RoomAction;
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

export type RoomServerMessage = RoomMessage | RoomPresenceMessage | RoomControlNotice | RoomClosedMessage;
