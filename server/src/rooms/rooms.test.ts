import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CONSOLES,
  MAX_SCREENS,
  type RoomAction,
  type RoomConsoleMessage,
  type RoomMainMessage,
  type RoomScreenMessage,
  type RoomServerMessage,
  type ScreenName,
} from '@watchfloor/shared';
import {
  CONSOLE_GRACE_MS,
  CONTROL_GAP_MS,
  MAIN_GRACE_MS,
  MAX_ROOMS,
  MAX_ROOMS_PER_ADDRESS,
  Rooms,
  SEND_GAP_MS,
  WRONG_CODES_PER_MINUTE,
  WRONG_CODES_PER_MINUTE_TOTAL,
  type RoomPeer,
} from './rooms';

/** A browser as the rooms service sees it: it records what it's sent. */
class Peer implements RoomPeer {
  readonly got: RoomServerMessage[] = [];
  constructor(readonly address?: string) {}
  send(message: RoomServerMessage): void {
    this.got.push(message);
  }
  last<T extends RoomServerMessage['type']>(type: T): Extract<RoomServerMessage, { type: T }> | undefined {
    return this.got.filter((m): m is Extract<RoomServerMessage, { type: T }> => m.type === type).at(-1);
  }
  count(type: RoomServerMessage['type']): number {
    return this.got.filter((m) => m.type === type).length;
  }
  /** The actions this screen was asked to do, in order. */
  actions(): RoomAction[] {
    return this.got.flatMap((m) => (m.type === 'room-control' ? [m.action] : []));
  }
}

const STATUS = { layers: { news: true, radar: false }, tour: false, follow: false };

