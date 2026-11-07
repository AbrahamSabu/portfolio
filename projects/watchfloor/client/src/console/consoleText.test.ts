import type { Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { trackName } from '../room/roomView';
import { codeFromSearch, detailFacts, rowFacts, trackKind } from './consoleText';

const NOW = Date.parse('2026-11-06T18:00:00Z');
const jet: Track = {
  id: 'sim:air-0007', source: 'sim', domain: 'air', platform: 'airliner', affiliation: 'neutral',
  callsign: 'WFA123', lat: 50.95, lon: 1.35, altitudeM: 10668, courseDeg: 93.9, speedMps: 230, observedAt: NOW - 4_000,
  typeCode: 'A320', model: 'AIRBUS A-320',
};
const ferry: Track = {
  id: 'ais:235000001', source: 'ais', domain: 'sea', platform: 'passenger', affiliation: 'unknown',
  lat: 51.1, lon: 1.4, courseDeg: 300, speedMps: 9, observedAt: NOW - 60_000, provider: 'aisstream',
};

describe('the console link', () => {
  it('reads the room code from the link, forgiving case', () => {
    expect(codeFromSearch('?room=K7QX')).toBe('K7QX');
    expect(codeFromSearch('?room=k7qx')).toBe('K7QX');
    expect(codeFromSearch('?room=K7Q')).toBeNull();
    expect(codeFromSearch('?room=<b>')).toBeNull();
    expect(codeFromSearch('')).toBeNull();
  });
});

describe('console rows and details', () => {
  it('names tracks by callsign, else by their own id', () => {
    expect(trackName(jet)).toBe('WFA123');
    expect(trackName(ferry)).toBe('235000001');
  });

  it('gives each row the numbers that matter for its domain', () => {
    expect(rowFacts(jet)).toBe('FL350 · 447 kn');
    expect(rowFacts(ferry)).toBe('17 kn · 300°');
  });

  it('says what a track is', () => {
    expect(trackKind(jet)).toBe('AIRBUS A-320 (A320)');
    expect(trackKind(ferry)).toBe('Passenger ferry');
    expect(trackKind(ferry, { ship: { aisType: 52 } })).toBe('Tug');
  });

  it('labels simulated traffic honestly and leaves out what is not known', () => {
    const facts = new Map(detailFacts(jet, undefined, false, NOW));
    expect(facts.get('Source')).toBe('Simulator');
    expect(facts.get('Last report')).toBe('4 s ago');
    expect(facts.has('Airline')).toBe(false);
    expect(facts.has('Squawk')).toBe(false);
    const ship = new Map(detailFacts(ferry, { country: 'United Kingdom' }, true, NOW));
    expect(ship.get('Source')).toBe('AIS via AISStream');
    expect(ship.get('Flag')).toBe('United Kingdom');
    expect(ship.get('Last report')).toBe('1 min ago, stale');
    expect(ship.has('Altitude')).toBe(false);
  });
});
