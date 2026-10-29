import { describe, expect, it } from 'vitest';
import { icao24Of, parseTrackResponse } from './mapTrack';

describe('parseTrackResponse', () => {
  it('turns waypoints into path points, oldest first, skipping unknown positions', () => {
    const body = {
      icao24: '4ca7b3',
      startTime: 1_700_000_000,
      endTime: 1_700_003_600,
      calllsign: 'RYR20SW ', // sic: OpenSky's spelling
      path: [
        [1_700_000_900, 53.5, -6.1, 3000, 90, false],
        [1_700_000_000, 53.42, -6.27, 0, 280, true],
        [1_700_001_800, null, null, 11000, 95, false],
        [1_700_002_700, 95, 0, 11000, 95, false],
      ],
    };
    expect(parseTrackResponse(body)).toEqual([
      [-6.27, 53.42, 1_700_000_000_000],
      [-6.1, 53.5, 1_700_000_900_000],
    ]);
  });

  it('rejects anything that is not a track', () => {
    expect(parseTrackResponse(null)).toBeNull();
    expect(parseTrackResponse({ path: 'no' })).toBeNull();
    expect(parseTrackResponse({ path: [] })).toEqual([]);
  });
});

describe('icao24Of', () => {
  it('takes the hex address from ADS-B track ids only', () => {
    expect(icao24Of('adsb:4ca7b3')).toBe('4ca7b3');
    expect(icao24Of('ais:235000001')).toBeNull();
    expect(icao24Of('adsb:4CA7B3')).toBeNull();
    expect(icao24Of('adsb:4ca7b3/../x')).toBeNull();
  });
});