describe('Rooms', () => {
  let t: number;
  let rooms: Rooms;
  /** Moves the clock past every pacing gap and lets presence go out. */
  const later = (ms = 1_000) => {
    t += ms;
    vi.advanceTimersByTime(ms);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    t = Date.parse('2026-11-06T18:00:00Z');
    rooms = new Rooms({ origins: () => ['http://192.168.1.20:8103'], now: () => t });
  });

  afterEach(() => {
    rooms.stop();
    vi.useRealTimers();
  });

  /** A main screen with a room, and its code. */
  const openRoom = () => {
    const main = new Peer();
    rooms.handle(main, { type: 'room-open' });
    const room = main.last('room') as RoomMainMessage;
    return { main, code: room.code, key: room.key };
  };
  const joinRoom = (code: string, token?: string) => {
    const phone = new Peer();
    rooms.handle(phone, { type: 'room-join', code, ...(token ? { token } : {}) });
    return phone;
  };
  const joinScreen = (code: string, token?: string) => {
    const tv = new Peer();
    rooms.handle(tv, { type: 'room-join', code, as: 'screen', ...(token ? { token } : {}) });
    return tv;
  };
  const steer = (phone: Peer, to: ScreenName, action: RoomAction) => rooms.handle(phone, { type: 'room-control', to, action });
  const show = (phone: Peer, id: string, to: ScreenName = 'MAIN') => steer(phone, to, { do: 'show', id });
  const names = (peer: Peer) => peer.last('room-presence')?.screens.map((s) => s.name);
  /** A valid code that isn't this one. */
  const otherCode = (code: string) => (code.startsWith('B') ? `C${code.slice(1)}` : `B${code.slice(1)}`);

  it('opens a room and tells the main screen its code, key and addresses', () => {
    const { main, code, key } = openRoom();
    expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXZ2-9]{4}$/);
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(main.last('room')).toMatchObject({ role: 'main', origins: ['http://192.168.1.20:8103'] });
    later();
    expect(main.last('room-presence')).toMatchObject({ screens: [{ name: 'MAIN' }], consoles: [] });
  });

  it('answers a second press of Q with the same room', () => {
    const { main, code } = openRoom();
    later();
    rooms.handle(main, { type: 'room-open' });
    expect(main.count('room')).toBe(2);
    expect((main.last('room') as RoomMainMessage).code).toBe(code);
    expect(rooms.size).toBe(1);
  });

  it('seats consoles under different callsigns, and tells everyone who is in', () => {
    const { main, code } = openRoom();
    const a = joinRoom(code);
    const b = joinRoom(code);
    const seatA = a.last('room') as RoomConsoleMessage;
    const seatB = b.last('room') as RoomConsoleMessage;
    expect(seatA).toMatchObject({ role: 'console', code });
    expect(seatA.callsign).not.toBe(seatB.callsign);
    expect(seatA.token).not.toBe(seatB.token);
    later();
    const presence = { screens: [{ name: 'MAIN' }], consoles: [{ callsign: seatA.callsign, id: null }, { callsign: seatB.callsign, id: null }] };
    for (const peer of [main, a, b]) expect(peer.last('room-presence')).toMatchObject(presence);
  });

  it('names other screens in order, and turns them away past the limit', () => {
    const { main, code } = openRoom();
    const tv = joinScreen(code);
    const den = joinScreen(code);
    expect(tv.last('room')).toMatchObject({ role: 'screen', code, name: 'SCREEN 2' });
    expect((den.last('room') as RoomScreenMessage).name).toBe('SCREEN 3');
    for (let i = 2; i < MAX_SCREENS; i++) joinScreen(code);
    expect(joinScreen(code).last('room-closed')?.reason).toBe('full');
    later();
    expect(names(main)).toEqual(['MAIN', 'SCREEN 2', 'SCREEN 3', 'SCREEN 4', 'SCREEN 5']);
    expect(names(tv)).toEqual(names(main));
  });

  it("shows what each console has open, latest only when it changes quickly", () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    later();
    const before = main.count('room-presence');
    rooms.handle(phone, { type: 'room-look', id: 'sim:air-0001' });
    rooms.handle(phone, { type: 'room-look', id: 'sim:air-0002' });
    later(150);
    expect(main.count('room-presence')).toBe(before + 1);
    expect(main.last('room-presence')?.consoles[0]?.id).toBe('sim:air-0002');
  });

  it("sends a console's track to the main screen, at most once a second", () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    const { callsign } = phone.last('room') as RoomConsoleMessage;
    show(phone, 'sim:air-0001');
    show(phone, 'sim:air-0002');
    expect(main.got.filter((m) => m.type === 'room-control')).toEqual([
      { type: 'room-control', serverTime: t, from: callsign, action: { do: 'show', id: 'sim:air-0001' } },
    ]);
    later(SEND_GAP_MS);
    show(phone, 'sim:air-0002');
    expect(main.actions().at(-1)).toEqual({ do: 'show', id: 'sim:air-0002' });
  });

  it('steers only the screen a console names, never the others', () => {
    const { main, code } = openRoom();
    const tv = joinScreen(code);
    const phone = joinRoom(code);
    steer(phone, 'SCREEN 2', { do: 'zoom', by: 1 });
    later(CONTROL_GAP_MS);
    steer(phone, 'SCREEN 2', { do: 'layer', layer: 'radar', on: true });
    later(CONTROL_GAP_MS);
    steer(phone, 'SCREEN 4', { do: 'home' }); // no such screen: nobody hears it
    expect(tv.actions()).toEqual([{ do: 'zoom', by: 1 }, { do: 'layer', layer: 'radar', on: true }]);
    expect(main.actions()).toEqual([]);
  });

  it('paces quick actions, and keeps showing tracks on its own slower pace', () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    steer(phone, 'MAIN', { do: 'pan', dx: 0.1, dy: 0 });
    steer(phone, 'MAIN', { do: 'pan', dx: 0.2, dy: 0 }); // too soon: dropped
    show(phone, 'sim:air-0001'); // a different budget
    later(CONTROL_GAP_MS);
    steer(phone, 'MAIN', { do: 'pan', dx: 0.3, dy: 0 });
    expect(main.actions()).toEqual([
      { do: 'pan', dx: 0.1, dy: 0 },
      { do: 'show', id: 'sim:air-0001' },
      { do: 'pan', dx: 0.3, dy: 0 },
    ]);
  });

  it('ignores looks, actions and status from browsers that may not send them', () => {
    const { main, code } = openRoom();
    const tv = joinScreen(code);
    const stranger = new Peer();
    steer(stranger, 'MAIN', { do: 'show', id: 'sim:air-0001' });
    rooms.handle(stranger, { type: 'room-look', id: 'sim:air-0001' });
    rooms.handle(stranger, { type: 'room-status', status: STATUS });
    steer(main, 'SCREEN 2', { do: 'home' }); // screens never steer each other
    steer(tv, 'MAIN', { do: 'home' });
    const phone = joinRoom(code);
    rooms.handle(phone, { type: 'room-status', status: STATUS }); // only screens report status
    later();
    expect(main.actions()).toEqual([]);
    expect(tv.actions()).toEqual([]);
    expect(main.last('room-presence')?.screens).toEqual([{ name: 'MAIN' }, { name: 'SCREEN 2' }]);
    expect(stranger.got).toEqual([]);
  });

  it("passes each screen's status to everyone, for the consoles' switches", () => {
    const { main, code } = openRoom();
    const tv = joinScreen(code);
    const phone = joinRoom(code);
    rooms.handle(main, { type: 'room-status', status: STATUS });
    rooms.handle(tv, { type: 'room-status', status: { ...STATUS, tour: true } });
    later();
    expect(phone.last('room-presence')?.screens).toEqual([
      { name: 'MAIN', status: STATUS },
      { name: 'SCREEN 2', status: { ...STATUS, tour: true } },
    ]);
  });

  it('refuses a wrong code, then pauses all joining once too many were tried', () => {
    const { code } = openRoom();
    expect(joinRoom(otherCode(code)).last('room-closed')?.reason).toBe('not-found');
    for (let i = 1; i < WRONG_CODES_PER_MINUTE; i++) joinScreen(otherCode(code));
    // Even the right code waits: a refusal must not tell a guesser which codes exist.
    expect(joinRoom(code).last('room-closed')?.reason).toBe('busy');
    later(60_000);
    expect(joinRoom(code).last('room')?.role).toBe('console');
  });

  it('counts wrong codes per address, so a guesser locks out only itself', () => {
    const { code } = openRoom();
    for (let i = 0; i < WRONG_CODES_PER_MINUTE; i++) rooms.handle(new Peer('203.0.113.9'), { type: 'room-join', code: otherCode(code) });
    const guesser = new Peer('203.0.113.9');
    rooms.handle(guesser, { type: 'room-join', code });
    expect(guesser.last('room-closed')?.reason).toBe('busy');
    const neighbour = new Peer('198.51.100.4');
    rooms.handle(neighbour, { type: 'room-join', code });
    expect(neighbour.last('room')?.role).toBe('console');
  });

  it('still pauses everyone when the guessing comes from many addresses', () => {
    const { code } = openRoom();
    for (let i = 0; i < WRONG_CODES_PER_MINUTE_TOTAL; i++) {
      rooms.handle(new Peer(`10.0.${Math.floor(i / 250)}.${i % 250}`), { type: 'room-join', code: otherCode(code) });
    }
    const late = new Peer('198.51.100.4');
    rooms.handle(late, { type: 'room-join', code });
    expect(late.last('room-closed')?.reason).toBe('busy');
    later(60_000);
    const again = new Peer('198.51.100.4');
    rooms.handle(again, { type: 'room-join', code });
    expect(again.last('room')?.role).toBe('console');
  });

  it('lets one address hold a few rooms, not all of them', () => {
    const open = (address: string) => {
      const peer = new Peer(address);
      rooms.handle(peer, { type: 'room-open' });
      return peer;
    };
    for (let i = 0; i < MAX_ROOMS_PER_ADDRESS; i++) expect(open('203.0.113.9').last('room')).toBeDefined();
    expect(open('203.0.113.9').last('room-closed')?.reason).toBe('full');
    expect(open('198.51.100.4').last('room')).toBeDefined();
  });

  it('takes the number of rooms from its options (ROOMS_MAX)', () => {
    const small = new Rooms({ origins: () => [], now: () => t, maxRooms: 2 });
    const open = () => {
      const peer = new Peer();
      small.handle(peer, { type: 'room-open' });
      return peer;
    };
    expect(open().last('room')).toBeDefined();
    expect(open().last('room')).toBeDefined();
    expect(open().last('room-closed')?.reason).toBe('full');
    small.stop();
  });

  it('ignores the main screen trying to join its own room (it used to close the room on the way)', () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    later();
    rooms.handle(main, { type: 'room-join', code, as: 'screen' });
    later();
    expect(rooms.size).toBe(1);
    expect(main.last('room')?.role).toBe('main');
    expect(phone.last('room-closed')).toBeUndefined();
  });

  it('frees a console seat whose socket reclaims the room as main, so no zombie seat outlives the grace', () => {
    const { main, code, key } = openRoom();
    const phone = joinRoom(code);
    later();
    const callsign = (phone.last('room') as RoomConsoleMessage).callsign;
    rooms.handle(phone, { type: 'room-open', code, key });
    later();
    expect(main.last('room-closed')?.reason).toBe('closed'); // the old main was replaced, as designed
    rooms.drop(phone);
    later(CONSOLE_GRACE_MS + 10_000);
    const main2 = new Peer();
    rooms.handle(main2, { type: 'room-open', code, key });
    later();
    expect(main2.last('room-presence')?.consoles.map((c) => c.callsign)).not.toContain(callsign);
  });

  it('seats a member back with its token even while its address is paused for wrong codes', () => {
    const { code } = openRoom();
    const phone = new Peer('203.0.113.5');
    rooms.handle(phone, { type: 'room-join', code });
    later();
    const { token, callsign } = phone.last('room') as RoomConsoleMessage;
    // Someone else behind that address (an office NAT, a proxy) mashes wrong codes.
    for (let i = 0; i < WRONG_CODES_PER_MINUTE; i++) rooms.handle(new Peer('203.0.113.5'), { type: 'room-join', code: otherCode(code) });
    rooms.drop(phone);
    later();
    const back = new Peer('203.0.113.5');
    rooms.handle(back, { type: 'room-join', code, token });
    expect((back.last('room') as RoomConsoleMessage | undefined)?.callsign).toBe(callsign);
    // A stranger on that address still waits, right code or not.
    const stranger = new Peer('203.0.113.5');
    rooms.handle(stranger, { type: 'room-join', code });
    expect(stranger.last('room-closed')?.reason).toBe('busy');
  });

  it('turns away a console when the room is full, and a room when the server is', () => {
    const { code } = openRoom();
    for (let i = 0; i < MAX_CONSOLES; i++) expect(joinRoom(code).last('room')).toBeDefined();
    expect(joinRoom(code).last('room-closed')?.reason).toBe('full');
    for (let i = 1; i < MAX_ROOMS; i++) openRoom();
    const late = new Peer();
    rooms.handle(late, { type: 'room-open' });
    expect(late.last('room-closed')?.reason).toBe('full');
  });

  it('closes the room for every screen and console when the main screen leaves', () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    const tv = joinScreen(code);
    rooms.handle(main, { type: 'room-leave' });
    for (const peer of [phone, tv, main]) expect(peer.last('room-closed')?.reason).toBe('closed');
    expect(rooms.size).toBe(0);
    later();
    expect(joinRoom(code).last('room-closed')?.reason).toBe('not-found');
  });

  it('lets a screen leave without ending the room', () => {
    const { main, code } = openRoom();
    const tv = joinScreen(code);
    later();
    rooms.handle(tv, { type: 'room-leave' });
    later();
    expect(names(main)).toEqual(['MAIN']);
    expect(rooms.size).toBe(1);
  });

  it('keeps the room while the main screen reconnects, for the holder of its key', () => {
    const { main, code, key } = openRoom();
    const phone = joinRoom(code);
    rooms.drop(main);
    later();
    expect(names(phone)).toEqual([]);
    // A track sent meanwhile goes nowhere; the phone knows the screen is away.
    show(phone, 'sim:air-0001');

    const thief = new Peer();
    rooms.handle(thief, { type: 'room-open', code, key: `${key.slice(0, -1)}${key.endsWith('A') ? 'B' : 'A'}` });
    expect(thief.last('room-closed')?.reason).toBe('not-found');

    const back = new Peer();
    rooms.handle(back, { type: 'room-open', code, key });
    expect(back.last('room')).toMatchObject({ role: 'main', code, key });
    later();
    expect(names(phone)).toEqual(['MAIN']);
    expect(back.count('room-control')).toBe(0);
  });

  it("closes the room when the main screen doesn't come back", () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    rooms.drop(main);
    later(MAIN_GRACE_MS - 1_000);
    rooms.sweep();
    expect(rooms.size).toBe(1);
    later(1_000);
    rooms.sweep();
    expect(rooms.size).toBe(0);
    expect(phone.last('room-closed')?.reason).toBe('closed');
  });

  it('gives a phone back its callsign, and a TV its name, when they return with their tokens', () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    const tv = joinScreen(code);
    const { callsign, token } = phone.last('room') as RoomConsoleMessage;
    const screenToken = (tv.last('room') as RoomScreenMessage).token;
    rooms.handle(phone, { type: 'room-look', id: 'sim:air-0001' });
    rooms.drop(phone);
    rooms.drop(tv);
    later();
    expect(main.last('room-presence')?.consoles).toEqual([]);
    expect(names(main)).toEqual(['MAIN']);

    expect(joinRoom(code, token).last('room')).toMatchObject({ callsign, token });
    expect(joinScreen(code, screenToken).last('room')).toMatchObject({ name: 'SCREEN 2', token: screenToken });

    // Past the grace period the seat is gone: same token, new seat.
    const back = joinRoom(code, token);
    rooms.drop(back);
    later(CONSOLE_GRACE_MS);
    rooms.sweep();
    later();
    const stranger = joinRoom(code, token);
    expect((stranger.last('room') as RoomConsoleMessage).token).not.toBe(token);
  });

  it('lets a phone leave for good', () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    later();
    rooms.handle(phone, { type: 'room-leave' });
    later();
    expect(main.last('room-presence')?.consoles).toEqual([]);
    show(phone, 'sim:air-0001');
    expect(main.count('room-control')).toBe(0);
  });

  it('paces attempts from one browser', () => {
    const { code } = openRoom();
    const phone = new Peer();
    rooms.handle(phone, { type: 'room-join', code: otherCode(code) });
    rooms.handle(phone, { type: 'room-join', code });
    expect(phone.got.map((m) => m.type)).toEqual(['room-closed']);
    later();
    rooms.handle(phone, { type: 'room-join', code });
    expect(phone.last('room')?.role).toBe('console');
  });
});
