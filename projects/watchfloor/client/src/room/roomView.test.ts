import { describe, expect, it } from 'vitest';
import { presenceByTrack, presenceLabel, roomView, type RoomState } from './roomView';

const KEY = 'AbCdEfGhIjKlMnOpQrSt_-';
const open = (origins: string[]): RoomState => ({ kind: 'open', code: 'K7QX', key: KEY, origins });
const localhost = { origin: 'http://localhost:8103', hostname: 'localhost' };

describe('roomView', () => {
  it('offers to open a room or join one as a screen when not in a room', () => {
    expect(roomView({ kind: 'none' }, localhost, true)).toMatchObject({ mode: 'choose', qr: null, code: null });
    expect(roomView({ kind: 'opening' }, localhost, true)).toMatchObject({ mode: 'wait', qr: null });
    expect(roomView({ kind: 'joining', code: 'K7QX' }, localhost, true)).toMatchObject({ mode: 'wait', message: 'Joining room K7QX as a screen…' });
  });

  it("sends phones and screens to the server's network address when this page is on localhost", () => {
    const view = roomView(open(['http://192.168.1.20:8103', 'http://10.0.0.7:8103']), localhost, true);
    expect(view).toMatchObject({
      mode: 'host',
      code: 'K7QX',
      qr: 'http://192.168.1.20:8103/console.html?room=K7QX',
      link: 'http://192.168.1.20:8103/console.html?room=K7QX',
      also: ['http://10.0.0.7:8103'],
      screenLink: 'http://192.168.1.20:8103/?screen=K7QX',
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

  it('names this screen when it joined someone else’s room', () => {
    const view = roomView({ kind: 'screen', code: 'K7QX', name: 'SCREEN 2', token: KEY }, localhost, true);
    expect(view).toMatchObject({ mode: 'screen', code: 'K7QX', name: 'SCREEN 2', qr: null, screenLink: null });
    expect(view.message).toContain('never steer each other');
  });

  it('explains that the static demo has no room', () => {
    const view = roomView(open(['http://192.168.1.20:8103']), localhost, false);
    expect(view).toMatchObject({ mode: 'demo', qr: null, code: null });
    expect(view.message).toMatch(/demo/);
  });

  it('says why a room ended or a join was refused, and offers the choice again', () => {
    const ended = (reason: 'not-found' | 'full' | 'closed', as: 'main' | 'screen') => roomView({ kind: 'ended', reason, as }, localhost, true);
    expect(ended('not-found', 'main').message).toMatch(/while this screen was away/);
    expect(ended('not-found', 'screen').message).toMatch(/no room with that code/);
    expect(ended('full', 'screen').message).toMatch(/as many screens/);
    expect(ended('closed', 'main').mode).toBe('choose');
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

describe('roomView in the static demo', () => {
  const page = { origin: 'https://example.github.io', hostname: 'example.github.io' };

  it('says rooms need the server', () => {
    expect(roomView({ kind: 'none' }, page, false)).toMatchObject({ mode: 'demo', link: null, qr: null });
  });

  it('points to the live version when the build knows its address', () => {
    const view = roomView({ kind: 'none' }, page, false, 'https://watchfloor.example.com');
    expect(view).toMatchObject({ mode: 'demo', link: 'https://watchfloor.example.com', qr: null });
    expect(view.message).toMatch(/live version/);
  });
});
