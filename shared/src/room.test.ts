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
  screenLabels,
  screenUrl,
  type RoomServerMessage,
} from './room';

const NOW = Date.parse('2026-11-06T18:00:00Z');
const KEY = 'AbCdEfGhIjKlMnOpQrSt_-';
const send = (m: object) => parseClientMessage(JSON.stringify(m));
const control = (action: object, to = 'MAIN') => send({ type: 'room-control', to, action });
const STATUS = { layers: { news: true, trails: false, radar: true }, tour: false, follow: true };

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

  it('puts the code in the console and screen links', () => {
    expect(joinUrl('http://192.168.1.20:8103', 'K7QX')).toBe('http://192.168.1.20:8103/console.html?room=K7QX');
    expect(screenUrl('http://192.168.1.20:8103', 'K7QX')).toBe('http://192.168.1.20:8103/?screen=K7QX');
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
    expect(send({ type: 'room-join', code: 'K7QX', as: 'screen' })).toEqual({ type: 'room-join', code: 'K7QX', as: 'screen' });
    expect(send({ type: 'room-leave' })).toEqual({ type: 'room-leave' });
    expect(send({ type: 'room-look', id: 'sim:air-0001' })).toEqual({ type: 'room-look', id: 'sim:air-0001' });
    expect(send({ type: 'room-look', id: null })).toEqual({ type: 'room-look', id: null });
    expect(send({ type: 'room-status', status: { ...STATUS, layers: { ...STATUS.layers, bogus: true } } })).toEqual({
      type: 'room-status',
      status: STATUS,
    });
  });

  it('passes on what a screen is, and only a kind from the list', () => {
    expect(send({ type: 'room-status', status: { ...STATUS, kind: 'tv' } })).toEqual({ type: 'room-status', status: { ...STATUS, kind: 'tv' } });
    expect(send({ type: 'room-status', status: { ...STATUS, kind: 'toaster' } })).toBeNull();
    expect(send({ type: 'room-status', status: { ...STATUS, kind: 'Laptop' } })).toBeNull();
  });

  it('names screens by what they are, numbering two of a kind', () => {
    const labels = screenLabels([
      { name: 'MAIN', status: { kind: 'laptop' } },
      { name: 'SCREEN 2', status: { kind: 'tablet' } },
      { name: 'SCREEN 3', status: { kind: 'tablet' } },
      { name: 'SCREEN 4' },
    ]);
    expect([...labels.values()]).toEqual(['Laptop', 'Tablet', 'Tablet 2', 'Screen 4']);
    expect(screenLabels([{ name: 'MAIN' }]).get('MAIN')).toBe('Main screen');
  });

  it('reads every action a console can ask of a screen', () => {
    const actions = [
      { do: 'show', id: 'adsb:4ca7b3' },
      { do: 'pan', dx: 0.25, dy: -1 },
      { do: 'zoom', by: 1 },
      { do: 'zoom', by: -1 },
      { do: 'home' },
      { do: 'follow', on: true },
      { do: 'clear' },
      { do: 'tour', on: false },
      { do: 'layer', layer: 'radar', on: true },
      { do: 'layer', layer: 'stack', on: true },
      { do: 'layer', layer: 'score', on: false },
      { do: 'ride', id: 'sim:air-0013' },
      { do: 'ride', id: null },
      { do: 'fly', lon: -8.49, lat: 51.84, zoom: 9 },
    ];
    for (const action of actions) expect(control(action, 'SCREEN 2')).toEqual({ type: 'room-control', to: 'SCREEN 2', action });
  });

  it('drops anything out of shape', () => {
    expect(send({ type: 'room-open', code: 'K7QX' })).toBeNull(); // a code without its key
    expect(send({ type: 'room-open', key: KEY })).toBeNull();
    expect(send({ type: 'room-open', code: 'K7QX', key: 'short' })).toBeNull();
    expect(send({ type: 'room-join' })).toBeNull();
    expect(send({ type: 'room-join', code: 'k7qx' })).toBeNull(); // browsers normalise before sending
    expect(send({ type: 'room-join', code: 'K7QX', token: 42 })).toBeNull();
    expect(send({ type: 'room-join', code: 'K7QX', token: `${KEY}x` })).toBeNull();
    expect(send({ type: 'room-join', code: 'K7QX', as: 'main' })).toBeNull();
    expect(send({ type: 'room-look' })).toBeNull();
    expect(send({ type: 'room-look', id: '' })).toBeNull();
    expect(send({ type: 'room-look', id: 'x'.repeat(129) })).toBeNull();
    expect(send({ type: 'room-shout', id: 'sim:air-0001' })).toBeNull();
    expect(send({ type: 'room-status', status: { layers: {}, tour: 'no', follow: false } })).toBeNull();
    expect(send({ type: 'room-status', status: { tour: false, follow: false } })).toBeNull();
    expect(send({ type: 'room-control', action: { do: 'home' } })).toBeNull(); // no screen named
    expect(control({ do: 'home' }, 'SCREEN 9')).toBeNull();
    expect(control({ do: 'home' }, 'main')).toBeNull();
    expect(control({ do: 'show', id: 'has space' })).toBeNull();
    expect(control({ do: 'pan', dx: 2, dy: 0 })).toBeNull();
    expect(control({ do: 'pan', dx: Number.NaN, dy: 0 })).toBeNull();
    expect(control({ do: 'zoom', by: 3 })).toBeNull();
    expect(control({ do: 'follow' })).toBeNull();
    expect(control({ do: 'layer', layer: 'phosphor', on: true })).toBeNull();
    expect(control({ do: 'ride' })).toBeNull();
    expect(control({ do: 'ride', id: 'has space' })).toBeNull();
    expect(send({ type: 'room-status', status: { layers: {}, tour: false, follow: false, riding: 42 } })).toBeNull();
    expect(control({ do: 'fly', lon: 200, lat: 0, zoom: 5 })).toBeNull();
    expect(control({ do: 'fly', lon: 0, lat: 0, zoom: 30 })).toBeNull();
    expect(control({ do: 'explode' })).toBeNull();
    expect(control(null as unknown as object)).toBeNull();
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
      { type: 'room', serverTime: NOW, role: 'screen', code: 'K7QX', name: 'SCREEN 2', token: KEY },
      { type: 'room', serverTime: NOW, role: 'console', code: 'K7QX', callsign: 'ALFA', token: KEY },
      {
        type: 'room-presence',
        serverTime: NOW,
        screens: [{ name: 'MAIN', status: STATUS }, { name: 'SCREEN 2' }],
        consoles: [{ callsign: 'ALFA', id: 'sim:air-0001' }, { callsign: 'BRAVO', id: null }],
      },
      { type: 'room-control', serverTime: NOW, from: 'ALFA', action: { do: 'show', id: 'sim:air-0001' } },
      { type: 'room-control', serverTime: NOW, from: 'BRAVO', action: { do: 'layer', layer: 'news', on: false } },
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
    expect(raw({ type: 'room', role: 'screen', code: 'K7QX', name: 'MY TV', token: KEY })).toBeNull();
    expect(raw({ type: 'room', role: 'judge', code: 'K7QX' })).toBeNull();
    const presence = (screens: unknown[], consoles: unknown[]) => raw({ type: 'room-presence', screens, consoles });
    expect(presence([], [{ callsign: 'Alfa', id: null }])).toBeNull();
    expect(presence([], [{ callsign: 'ALFA', id: 7 }])).toBeNull();
    expect(presence([{ name: '<b>' }], [])).toBeNull();
    expect(presence([{ name: 'MAIN', status: { layers: {}, tour: 1, follow: false } }], [])).toBeNull();
    expect(raw({ type: 'room-presence', main: true, consoles: [] })).toBeNull(); // the old shape
    expect(raw({ type: 'room-control', from: '<b>', action: { do: 'home' } })).toBeNull();
    expect(raw({ type: 'room-control', from: 'ALFA', action: { do: 'show', id: 'x y' } })).toBeNull();
    expect(raw({ type: 'room-closed', reason: 'because' })).toBeNull();
  });
});
