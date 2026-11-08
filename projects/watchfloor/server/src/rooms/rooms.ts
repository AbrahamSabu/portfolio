import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  CONSOLE_CALLSIGNS,
  MAX_CONSOLES,
  MAX_SCREENS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SCREEN_NAMES,
  type ConsoleCallsign,
  type RoomAction,
  type RoomClientMessage,
  type RoomClosedReason,
  type RoomPresenceMessage,
  type RoomServerMessage,
  type ScreenName,
  type ScreenPresence,
  type ScreenStatus,
} from '@watchfloor/shared';
import { createLogger } from '../log';

const log = createLogger('rooms');

/** How a room member is reached. The hub gives each browser one. */
export interface RoomPeer {
  /**
   * Who is asking, for per-person limits: the hub gives the visitor's
   * address (clientAddress.ts). Peers without one share one allowance.
   */
  readonly address?: string;
  send(message: RoomServerMessage): void;
}

/** The most rooms open at once, unless ROOMS_MAX says otherwise: a household has a TV or two, not dozens. */
export const MAX_ROOMS = 16;
/** Rooms one address may hold open at once: on a public server, one visitor mustn't take them all. */
export const MAX_ROOMS_PER_ADDRESS = 3;
/**
 * A main screen that drops off has this long to come back before its room
 * closes. Generous, because a hidden tab closes its socket after a quiet
 * minute (main.ts) and a laptop on the main screen may be behind another
 * window for a while; closing the page itself sends room-leave, so a room
 * whose screen is really gone doesn't linger.
 */
export const MAIN_GRACE_MS = 5 * 60_000;
/** A console or screen that drops off (a phone locking its screen) keeps its name this long. */
export const CONSOLE_GRACE_MS = 120_000;
/** Opening and joining are paced per browser: a person taps, a script hammers. */
export const ATTEMPT_GAP_MS = 500;
/** A console can show a screen a track at most this often... */
export const SEND_GAP_MS = 1_000;
/** ...and send it other actions this often: a dragged pad sends ten a second. */
export const CONTROL_GAP_MS = 50;
/**
 * Wrong codes one address may try per minute. Past that, its joins wait out
 * the minute, right code or not, so a refusal says nothing about which codes
 * exist and trying all ~530,000 codes would take months. Per address (it was
 * per server): on a public server one visitor mashing codes could otherwise
 * lock everyone out.
 */
export const WRONG_CODES_PER_MINUTE = 20;
/** ...and across all addresses: guessing spread over many addresses still has to wait. */
export const WRONG_CODES_PER_MINUTE_TOTAL = 200;
const WRONG_CODE_WINDOW_MS = 60_000;
/** Presence changes this close together go out as one message. */
const PRESENCE_COALESCE_MS = 100;
const SWEEP_MS = 5_000;

/** A console's place in a room. */
interface Seat {
  callsign: ConsoleCallsign;
  /** The console's secret: rejoining with it keeps the callsign. */
  token: string;
  /** Null while disconnected; the seat is kept for CONSOLE_GRACE_MS. */
  peer: RoomPeer | null;
  leftAt: number;
  /** The track it has open, if any. */
  looking: string | null;
  lastShowAt: number;
  lastControlAt: number;
}

/** Another screen's place in a room. */
interface ScreenSeat {
  name: ScreenName;
  token: string;
  peer: RoomPeer | null;
  leftAt: number;
  status: ScreenStatus | null;
}

interface Room {
  code: string;
  /** The main screen's secret, for reclaiming the room after a reconnect. */
  key: string;
  /** Null while the main screen is reconnecting; the room closes MAIN_GRACE_MS later. */
  main: RoomPeer | null;
  mainLeftAt: number;
  mainStatus: ScreenStatus | null;
  /** By token, in the order they joined. */
  screens: Map<string, ScreenSeat>;
  seats: Map<string, Seat>;
  presenceTimer: ReturnType<typeof setTimeout> | undefined;
  /** The address that opened it, for MAX_ROOMS_PER_ADDRESS. */
  owner: string | undefined;
}

