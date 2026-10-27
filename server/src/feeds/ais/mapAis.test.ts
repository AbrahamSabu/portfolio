import { describe, expect, it } from 'vitest';
import edge from './fixtures/edge-cases.json';
import { cleanName, fixTime, mapAisMessage, parseStreamMessage, parseTimeUtc, platformForShipType } from './mapAis';
import { ShipRegistry } from './ships';

type Name = keyof typeof edge.messages;

function parse(name: Name) {
  const msg = parseStreamMessage(JSON.stringify(edge.messages[name]));
  if (msg?.kind !== 'ais') throw new Error(`${name} is not an AIS message`);
  return msg;
}
const map = (name: Name) => mapAisMessage(parse(name));

describe('parseStreamMessage', () => {
  it('recognises the subscription confirmation and error messages', () => {
    expect(parseStreamMessage(JSON.stringify(edge.messages.confirmation))).toEqual({ kind: 'confirmation', compression: true });
    expect(parseStreamMessage(JSON.stringify(edge.messages.error))).toEqual({ kind: 'error', error: 'Api Key Is Not Valid' });
  });

  it('reads the compression flag from the confirmation as AISStream really sends it', () => {
    // Recorded: the flag sits directly under Message, unlike the AIS message types.
    expect(parseStreamMessage('{"Message":{"CompressionEnabled":true},"MessageType":"SubscriptionConfirmation"}')).toEqual({
      kind: 'confirmation',
      compression: true,
    });
  });

  it('rejects frames that are not JSON or not an envelope', () => {
    expect(parseStreamMessage('not json')).toBeNull();
    expect(parseStreamMessage('[1,2]')).toBeNull();
    expect(parseStreamMessage('{"MessageType":"PositionReport","Message":{}}')).toBeNull();
  });
});

describe('mapAisMessage', () => {
  it('maps a Class A position report, timed by its own UTC second', () => {
    expect(map('classA')).toEqual({
      kind: 'position',
      mmsi: '235000001',
      lat: 50.9,
      lon: 1.2,
      courseDeg: 45.3,
      speedMps: 12.5 * (1852 / 3600),
      // Received at 20:41:07.5; fixed at second 05 of that minute.
      observedAt: Date.parse('2026-10-27T20:41:05Z'),
      metaName: 'TEST CARRIER',
    });
  });

  it('skips the "not available" values instead of drawing them', () => {
    expect(map('noPosition')).toEqual({ kind: 'skip', reason: 'no-position' });
    expect(map('noSpeed')).toEqual({ kind: 'skip', reason: 'no-velocity' });
    expect(map('movingNoCourse')).toEqual({ kind: 'skip', reason: 'no-velocity' });
    expect(map('invalid')).toEqual({ kind: 'skip', reason: 'invalid' });
    expect(map('noTime')).toEqual({ kind: 'skip', reason: 'no-time' });
  });

  it('keeps a moored ship with no course, and falls back to heading for a moving one', () => {
    const moored = map('mooredNoCourse');
    expect(moored).toMatchObject({ kind: 'position', courseDeg: 0, speedMps: 0 });
    // Timestamp 60 (not available) falls back to the receive time.
    expect(moored).toMatchObject({ observedAt: Date.parse('2026-10-27T20:41:07.500Z') });
    expect(map('headingOnly')).toMatchObject({ kind: 'position', courseDeg: 270 });
  });

  it('leaves out stations that are not ships', () => {
    expect(map('sart')).toEqual({ kind: 'skip', reason: 'not-a-ship' });
  });

  it('reads identity from static data and Class B extended reports', () => {
    expect(map('shipStatic')).toEqual({ kind: 'static', mmsi: '235000001', identity: { name: 'TEST CARRIER', platform: 'cargo' } });
    expect(map('staticPartA')).toEqual({ kind: 'static', mmsi: '235000010', identity: { name: 'LITTLE AUK' } });
    expect(map('staticPartB')).toEqual({ kind: 'static', mmsi: '235000010', identity: { platform: 'leisure' } });
    expect(map('classBExtended')).toMatchObject({ kind: 'position', identity: { name: 'SEA SPRITE', platform: 'leisure' } });
  });
});

