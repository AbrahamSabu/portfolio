import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  CONSOLE_CALLSIGNS,
  MAX_CONSOLES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ConsoleCallsign,
  type RoomClientMessage,
  type RoomClosedReason,
  type RoomPresenceMessage,
  type RoomServerMessage,
} from '@watchfloor/shared';
import { createLogger } from '../log';

const log = createLogger('rooms');

/** How a room member is reached. The hub gives each browser one. */
export interface RoomPeer {
  send(message: RoomServerMessage): void;
}

/** The most rooms open at once: a household has a TV or two, not dozens. */
export const MAX_ROOMS = 16;
/** A main screen that drops off has this long to come back before its room closes. */
export const MAIN_GRACE_MS = 60_000;
/** A console that drops off (a phone locking its screen) keeps its callsign this long. */
export const CONSOLE_GRACE_MS = 120_000;
/** Opening and joining are paced per browser: a person taps, a script hammers. */
export const ATTEMPT_GAP_MS = 500;
/** A console can send the main screen a track at most this often. */
export const SEND_GAP_MS = 1_000;
/**
 * Wrong codes allowed across the whole server per minute. Past that, every
 * join waits out the minute, right code or not, so trying all ~530,000 codes
 * would take months, and a refusal says nothing about which codes exist.
 */
export const WRONG_CODES_PER_MINUTE = 20;
const WRONG_CODE_WINDOW_MS = 60_000;
/** Presence changes this close together go out as one message. */
const PRESENCE_COALESCE_MS = 100;
const SWEEP_MS = 5_000;

interface Seat {
  callsign: ConsoleCallsign;
  /** The console's secret: rejoining with it keeps the callsign. */
  token: string;
  /** Null while disconnected; the seat is kept for CONSOLE_GRACE_MS. */
  peer: RoomPeer | null;
  leftAt: number;
  /** The track it has open, if any. */
  looking: string | null;
  lastSendAt: number;
}

interface Room {
  code: string;
  /** The main screen's secret, for reclaiming the room after a reconnect. */
  key: string;
  /** Null while the main screen is reconnecting; the room closes MAIN_GRACE_MS later. */
  main: RoomPeer | null;
  mainLeftAt: number;
  /** By token, in the order they joined. */
  seats: Map<string, Seat>;
  presenceTimer: ReturnType<typeof setTimeout> | undefined;
}

/** A browser's place: a room's main screen (no seat) or one of its consoles. */
interface Membership {
  room: Room;
  seat: Seat | null;
}

export interface RoomsOptions {
  /** Addresses phones can use to reach this server, best first (lanOrigins.ts); asked when a room opens. */
  origins: () => string[];
  now?: () => number;
  /** Uniform random integer in [0, max): room codes and callsigns. */
  randomInt?: (max: number) => number;
  /** A fresh 16-byte secret in base64url: keys and tokens. */
  randomSecret?: () => string;
}

/**
 * The ops room's server side: rooms in memory, each with one main screen
 * and up to MAX_CONSOLES consoles. Presence goes to every member whenever
 * it changes; a console's track goes to its main screen only. Nothing is
 * saved: a room ends when its main screen leaves, or doesn't come back
 * within MAIN_GRACE_MS after its connection dropped.
 */
export class Rooms {
  private readonly rooms = new Map<string, Room>();
  private readonly members = new Map<RoomPeer, Membership>();
  private readonly lastAttemptAt = new WeakMap<RoomPeer, number>();
  /** When recent wrong codes were tried, oldest first. */
  private wrongCodes: number[] = [];
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => number;
  private readonly randomInt: (max: number) => number;
  private readonly randomSecret: () => string;