/** A browser's place: a room's main screen, one of its other screens, or one of its consoles. */
type Membership =
  | { room: Room; kind: 'main' }
  | { room: Room; kind: 'screen'; screen: ScreenSeat }
  | { room: Room; kind: 'console'; seat: Seat };

export interface RoomsOptions {
  /** Addresses phones can use to reach this server, best first (lanOrigins.ts); asked when a room opens. */
  origins: () => string[];
  now?: () => number;
  /** Uniform random integer in [0, max): room codes and callsigns. */
  randomInt?: (max: number) => number;
  /** A fresh 16-byte secret in base64url: keys and tokens. */
  randomSecret?: () => string;
  /** Rooms open at once (ROOMS_MAX); MAX_ROOMS by default. */
  maxRooms?: number;
}

/**
 * The ops room's server side: rooms in memory, each with one main screen,
 * up to MAX_SCREENS other screens and up to MAX_CONSOLES consoles. Presence
 * goes to every member whenever it changes; a console's action goes only to
 * the screen it names. Nothing is saved: a room ends when its main screen
 * leaves, or doesn't come back within MAIN_GRACE_MS after its connection
 * dropped.
 */
export class Rooms {
  private readonly rooms = new Map<string, Room>();
  private readonly members = new Map<RoomPeer, Membership>();
  private readonly lastAttemptAt = new WeakMap<RoomPeer, number>();
  /** When recent wrong codes were tried, oldest first: per address, and all together. */
  private readonly wrongCodes = new Map<string, number[]>();
  private allWrongCodes: number[] = [];
  private readonly maxRooms: number;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => number;
  private readonly randomInt: (max: number) => number;
  private readonly randomSecret: () => string;

  constructor(private readonly opts: RoomsOptions) {
    this.now = opts.now ?? Date.now;
    this.randomInt = opts.randomInt ?? ((max) => randomInt(max));
    this.randomSecret = opts.randomSecret ?? (() => randomBytes(16).toString('base64url'));
    this.maxRooms = opts.maxRooms ?? MAX_ROOMS;
  }

  get size(): number {
    return this.rooms.size;
  }

  start(): void {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
  }

  stop(): void {
    clearInterval(this.sweepTimer);
    for (const room of this.rooms.values()) clearTimeout(room.presenceTimer);
  }

  handle(peer: RoomPeer, message: RoomClientMessage): void {
    switch (message.type) {
      case 'room-open':
        if (message.code !== undefined && message.key !== undefined) this.reclaim(peer, message.code, message.key);
        else this.open(peer);
        return;
      case 'room-join':
        this.join(peer, message.code, message.token, message.as === 'screen');
        return;
      case 'room-leave':
        this.leave(peer);
        return;
      case 'room-look':
        this.look(peer, message.id);
        return;
      case 'room-control':
        this.relay(peer, message.to, message.action);
        return;
      case 'room-status':
        this.status(peer, message.status);
        return;
    }
  }

  /** The browser's connection is gone. It may come back: its room or place waits for it. */
  drop(peer: RoomPeer): void {
    const membership = this.members.get(peer);
    if (!membership) return;
    this.members.delete(peer);
    const now = this.now();
    if (membership.kind === 'main') {
      membership.room.main = null;
      membership.room.mainLeftAt = now;
    } else {
      const place = membership.kind === 'screen' ? membership.screen : membership.seat;
      place.peer = null;
      place.leftAt = now;
    }
    this.presenceChanged(membership.room);
  }

