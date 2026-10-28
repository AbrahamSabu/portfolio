import { describe, expect, it } from 'vitest';
import { sanitizeTrack } from './validate';

const good = {
  id: 'adsb:4ca7b3',
  source: 'adsb',
  domain: 'air',
  platform: 'airliner',
  affiliation: 'neutral',
  callsign: '  VXA123 ',
  lat: 50.5,
  lon: -1.2,
  altitudeM: 10_000,
  courseDeg: 92,
  speedMps: 230,
  observedAt: 1_700_000_000_000,
};

describe('sanitizeTrack', () => {
  it('accepts a well-formed track and trims the callsign', () => {
    const t = sanitizeTrack(good);
    expect(t).not.toBeNull();
    expect(t?.callsign).toBe('VXA123');
  });

  it.each([
    ['missing id', { ...good, id: '' }],
    ['NaN latitude', { ...good, lat: Number.NaN }],
    ['latitude out of range', { ...good, lat: 91 }],
    ['longitude out of range', { ...good, lon: -181 }],
    ['unknown source', { ...good, source: 'radar' }],
    ['unknown domain', { ...good, domain: 'space' }],
    ['no timestamp', { ...good, observedAt: undefined }],
    ['not an object', 'hello'],
  ])('rejects %s', (_, input) => {
    expect(sanitizeTrack(input)).toBeNull();
  });

  it('repairs fixable fields instead of rejecting', () => {
    const t = sanitizeTrack({ ...good, courseDeg: 365, speedMps: -3, affiliation: 'bogus', platform: 'zeppelin' });
    expect(t?.courseDeg).toBe(5);
    expect(t?.speedMps).toBe(0);
    expect(t?.affiliation).toBe('unknown');
    expect(t?.platform).toBe('aircraft');
  });

  it('drops altitude from sea tracks', () => {
    const t = sanitizeTrack({ ...good, domain: 'sea', platform: 'cargo', altitudeM: 50 });
    expect(t?.altitudeM).toBeUndefined();
  });
});

describe('sanitizeTrack: aircraft type', () => {
  it('keeps a type designator and a printable, bounded model for aircraft', () => {
    const t = sanitizeTrack({ ...good, typeCode: 'B748', model: 'BOEING 747-8\u0007' + 'X'.repeat(60) });
    expect(t?.typeCode).toBe('B748');
    expect(t?.model).toMatch(/^BOEING 747-8X+$/);
    expect(t?.model).toHaveLength(48);
  });

  it('drops malformed designators, and type fields on ships', () => {
    expect(sanitizeTrack({ ...good, typeCode: 'b748' })?.typeCode).toBeUndefined();
    expect(sanitizeTrack({ ...good, typeCode: 'TOOLONG' })?.typeCode).toBeUndefined();
    const ship = sanitizeTrack({ ...good, id: 'ais:1', source: 'ais', domain: 'sea', platform: 'cargo', typeCode: 'B748', model: 'x' });
    expect(ship?.typeCode).toBeUndefined();
    expect(ship?.model).toBeUndefined();
  });
});