  constructor(private readonly opts: RoomsOptions) {
    this.now = opts.now ?? Date.now;
    this.randomInt = opts.randomInt ?? ((max) => randomInt(max));
    this.randomSecret = opts.randomSecret ?? (() => randomBytes(16).toString('base64url'));
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
        this.join(peer, message.code, message.token);
        return;
      case 'room-leave':
        this.leave(peer);
        return;
      case 'room-look':
        this.look(peer, message.id);
        return;
      case 'room-send':
        this.relay(peer, message.id);
        return;
    }
  }

  /** The browser's connection is gone. It may come back: its room or seat waits for it. */
  drop(peer: RoomPeer): void {
    const membership = this.members.get(peer);
    if (!membership) return;
    this.members.delete(peer);
    const { room, seat } = membership;
    if (seat) {
      seat.peer = null;
      seat.leftAt = this.now();
    } else {
      room.main = null;
      room.mainLeftAt = this.now();
    }
    this.presenceChanged(room);
  }

  /** Close rooms whose main screen didn't come back, and free seats nobody came back to. */
  sweep(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (!room.main && now - room.mainLeftAt >= MAIN_GRACE_MS) {
        this.close(room, 'main screen did not come back');
        continue;
      }
      for (const [token, seat] of room.seats) {
        if (!seat.peer && now - seat.leftAt >= CONSOLE_GRACE_MS) room.seats.delete(token);
      }
    }
    this.forgetOldWrongCodes(now);
  }

  private open(peer: RoomPeer): void {
    if (!this.paced(peer)) return;
    const current = this.members.get(peer);
    if (current && !current.seat) {
      // Already this room's main screen (a second press of Q): say so again.
      this.sendMain(current.room);
      return;
    }
    if (current) this.leave(peer);
    if (this.rooms.size >= MAX_ROOMS) {
      this.refuse(peer, 'full');
      return;
    }
    const room: Room = {
      code: this.newCode(),
      key: this.randomSecret(),
      main: peer,
      mainLeftAt: 0,
      seats: new Map(),
      presenceTimer: undefined,
    };
    this.rooms.set(room.code, room);
    this.members.set(peer, { room, seat: null });
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
    if (current && current.room !== room) this.leave(peer);
    // The old connection, if it hasn't been noticed as gone yet, gives the room up.
    if (room.main && room.main !== peer) this.replaced(room.main);
    room.main = peer;
    room.mainLeftAt = 0;
    this.members.set(peer, { room, seat: null });
    this.sendMain(room);
    this.presenceChanged(room);
  }

  private join(peer: RoomPeer, code: string, token: string | undefined): void {
    if (!this.paced(peer)) return;
    const now = this.now();
    this.forgetOldWrongCodes(now);
    if (this.wrongCodes.length >= WRONG_CODES_PER_MINUTE) {
      this.refuse(peer, 'busy');
      return;
    }
    const room = this.rooms.get(code);
    if (!room) {
      this.wrongCodes.push(now);
      this.refuse(peer, 'not-found');
      return;
    }
    const current = this.members.get(peer);
    if (current?.room === room && current.seat) {
      // Already in (a double tap): say so again.
      this.sendSeat(room, current.seat);
      return;
    }
    if (current) this.leave(peer);

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
      seat = { callsign: this.freeCallsign(room), token: this.randomSecret(), peer: null, leftAt: 0, looking: null, lastSendAt: 0 };
      room.seats.set(seat.token, seat);
      log.info('console joined', { callsign: seat.callsign, consoles: room.seats.size });
    }
    seat.peer = peer;
    seat.leftAt = 0;
    this.members.set(peer, { room, seat });
    this.sendSeat(room, seat);
    this.presenceChanged(room);
  }

  /** Leaving on purpose: a console gives up its seat; the main screen closes the room. */
  private leave(peer: RoomPeer): void {
    const membership = this.members.get(peer);
    if (!membership) return;
    const { room, seat } = membership;
    if (!seat) {
      this.close(room, 'closed by the main screen');
      return;
    }
    this.members.delete(peer);
    room.seats.delete(seat.token);
    this.presenceChanged(room);
  }

  private look(peer: RoomPeer, id: string | null): void {
    const membership = this.members.get(peer);
    const seat = membership?.seat;
    if (!membership || !seat || seat.looking === id) return;
    seat.looking = id;
    this.presenceChanged(membership.room);
  }

  /**
   * A console's track goes to the main screen as `room-show`. While the main
   * screen is reconnecting it's dropped: the consoles know from presence.
   */
  private relay(peer: RoomPeer, id: string): void {
    const membership = this.members.get(peer);
    const seat = membership?.seat;
    if (!membership || !seat) return;
    const now = this.now();
    if (now - seat.lastSendAt < SEND_GAP_MS) return;
    seat.lastSendAt = now;
    membership.room.main?.send({ type: 'room-show', serverTime: now, id, from: seat.callsign });
  }

  private close(room: Room, why: string): void {
    this.rooms.delete(room.code);
    clearTimeout(room.presenceTimer);
    const closed: RoomServerMessage = { type: 'room-closed', serverTime: this.now(), reason: 'closed' };
    for (const seat of room.seats.values()) {
      if (!seat.peer) continue;
      this.members.delete(seat.peer);
      seat.peer.send(closed);
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
    const message: RoomPresenceMessage = {
      type: 'room-presence',
      serverTime: this.now(),
      main: room.main !== null,
      consoles: [...room.seats.values()].filter((s) => s.peer).map((s) => ({ callsign: s.callsign, id: s.looking })),
    };
    room.main?.send(message);
    for (const seat of room.seats.values()) seat.peer?.send(message);
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
    while (this.wrongCodes.length > 0 && now - this.wrongCodes[0]! >= WRONG_CODE_WINDOW_MS) this.wrongCodes.shift();
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
}

/** Compares secrets in constant time, so response timing doesn't leak how much of a key was right. */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
