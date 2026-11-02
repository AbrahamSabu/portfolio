import type { Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { formatClouds, formatVisibility, formatWind } from '../ui/weatherFormat';
import { airportTraffic } from './airportTraffic';

const CORK = { lat: 51.8413, lon: -8.4911 };
const plane = (id: string, lat: number, lon: number, courseDeg: number, altitudeM?: number, domain: 'air' | 'sea' = 'air'): Track => ({
  id, source: 'adsb', domain, platform: 'airliner', affiliation: 'unknown', lat, lon, courseDeg, speedMps: 80, observedAt: 0,
  ...(altitudeM === undefined ? {} : { altitudeM }),
});

describe('airportTraffic', () => {
  it('sorts low, close aircraft into inbound, outbound and nearby, nearest first', () => {
    const traffic = airportTraffic(CORK, [
      plane('east-heading-west', 51.84, -8.2, 270, 900), // 20 km east, pointing at Cork
      plane('close-inbound', 51.84, -8.35, 268, 400), // 10 km east, pointing at Cork
      plane('west-heading-west', 51.84, -8.8, 270, 1200), // west of Cork, flying away
      plane('crossing', 51.95, -8.49, 90, 800), // north, flying across
      plane('high', 51.84, -8.3, 270, 9000), // cruising over
      plane('far', 52.5, -8.49, 180, 900), // 70 km out
      plane('ship', 51.84, -8.3, 270, undefined, 'sea'),
    ]);
    expect(traffic.inbound.map((n) => n.track.id)).toEqual(['close-inbound', 'east-heading-west']);
    expect(traffic.outbound.map((n) => n.track.id)).toEqual(['west-heading-west']);
    expect(traffic.nearby.map((n) => n.track.id)).toEqual(['crossing']);
  });

  it('counts an aircraft right over the field as nearby, whatever its heading', () => {
    expect(airportTraffic(CORK, [plane('over', 51.842, -8.49, 0, 300)]).nearby).toHaveLength(1);
  });
});

describe('weather wording', () => {
  it('words wind, visibility and cloud', () => {
    expect(formatWind({ windDir: 80, windKt: 12, gustKt: 25 })).toBe('080° at 12 kt, gusting 25 kt');
    expect(formatWind({ windDir: 'VRB', windKt: 3 })).toBe('Variable at 3 kt');
    expect(formatWind({ windDir: 0, windKt: 0 })).toBe('Calm');
    expect(formatVisibility('6+')).toBe('10 km or more');
    expect(formatVisibility('2.5')).toBe('4.0 km');
    expect(formatVisibility('0.25')).toBe('400 m');
    expect(formatVisibility('0.43')).toBe('700 m');
    expect(formatClouds([{ cover: 'FEW', baseFt: 200 }, { cover: 'SCT', baseFt: 1500 }])).toBe('Few at 200 ft, scattered at 1,500 ft');
    expect(formatClouds([{ cover: 'CAVOK' }])).toBe('No significant cloud');
    expect(formatClouds([{ cover: 'OVX', baseFt: 200 }])).toBe('Sky obscured, vertical visibility 200 ft');
    expect(formatClouds([])).toBeNull();
  });
});