  /** Close rooms whose main screen didn't come back, and free places nobody came back to. */
  sweep(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (!room.main && now - room.mainLeftAt >= MAIN_GRACE_MS) {
        this.close(room, 'main screen did not come back');
        continue;
      }
      for (const places of [room.seats, room.screens] as Array<Map<string, Seat | ScreenSeat>>) {
        for (const [token, place] of places) if (!place.peer && now - place.leftAt >= CONSOLE_GRACE_MS) places.delete(token);
      }
    }
    this.forgetOldWrongCodes(now);
  }

  private open(peer: RoomPeer): void {
    if (!this.paced(peer)) return;
    const current = this.members.get(peer);
    if (current?.kind === 'main') {
      // Already this room's main screen (a second press of Q): say so again.
      this.sendMain(current.room);
      return;
    }
    if (current) this.leave(peer);
    if (this.rooms.size >= this.maxRooms) {
      this.refuse(peer, 'full');
      return;
    }
    if (peer.address !== undefined) {
      let held = 0;
      for (const r of this.rooms.values()) if (r.owner === peer.address) held++;
      if (held >= MAX_ROOMS_PER_ADDRESS) {
        this.refuse(peer, 'full');
        return;
      }
    }
    const room: Room = {
      code: this.newCode(),
      key: this.randomSecret(),
      main: peer,
      mainLeftAt: 0,
      mainStatus: null,
      screens: new Map(),
      seats: new Map(),
      presenceTimer: undefined,
      owner: peer.address,
    };
    this.rooms.set(room.code, room);
    this.members.set(peer, { room, kind: 'main' });
    log.info('room opened', { rooms: this.rooms.size });
    this.sendMain(room);
    this.presenceChanged(room);
  }

  /**
   * A main screen back after a reconnect. The key proves it's the same one.
   * A wrong key isn't counted against the wrong-code budget: without the
   * key nothing can be learned, since a missing room and a wrong key get
   * the same answer.
   */
  private reclaim(peer: RoomPeer, code: string, key: string): void {
    if (!this.paced(peer)) return;
    const room = this.rooms.get(code);
    if (!room || !sameSecret(room.key, key)) {
      this.refuse(peer, 'not-found');
      return;
    }
    const current = this.members.get(peer);
    // A seat or screen of this very room is freed too, or it would outlive every grace period as a
    // zombie whose peer is the main (presence to a dead peer, a console slot gone for good).
    if (current && (current.room !== room || current.kind !== 'main')) this.leave(peer);
    // The old connection, if it hasn't been noticed as gone yet, gives the room up.
    if (room.main && room.main !== peer) this.replaced(room.main);
    room.main = peer;
    room.mainLeftAt = 0;
    this.members.set(peer, { room, kind: 'main' });
    this.sendMain(room);
    this.presenceChanged(room);
  }

  private join(peer: RoomPeer, code: string, token: string | undefined, asScreen: boolean): void {
    if (!this.paced(peer)) return;
    const now = this.now();
    this.forgetOldWrongCodes(now);
    const address = peer.address ?? '';
    const tried = this.wrongCodes.get(address) ?? [];
    const room = this.rooms.get(code);
    // A member back with its token has proved it belongs: it's seated even
    // during a busy minute, or a code-masher on the same address (an office
    // NAT, a proxy) would bounce a reconnecting phone out of its own room.
    // Both misses still answer busy, so nothing about which codes exist leaks.
    const rejoining = room !== undefined && token !== undefined && (asScreen ? room.screens.has(token) : room.seats.has(token));
    if (!rejoining && (tried.length >= WRONG_CODES_PER_MINUTE || this.allWrongCodes.length >= WRONG_CODES_PER_MINUTE_TOTAL)) {
      this.refuse(peer, 'busy');
      return;
    }
    if (!room) {
      tried.push(now);
      this.wrongCodes.set(address, tried);
      this.allWrongCodes.push(now);
      this.refuse(peer, 'not-found');
      return;
    }
    const current = this.members.get(peer);
    if (current?.room === room && current.kind === (asScreen ? 'screen' : 'console')) {
      // Already in (a double tap): say so again.
      if (current.kind === 'screen') this.sendScreen(room, current.screen);
      if (current.kind === 'console') this.sendSeat(room, current.seat);
      return;
    }
    if (current?.room === room && current.kind === 'main') {
      // The room's own main screen: leaving to be seated would close the room on the way. Say what it is again.
      this.sendMain(room);
      return;
    }
    if (current) this.leave(peer);
    if (asScreen) this.seatScreen(room, peer, token);
    else this.seatConsole(room, peer, token);
  }

  private seatConsole(room: Room, peer: RoomPeer, token: string | undefined): void {
    let seat = token ? room.seats.get(token) : undefined;
    if (seat) {
      // The same phone, back after a reconnect. If its old connection hasn't
      // been noticed as gone yet, this one replaces it.
      if (seat.peer && seat.peer !== peer) this.replaced(seat.peer);
    } else {
      if (room.seats.size >= MAX_CONSOLES) {
        this.refuse(peer, 'full');
        return;
      }
      seat = {
        callsign: this.freeCallsign(room),
        token: this.randomSecret(),
        peer: null,
        leftAt: 0,
        looking: null,
        lastShowAt: 0,
        lastControlAt: 0,
      };
      room.seats.set(seat.token, seat);
      log.info('console joined', { callsign: seat.callsign, consoles: room.seats.size });
    }
    seat.peer = peer;
    seat.leftAt = 0;
    this.members.set(peer, { room, kind: 'console', seat });
    this.sendSeat(room, seat);
    this.presenceChanged(room);
  }

  private seatScreen(room: Room, peer: RoomPeer, token: string | undefined): void {
    let screen = token ? room.screens.get(token) : undefined;
    if (screen) {
      if (screen.peer && screen.peer !== peer) this.replaced(screen.peer);
    } else {
      if (room.screens.size >= MAX_SCREENS) {
        this.refuse(peer, 'full');
        return;
      }
      screen = { name: this.freeScreenName(room), token: this.randomSecret(), peer: null, leftAt: 0, status: null };
      room.screens.set(screen.token, screen);
      log.info('screen joined', { name: screen.name, screens: room.screens.size });
    }
    screen.peer = peer;
    screen.leftAt = 0;
    this.members.set(peer, { room, kind: 'screen', screen });
    this.sendScreen(room, screen);
    this.presenceChanged(room);
  }

  /** Leaving on purpose: a console or screen gives up its place; the main screen closes the room. */
  private leave(peer: RoomPeer): void {
    const membership = this.members.get(peer);
    if (!membership) return;
    const { room } = membership;
    if (membership.kind === 'main') {
      this.close(room, 'closed by the main screen');
      return;
    }
    this.members.delete(peer);
    if (membership.kind === 'screen') room.screens.delete(membership.screen.token);
    else room.seats.delete(membership.seat.token);
    this.presenceChanged(room);
  }

  private look(peer: RoomPeer, id: string | null): void {
    const membership = this.members.get(peer);
    if (membership?.kind !== 'console' || membership.seat.looking === id) return;
    membership.seat.looking = id;
    this.presenceChanged(membership.room);
  }

  /**
   * A console's action goes to the screen it names, and nowhere else: screens
   * never steer each other. One the room doesn't have, or that is away, gets
   * nothing; the console knows from presence which screens are there.
   */
  private relay(peer: RoomPeer, to: ScreenName, action: RoomAction): void {
    const membership = this.members.get(peer);
    if (membership?.kind !== 'console') return;
    const { seat, room } = membership;
    const now = this.now();
    if (action.do === 'show') {
      if (now - seat.lastShowAt < SEND_GAP_MS) return;
      seat.lastShowAt = now;
    } else {
      if (now - seat.lastControlAt < CONTROL_GAP_MS) return;
      seat.lastControlAt = now;
    }
    const target = to === 'MAIN' ? room.main : ([...room.screens.values()].find((s) => s.name === to)?.peer ?? null);
    target?.send({ type: 'room-control', serverTime: now, from: seat.callsign, action });
  }

  /** A screen says what it's showing: consoles get it with the presence. */
  private status(peer: RoomPeer, status: ScreenStatus): void {
    const membership = this.members.get(peer);
    if (membership?.kind === 'main') membership.room.mainStatus = status;
    else if (membership?.kind === 'screen') membership.screen.status = status;
    else return;
    this.presenceChanged(membership.room);
  }

  private close(room: Room, why: string): void {
    this.rooms.delete(room.code);
    clearTimeout(room.presenceTimer);
    const closed: RoomServerMessage = { type: 'room-closed', serverTime: this.now(), reason: 'closed' };
    for (const place of [...room.seats.values(), ...room.screens.values()]) {
      if (!place.peer) continue;
      this.members.delete(place.peer);
      place.peer.send(closed);
    }
    if (room.main) {
      this.members.delete(room.main);
      room.main.send(closed);
    }
    log.info('room closed', { why, rooms: this.rooms.size });
  }

  /** A newer connection took this one's place in its room (usually it's a dead socket). */
  private replaced(peer: RoomPeer): void {
    this.members.delete(peer);
    this.refuse(peer, 'closed');
  }

  private refuse(peer: RoomPeer, reason: RoomClosedReason): void {
    peer.send({ type: 'room-closed', serverTime: this.now(), reason });
  }

  private sendMain(room: Room): void {
    room.main?.send({ type: 'room', serverTime: this.now(), role: 'main', code: room.code, key: room.key, origins: this.opts.origins() });
  }

  private sendScreen(room: Room, screen: ScreenSeat): void {
    screen.peer?.send({ type: 'room', serverTime: this.now(), role: 'screen', code: room.code, name: screen.name, token: screen.token });
  }

  private sendSeat(room: Room, seat: Seat): void {
    seat.peer?.send({ type: 'room', serverTime: this.now(), role: 'console', code: room.code, callsign: seat.callsign, token: seat.token });
  }

  private presenceChanged(room: Room): void {
    room.presenceTimer ??= setTimeout(() => {
      room.presenceTimer = undefined;
      this.sendPresence(room);
    }, PRESENCE_COALESCE_MS);
  }

  private sendPresence(room: Room): void {
    if (this.rooms.get(room.code) !== room) return; // closed meanwhile
    const screen = (name: ScreenName, status: ScreenStatus | null): ScreenPresence => (status ? { name, status } : { name });
    const message: RoomPresenceMessage = {
      type: 'room-presence',
      serverTime: this.now(),
      screens: [
        ...(room.main ? [screen('MAIN', room.mainStatus)] : []),
        ...[...room.screens.values()].filter((s) => s.peer).map((s) => screen(s.name, s.status)),
      ],
      consoles: [...room.seats.values()].filter((s) => s.peer).map((s) => ({ callsign: s.callsign, id: s.looking })),
    };
    room.main?.send(message);
    for (const place of [...room.screens.values(), ...room.seats.values()]) place.peer?.send(message);
  }

  /** True if this browser may try opening or joining now. */
  private paced(peer: RoomPeer): boolean {
    const now = this.now();
    const last = this.lastAttemptAt.get(peer);
    if (last !== undefined && now - last < ATTEMPT_GAP_MS) return false;
    this.lastAttemptAt.set(peer, now);
    return true;
  }

  private forgetOldWrongCodes(now: number): void {
    const forget = (times: number[]) => {
      while (times.length > 0 && now - times[0]! >= WRONG_CODE_WINDOW_MS) times.shift();
    };
    forget(this.allWrongCodes);
    for (const [address, times] of this.wrongCodes) {
      forget(times);
      if (times.length === 0) this.wrongCodes.delete(address);
    }
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[this.randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  /** A callsign no seat in the room holds, at random, so names don't hint at join order or count. */
  private freeCallsign(room: Room): ConsoleCallsign {
    const taken = new Set([...room.seats.values()].map((s) => s.callsign));
    const free = CONSOLE_CALLSIGNS.filter((c) => !taken.has(c));
    return free[this.randomInt(free.length)]!;
  }

  /** The lowest screen number not taken: people count screens, so these go in order. */
  private freeScreenName(room: Room): ScreenName {
    const taken = new Set([...room.screens.values()].map((s) => s.name));
    return SCREEN_NAMES.slice(1).find((n) => !taken.has(n))!;
  }
}

/** Compares secrets in constant time, so response timing doesn't leak how much of a key was right. */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
