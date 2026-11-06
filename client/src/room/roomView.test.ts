import { describe, expect, it } from 'vitest';
import { presenceByTrack, presenceLabel, roomView, type RoomState } from './roomView';

const KEY = 'AbCdEfGhIjKlMnOpQrSt_-';
const open = (origins: string[]): RoomState => ({ kind: 'open', code: 'K7QX', key: KEY, origins });
const localhost = { origin: 'http://localhost:8103', hostname: 'localhost' };

describe('roomView', () => {
  it("sends phones to the server's network address when this page is on localhost", () => {
    const view = roomView(open(['http://192.168.1.20:8103', 'http://10.0.0.7:8103']), localhost, true);
    expect(view).toMatchObject({
      code: 'K7QX',
      qr: 'http://192.168.1.20:8103/console.html?room=K7QX',
      link: 'http://192.168.1.20:8103/console.html?room=K7QX',
      also: ['http://10.0.0.7:8103'],
      canClose: true,
    });
  });

  it("uses the page's own address when other devices can open it", () => {
    const lan = { origin: 'http://192.168.1.20:8103', hostname: '192.168.1.20' };
    expect(roomView(open([]), lan, true).qr).toBe('http://192.168.1.20:8103/console.html?room=K7QX');
    const hosted = { origin: 'https://watchfloor.example.org', hostname: 'watchfloor.example.org' };
    expect(roomView(open(['http://10.0.0.7:8080']), hosted, true)).toMatchObject({
      qr: 'https://watchfloor.example.org/console.html?room=K7QX',
      also: [],
    });
  });

  it('shows no QR code when phones could not reach the server, and says how to opt in', () => {
    const view = roomView(open([]), localhost, true);
    expect(view.qr).toBeNull();
    expect(view.code).toBe('K7QX');
    expect(view.link).toBe('http://localhost:8103/console.html?room=K7QX'); // another window on this computer
    expect(view.message).toContain('HOST=0.0.0.0');
    expect(view.message).toContain('anyone on that network');
  });

  it('explains that the static demo has no room', () => {
    const view = roomView(open(['http://192.168.1.20:8103']), localhost, false);
    expect(view.qr).toBeNull();
    expect(view.code).toBeNull();
    expect(view.message).toMatch(/demo/);
  });

  it('says why a room ended', () => {
    expect(roomView({ kind: 'ended', reason: 'not-found' }, localhost, true).message).toMatch(/while this screen was away/);
    expect(roomView({ kind: 'ended', reason: 'full' }, localhost, true).message).toMatch(/as many rooms/);
    expect(roomView({ kind: 'opening' }, localhost, true)).toMatchObject({ qr: null, canClose: false });
  });
});

describe('presence tags', () => {
  it('puts one tag on each track, naming every console that has it open', () => {
    const byTrack = presenceByTrack([
      { callsign: 'ALFA', id: 'sim:air-0001' },
      { callsign: 'BRAVO', id: null },
      { callsign: 'CHARLIE', id: 'sim:air-0001' },
      { callsign: 'DELTA', id: 'sim:sea-0002' },
    ]);
    expect([...byTrack]).toEqual([
      ['sim:air-0001', ['ALFA', 'CHARLIE']],
      ['sim:sea-0002', ['DELTA']],
    ]);
    expect(presenceLabel(['ALFA'])).toBe('CONSOLE ALFA');
    expect(presenceLabel(['ALFA', 'CHARLIE'])).toBe('CONSOLES ALFA · CHARLIE');
  });
});
