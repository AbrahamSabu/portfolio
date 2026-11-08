import { describe, expect, it } from 'vitest';
import { cleanCallsign, cleanText, sanitizeTrack } from './validate';

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
  it('keeps a four-digit octal squawk for aircraft only', () => {
    expect(sanitizeTrack({ ...good, squawk: '7700' })?.squawk).toBe('7700');
    expect(sanitizeTrack({ ...good, squawk: '7800' })?.squawk).toBeUndefined();
    expect(sanitizeTrack({ ...good, squawk: '770' })?.squawk).toBeUndefined();
    expect(sanitizeTrack({ ...good, domain: 'sea', platform: 'vessel', squawk: '7700' })?.squawk).toBeUndefined();
  });

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

describe('cleanCallsign', () => {
  it('strips padding punctuation and keeps real names, apostrophes included', () => {
    expect(cleanCallsign('-NANUUK-')).toBe('NANUUK');
    expect(cleanCallsign('  ...VEGA  ')).toBe('VEGA');
    expect(cleanCallsign(':GMS ANTARO')).toBe('GMS ANTARO');
    expect(cleanCallsign("'T SMIDTJE")).toBe("'T SMIDTJE");
    expect(cleanCallsign('ORLANDO   DANIELA')).toBe('ORLANDO DANIELA');
  });

  it('drops placeholders that carry no name', () => {
    for (const junk of ['00000000', ',', '-', ' . ', '***']) expect(cleanCallsign(junk)).toBeUndefined();
    expect(cleanCallsign('0 P')).toBe('0 P'); // short, but it has a letter
  });
});

describe('cleanText', () => {
  it('drops bidi overrides, zero-width joiners and control characters: the makings of a spoofed callsign', () => {
    expect(cleanCallsign('ABC‮DEF')).toBe('ABCDEF');
    expect(cleanCallsign('RYR​123')).toBe('RYR123');
    expect(cleanCallsign('BAW⁠‍1')).toBe('BAW1');
    expect(cleanCallsign('ABCD')).toBe('ABCD');
    expect(cleanText('line break')).toBe('linebreak');
  });

  it('keeps at most two combining marks on a letter, so a label can never be a tall smear', () => {
    expect(cleanText('e' + '́'.repeat(31))).toBe('é́');
    expect(cleanText('café é')).toBe('café é'); // ordinary accents stay
  });
});
