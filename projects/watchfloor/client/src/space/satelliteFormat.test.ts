import type { SatelliteElements } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { describeApsides, describeOrbit, describePass, displayName, formatElementAge, formatIn, formatKm, formatPlace } from './satelliteFormat';

const ISS: SatelliteElements = {
  id: 25544,
  name: 'ISS (ZARYA)',
  intl: '1998-067A',
  epoch: 0,
  meanMotion: 15.4919453,
  eccentricity: 0.00071954,
  inclination: 51.6327,
  raan: 319.056,
  argPerigee: 352.5747,
  meanAnomaly: 7.5134,
  bstar: 0.0001274916,
  meanMotionDot: 0.00006629,
  meanMotionDdot: 0,
};
const T = Date.UTC(2026, 10, 6, 14, 0);

describe('the satellite card', () => {
  it('names the crewed stations and keeps CelesTrak names for the rest', () => {
    expect(displayName(ISS)).toBe('International Space Station');
    expect(displayName({ id: 44713, name: 'STARLINK-1007' })).toBe('STARLINK-1007');
  });

  it('describes orbits', () => {
    expect(describeOrbit(ISS)).toBe('Low Earth orbit · 51.6° · 93 min');
    expect(describeOrbit({ ...ISS, meanMotion: 14.1952, inclination: 98.75 })).toBe('Low Earth orbit · 98.8° · 101 min · sun-synchronous');
    expect(describeOrbit({ ...ISS, meanMotion: 1.0027, inclination: 0.05 })).toBe('Geostationary orbit · 0.1° · 23.9 h');
    expect(describeApsides(ISS)).toBeNull();
    expect(describeApsides({ ...ISS, meanMotion: 2.006, eccentricity: 0.72 })).toMatch(/^between [\d,]+ and [\d,]+ km$/);
  });

  it('formats numbers, places and ages', () => {
    expect(formatKm(35786.4)).toBe('35,786 km');
    expect(formatPlace(51.45, -3.21)).toBe('51.5°N 3.2°W');
    expect(formatElementAge(6.2 * 3_600_000)).toBe('6 h');
    expect(formatElementAge(3 * 86_400_000)).toBe('3 days');
    expect(formatIn(72 * 60_000)).toBe('in 1 h 12 min');
    expect(formatIn(20_000)).toBe('in under a minute');
  });

  it('puts a pass in words', () => {
    const pass = { rise: T + 72 * 60_000, peak: T + 75 * 60_000, peakElevation: 47.4, set: T + 78 * 60_000 };
    expect(describePass({ kind: 'pass', pass, visible: true }, T)).toBe('in 1 h 12 min, 1512Z · peaks at 47° · 6 min · visible to the eye');
    expect(describePass({ kind: 'pass', pass: { ...pass, rise: null }, visible: false }, T)).toBe('Up now, until 1518Z · peaks at 47°');
    expect(describePass({ kind: 'always', elevation: 27.2 }, T)).toBe('Always above the horizon here, 27° up');
    expect(describePass({ kind: 'none' }, T)).toBe('Not above 10° here in the next 24 hours');
  });
});