describe('fixTime', () => {
  const at = Date.parse('2026-10-27T20:41:07.500Z');

  it('places the fix on its second, up to a minute before receipt', () => {
    expect(fixTime(at, 7)).toBe(Date.parse('2026-10-27T20:41:07Z'));
    expect(fixTime(at, 50)).toBe(Date.parse('2026-10-27T20:40:50Z'));
    expect(fixTime(at, 12)).toBe(Date.parse('2026-10-27T20:40:12Z'));
  });

  it('treats a fix a few seconds "ahead" as clock skew, not a minute of lag', () => {
    expect(fixTime(at, 10)).toBe(Date.parse('2026-10-27T20:41:10Z'));
  });

  it('uses the receive time when the second is unavailable (60-63)', () => {
    for (const s of [60, 61, 62, 63, null]) expect(fixTime(at, s)).toBe(at);
  });
});

describe('field helpers', () => {
  it('parses AISStream time strings', () => {
    expect(parseTimeUtc('2026-10-27 20:41:07.512345678 +0000 UTC')).toBe(Date.parse('2026-10-27T20:41:07.512Z'));
    expect(parseTimeUtc('2026-10-27 20:41:07 +0000 UTC')).toBe(Date.parse('2026-10-27T20:41:07Z'));
    expect(parseTimeUtc('yesterday')).toBeNull();
    expect(parseTimeUtc(undefined)).toBeNull();
  });

  it('strips AIS text padding', () => {
    expect(cleanName('NORMANDIE@@@@@@')).toBe('NORMANDIE');
    expect(cleanName('  PRIDE  OF   KENT ')).toBe('PRIDE OF KENT');
    expect(cleanName('@@@@@@@@')).toBeUndefined();
  });

  it('maps ship types to platforms, and "not available" to nothing', () => {
    expect([30, 35, 36, 37, 60, 69, 70, 84, 52, 99].map(platformForShipType)).toEqual([
      'fishing', 'warship', 'leisure', 'leisure', 'passenger', 'passenger', 'cargo', 'tanker', 'vessel', 'vessel',
    ]);
    expect(platformForShipType(0)).toBeUndefined();
    expect(platformForShipType(null)).toBeUndefined();
  });
});

describe('ShipRegistry', () => {
  it('names a ship from static data heard before its position', () => {
    const ships = new ShipRegistry();
    const stat = map('shipStatic');
    if (stat.kind !== 'static') throw new Error('expected static');
    ships.learn(stat.mmsi, stat.identity);
    const pos = map('classA');
    if (pos.kind !== 'position') throw new Error('expected position');
    expect(ships.track(pos)).toEqual({
      id: 'ais:235000001',
      source: 'ais',
      domain: 'sea',
      platform: 'cargo',
      affiliation: 'unknown',
      callsign: 'TEST CARRIER',
      lat: 50.9,
      lon: 1.2,
      courseDeg: 45.3,
      speedMps: pos.speedMps,
      observedAt: pos.observedAt,
      provider: 'aisstream',
    });
  });

  it("merges Class B's two static parts, and falls back to AISStream's name", () => {
    const ships = new ShipRegistry();
    for (const name of ['staticPartA', 'staticPartB'] as const) {
      const s = map(name);
      if (s.kind === 'static') ships.learn(s.mmsi, s.identity);
    }
    const pos = { ...map('mooredNoCourse'), mmsi: '235000010' };
    if (pos.kind !== 'position') throw new Error('expected position');
    expect(ships.track(pos)).toMatchObject({ callsign: 'LITTLE AUK', platform: 'leisure' });

    const unknown = map('classA');
    if (unknown.kind !== 'position') throw new Error('expected position');
    expect(new ShipRegistry().track(unknown)).toMatchObject({ callsign: 'TEST CARRIER', platform: 'vessel' });
  });

  it('forgets the least recently heard ship past its cap', () => {
    const ships = new ShipRegistry(2);
    ships.learn('235000001', { name: 'A' });
    ships.learn('235000002', { name: 'B' });
    ships.learn('235000001', {});
    ships.learn('235000003', { name: 'C' });
    expect(ships.size).toBe(2);
    const pos = map('classA');
    if (pos.kind !== 'position') throw new Error('expected position');
    // 1 was heard again after 2, so 2 went. (Reading a ship counts as hearing it.)
    expect(ships.track(pos).callsign).toBe('A');
    const { metaName: _, ...nameless } = pos;
    expect(ships.track({ ...nameless, mmsi: '235000002' }).callsign).toBeUndefined();
  });
});
