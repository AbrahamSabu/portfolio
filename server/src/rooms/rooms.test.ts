import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONSOLES, type RoomConsoleMessage, type RoomMainMessage, type RoomServerMessage } from '@watchfloor/shared';
import { CONSOLE_GRACE_MS, MAIN_GRACE_MS, MAX_ROOMS, Rooms, SEND_GAP_MS, WRONG_CODES_PER_MINUTE, type RoomPeer } from './rooms';

/** A browser as the rooms service sees it: it records what it's sent. */
class Peer implements RoomPeer {
  readonly got: RoomServerMessage[] = [];
  send(message: RoomServerMessage): void {
    this.got.push(message);
  }
  last<T extends RoomServerMessage['type']>(type: T): Extract<RoomServerMessage, { type: T }> | undefined {
    return this.got.filter((m): m is Extract<RoomServerMessage, { type: T }> => m.type === type).at(-1);
  }
  count(type: RoomServerMessage['type']): number {
    return this.got.filter((m) => m.type === type).length;
  }
}

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
  /** A valid code that isn't this one. */
  const otherCode = (code: string) => (code.startsWith('B') ? `C${code.slice(1)}` : `B${code.slice(1)}`);

  it('opens a room and tells the main screen its code, key and addresses', () => {
    const { main, code, key } = openRoom();
    expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXZ2-9]{4}$/);
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(main.last('room')).toMatchObject({ role: 'main', origins: ['http://192.168.1.20:8103'] });
    later();
    expect(main.last('room-presence')).toMatchObject({ main: true, consoles: [] });
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
    const presence = { main: true, consoles: [{ callsign: seatA.callsign, id: null }, { callsign: seatB.callsign, id: null }] };
    for (const peer of [main, a, b]) expect(peer.last('room-presence')).toMatchObject(presence);
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
    rooms.handle(phone, { type: 'room-send', id: 'sim:air-0001' });
    rooms.handle(phone, { type: 'room-send', id: 'sim:air-0002' });
    expect(main.got.filter((m) => m.type === 'room-show')).toEqual([
      { type: 'room-show', serverTime: t, id: 'sim:air-0001', from: callsign },
    ]);
    later(SEND_GAP_MS);
    rooms.handle(phone, { type: 'room-send', id: 'sim:air-0002' });
    expect(main.last('room-show')?.id).toBe('sim:air-0002');
  });

  it('ignores looks and sends from browsers that are not consoles', () => {
    const { main, code } = openRoom();
    const stranger = new Peer();
    rooms.handle(stranger, { type: 'room-send', id: 'sim:air-0001' });
    rooms.handle(stranger, { type: 'room-look', id: 'sim:air-0001' });
    rooms.handle(main, { type: 'room-send', id: 'sim:air-0001' });
    later();
    expect(main.count('room-show')).toBe(0);
    expect(main.last('room-presence')?.consoles).toEqual([]);
    expect(stranger.got).toEqual([]);
    expect(code).toBeTruthy();
  });

  it('refuses a wrong code, then pauses all joining once too many were tried', () => {
    const { code } = openRoom();
    expect(joinRoom(otherCode(code)).last('room-closed')?.reason).toBe('not-found');
    for (let i = 1; i < WRONG_CODES_PER_MINUTE; i++) joinRoom(otherCode(code));
    // Even the right code waits: a refusal must not tell a guesser which codes exist.
    expect(joinRoom(code).last('room-closed')?.reason).toBe('busy');
    later(60_000);
    expect(joinRoom(code).last('room')?.role).toBe('console');
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

  it('closes the room when the main screen leaves', () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    rooms.handle(main, { type: 'room-leave' });
    expect(phone.last('room-closed')?.reason).toBe('closed');
    expect(main.last('room-closed')?.reason).toBe('closed');
    expect(rooms.size).toBe(0);
    later();
    expect(joinRoom(code).last('room-closed')?.reason).toBe('not-found');
  });

  it('keeps the room while the main screen reconnects, for the holder of its key', () => {
    const { main, code, key } = openRoom();
    const phone = joinRoom(code);
    rooms.drop(main);
    later();
    expect(phone.last('room-presence')?.main).toBe(false);
    // A track sent meanwhile goes nowhere; the phone knows the screen is away.
    rooms.handle(phone, { type: 'room-send', id: 'sim:air-0001' });

    const thief = new Peer();
    rooms.handle(thief, { type: 'room-open', code, key: `${key.slice(0, -1)}${key.endsWith('A') ? 'B' : 'A'}` });
    expect(thief.last('room-closed')?.reason).toBe('not-found');

    const back = new Peer();
    rooms.handle(back, { type: 'room-open', code, key });
    expect(back.last('room')).toMatchObject({ role: 'main', code, key });
    later();
    expect(phone.last('room-presence')?.main).toBe(true);
    expect(back.count('room-show')).toBe(0);
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

  it('gives a phone back its callsign when it returns with its token', () => {
    const { main, code } = openRoom();
    const phone = joinRoom(code);
    const { callsign, token } = phone.last('room') as RoomConsoleMessage;
    rooms.handle(phone, { type: 'room-look', id: 'sim:air-0001' });
    rooms.drop(phone);
    later();
    expect(main.last('room-presence')?.consoles).toEqual([]);

    const back = joinRoom(code, token);
    expect(back.last('room')).toMatchObject({ callsign, token });

    // Past the grace period the seat is gone: same token, new seat.
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
    rooms.handle(phone, { type: 'room-send', id: 'sim:air-0001' });
    expect(main.count('room-show')).toBe(0);
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
