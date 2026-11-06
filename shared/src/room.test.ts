import { describe, expect, it } from 'vitest';
import { encodeServerMessage, parseClientMessage, parseServerMessage, type ClientMessage } from './protocol';
import {
  CONSOLE_CALLSIGNS,
  MAX_CONSOLES,
  ROOM_CODE_ALPHABET,
  isJoinOrigin,
  isRoomCode,
  isRoomRequest,
  joinUrl,
  normalizeRoomCode,
  type RoomServerMessage,
} from './room';

const NOW = Date.parse('2026-11-06T18:00:00Z');
const KEY = 'AbCdEfGhIjKlMnOpQrSt_-';
const send = (m: object) => parseClientMessage(JSON.stringify(m));

describe('room codes', () => {
  it('uses no vowels and nothing easily misread', () => {
    for (const c of 'AEIOU01L') expect(ROOM_CODE_ALPHABET).not.toContain(c);
    expect(isRoomCode('K7QX')).toBe(true);
    expect(isRoomCode('k7qx')).toBe(false);
    expect(isRoomCode('K7Q')).toBe(false);
    expect(isRoomCode('K7QXZ')).toBe(false);
    expect(isRoomCode('KOQX')).toBe(false);
  });

  it('forgives case, spaces and a dash when typed', () => {
    expect(normalizeRoomCode(' k7-qx ')).toBe('K7QX');
    expect(normalizeRoomCode('k7 qx')).toBe('K7QX');
  });

  it('puts the code in the console link', () => {
    expect(joinUrl('http://192.168.1.20:8103', 'K7QX')).toBe('http://192.168.1.20:8103/console.html?room=K7QX');
  });

  it('has more callsigns than a room takes consoles', () => {
    expect(new Set(CONSOLE_CALLSIGNS).size).toBe(CONSOLE_CALLSIGNS.length);
    expect(CONSOLE_CALLSIGNS.length).toBeGreaterThan(MAX_CONSOLES);
  });
});

describe('join origins', () => {
  it('accepts bare http(s) origins only', () => {
    expect(isJoinOrigin('http://192.168.1.20:8103')).toBe(true);
    expect(isJoinOrigin('https://watchfloor.example.org')).toBe(true);
    expect(isJoinOrigin('http://[fd00::1]:8103')).toBe(true);
    expect(isJoinOrigin('javascript:alert(1)')).toBe(false);
    expect(isJoinOrigin('http://192.168.1.20:8103/console.html')).toBe(false);
    expect(isJoinOrigin('http://evil.example@192.168.1.20')).toBe(false);
    expect(isJoinOrigin('ftp://192.168.1.20')).toBe(false);
    expect(isJoinOrigin(`http://${'a'.repeat(100)}.example`)).toBe(false);
  });
});

describe('room requests from browsers', () => {
  it('reads each message, copying only known fields', () => {
    expect(send({ type: 'room-open', extra: 1 })).toEqual({ type: 'room-open' });
    expect(send({ type: 'room-open', code: 'K7QX', key: KEY })).toEqual({ type: 'room-open', code: 'K7QX', key: KEY });
    expect(send({ type: 'room-join', code: 'K7QX' })).toEqual({ type: 'room-join', code: 'K7QX' });
    expect(send({ type: 'room-join', code: 'K7QX', token: KEY })).toEqual({ type: 'room-join', code: 'K7QX', token: KEY });
    expect(send({ type: 'room-leave' })).toEqual({ type: 'room-leave' });
    expect(send({ type: 'room-look', id: 'sim:air-0001' })).toEqual({ type: 'room-look', id: 'sim:air-0001' });
    expect(send({ type: 'room-look', id: null })).toEqual({ type: 'room-look', id: null });
    expect(send({ type: 'room-send', id: 'adsb:4ca7b3' })).toEqual({ type: 'room-send', id: 'adsb:4ca7b3' });
  });

  it('drops anything out of shape', () => {
    expect(send({ type: 'room-open', code: 'K7QX' })).toBeNull(); // a code without its key
    expect(send({ type: 'room-open', key: KEY })).toBeNull();
    expect(send({ type: 'room-open', code: 'K7QX', key: 'short' })).toBeNull();
    expect(send({ type: 'room-join' })).toBeNull();
    expect(send({ type: 'room-join', code: 'k7qx' })).toBeNull(); // browsers normalise before sending
    expect(send({ type: 'room-join', code: 'K7QX', token: 42 })).toBeNull();
    expect(send({ type: 'room-join', code: 'K7QX', token: `${KEY}x` })).toBeNull();
    expect(send({ type: 'room-look' })).toBeNull();
    expect(send({ type: 'room-look', id: '' })).toBeNull();
    expect(send({ type: 'room-look', id: 'x'.repeat(129) })).toBeNull();
    expect(send({ type: 'room-send', id: null })).toBeNull();
    expect(send({ type: 'room-send', id: 'has space' })).toBeNull();
    expect(send({ type: 'room-shout', id: 'sim:air-0001' })).toBeNull();
  });

  it('tells room messages from the rest', () => {
    const room: ClientMessage = { type: 'room-leave' };
    const track: ClientMessage = { type: 'track', id: 'sim:air-0001' };
    expect(isRoomRequest(room)).toBe(true);
    expect(isRoomRequest(track)).toBe(false);
  });
});

describe('room messages from the server', () => {
  const roundTrip = (m: RoomServerMessage) => parseServerMessage(encodeServerMessage(m));

  it('reads back each message as sent', () => {
    const messages: RoomServerMessage[] = [
      { type: 'room', serverTime: NOW, role: 'main', code: 'K7QX', key: KEY, origins: ['http://192.168.1.20:8103'] },
      { type: 'room', serverTime: NOW, role: 'main', code: 'K7QX', key: KEY, origins: [] },
      { type: 'room', serverTime: NOW, role: 'console', code: 'K7QX', callsign: 'ALFA', token: KEY },
      { type: 'room-presence', serverTime: NOW, main: true, consoles: [{ callsign: 'ALFA', id: 'sim:air-0001' }, { callsign: 'BRAVO', id: null }] },
      { type: 'room-show', serverTime: NOW, id: 'sim:air-0001', from: 'ALFA' },
      { type: 'room-closed', serverTime: NOW, reason: 'not-found' },
    ];
    for (const m of messages) expect(roundTrip(m)).toEqual(m);
  });

  it('refuses what could put strange text or links on screen', () => {
    const raw = (m: object) => parseServerMessage(JSON.stringify({ serverTime: NOW, ...m }));
    const main = { type: 'room', role: 'main', code: 'K7QX', key: KEY };
    expect(raw({ ...main, origins: ['javascript:alert(1)'] })).toBeNull();
    expect(raw({ ...main, origins: Array(9).fill('http://10.0.0.2:8103') })).toBeNull();
    expect(raw({ ...main })).toBeNull();
    expect(raw({ type: 'room', role: 'console', code: 'K7QX', callsign: 'HACKED', token: KEY })).toBeNull();
    expect(raw({ type: 'room', role: 'judge', code: 'K7QX' })).toBeNull();
    expect(raw({ type: 'room-presence', main: true, consoles: [{ callsign: 'Alfa', id: null }] })).toBeNull();
    expect(raw({ type: 'room-presence', main: true, consoles: [{ callsign: 'ALFA', id: 7 }] })).toBeNull();
    expect(raw({ type: 'room-presence', main: 'yes', consoles: [] })).toBeNull();
    expect(raw({ type: 'room-show', id: 'sim:air-0001', from: '<b>' })).toBeNull();
    expect(raw({ type: 'room-closed', reason: 'because' })).toBeNull();
  });
});
