import type { Hazard, NewsItem, Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import type { ChokepointCount } from './chokepoints';
import { tourStops, type TourWorld } from './tourStops';

const NOW = 1_700_000_000_000;

function world(over: Partial<TourWorld>): TourWorld {
  return { emergencies: [], trackOf: () => undefined, tracks: [], hazards: [], news: [], shipsIn: new Map(), now: NOW, random: () => 0, ...over };
}

function track(over: Partial<Track>): Track {
  return {
    id: 'adsb:1',
    source: 'adsb',
    domain: 'air',
    platform: 'airliner',
    affiliation: 'unknown',
    lat: 50,
    lon: 1,
    courseDeg: 90,
    speedMps: 230,
    observedAt: NOW,
    ...over,
  } as Track;
}

function quake(id: string, magnitude: number, time = NOW): Hazard {
  return { id, kind: 'earthquake', source: 'usgs', title: `M ${magnitude} - somewhere`, lat: 10, lon: 20, time, magnitude, url: 'https://example.org' };
}

function story(id: string, headline: string): NewsItem {
  return { id, headline, url: 'https://example.org', outlet: 'example.org', lat: 48, lon: 2, place: 'Paris, France', kind: 'diplomacy', publishedAt: NOW - 60_000, importance: 20 } as NewsItem;
}

describe('tourStops', () => {
  it('leads with emergencies, then hazards, stories and chokepoints', () => {
    const track = { id: 'adsb:1', callsign: 'MAYDAY1', lat: 51, lon: 0 } as Track;
    const stops = tourStops(
      world({
        emergencies: [{ id: 'adsb:1', squawk: '7700', meaning: 'Emergency', since: NOW }],
        trackOf: (id) => (id === 'adsb:1' ? track : undefined),
        hazards: [quake('usgs:a', 6.5)],
        news: [story('n1', 'Summit ends without an agreement')],
        shipsIn: new Map([['hormuz', { ships: 12, moving: 9 } satisfies ChokepointCount]]),
      }),
    );
    expect(stops.map((s) => s.title)).toEqual([
      'Squawk 7700 · MAYDAY1',
      'M 6.5 - somewhere',
      'Summit ends without an agreement',
      'Strait of Hormuz · 12 ships',
    ]);
    expect(stops[0]?.center).toEqual([0, 51]);
  });

  it('skips minor hazards, empty chokepoints and emergencies whose track is gone', () => {
    const stops = tourStops(
      world({
        emergencies: [{ id: 'adsb:9', squawk: '7600', meaning: 'Radio failure', since: NOW }],
        hazards: [quake('usgs:small', 3.1)],
        shipsIn: new Map([['dover', { ships: 0, moving: 0 }]]),
      }),
    );
    expect(stops).toEqual([]);
  });

  it('keeps the newest hazards and the busiest chokepoints, a few of each', () => {
    const hazards = [quake('usgs:1', 6.1, NOW - 4), quake('usgs:2', 6.2, NOW - 3), quake('usgs:3', 6.3, NOW - 2), quake('usgs:4', 6.4, NOW - 1)];
    const shipsIn = new Map([
      ['hormuz', { ships: 2, moving: 1 }],
      ['dover', { ships: 30, moving: 20 }],
      ['gibraltar', { ships: 160, moving: 90 }],
      ['suez', { ships: 7, moving: 2 }],
      ['singapore', { ships: 1, moving: 1 }],
    ]);
    const stops = tourStops(world({ hazards, shipsIn }));
    expect(stops.filter((s) => s.title.startsWith('M ')).length).toBe(3);
    expect(stops[0]?.title).toBe('M 6.4 - somewhere');
    const straits = stops.filter((s) => s.title.includes('ship'));
    expect(straits.map((s) => s.title)).toEqual(['Strait of Gibraltar · 160 ships', 'Dover Strait · 30 ships', 'Suez Canal · 7 ships']);
  });

  it('rides along with military tracks, the fastest and the highest aloft', () => {
    const jet = track({ id: 'adsb:mil', callsign: 'HKY41', platform: 'military-aircraft', model: 'LOCKHEED C-130' });
    const ship = track({ id: 'ais:1', callsign: 'DARING', platform: 'warship', domain: 'sea', speedMps: 10 });
    const fast = track({ id: 'adsb:fast', callsign: 'CONC', speedMps: 280 });
    const high = track({ id: 'adsb:high', callsign: 'GLEX', altitudeM: 15_500 });
    // The 700 m/s "aircraft" is a glitched report, not a record: skipped.
    const glitch = track({ id: 'adsb:glitch', callsign: 'ERR1', speedMps: 700, altitudeM: 30_000 });
    const stops = tourStops(world({ tracks: [jet, ship, fast, high, glitch, track({ id: 'adsb:dull' })] }));
    expect(stops.map((s) => [s.title, s.trackId])).toEqual([
      ['Military flight · HKY41 · LOCKHEED C-130', 'adsb:mil'],
      ['Warship · DARING', 'ais:1'],
      ['Fastest aloft · CONC · 544 kn', 'adsb:fast'],
      ['Highest aloft · GLEX · FL509', 'adsb:high'],
    ]);
    expect(stops.every((s) => (s.dwellMs ?? 0) > 8_000)).toBe(true);
  });

  it('takes turns between the categories instead of playing them in blocks', () => {
    const stops = tourStops(
      world({
        tracks: [track({ id: 'adsb:mil', callsign: 'HKY41', platform: 'military-aircraft' })],
        hazards: [quake('usgs:a', 6.5)],
        news: [story('n1', 'Summit ends without an agreement')],
        shipsIn: new Map([['hormuz', { ships: 12, moving: 9 }]]),
      }),
    );
    expect(stops.map((s) => s.title)).toEqual([
      'Military flight · HKY41',
      'M 6.5 - somewhere',
      'Summit ends without an agreement',
      'Strait of Hormuz · 12 ships',
    ]);
  });

  it('marks the emergency to be followed', () => {
    const t = track({ id: 'adsb:1', callsign: 'MAYDAY1' });
    const [stop] = tourStops(world({ emergencies: [{ id: 'adsb:1', squawk: '7700', meaning: 'Emergency', since: NOW }], trackOf: () => t }));
    expect(stop?.trackId).toBe('adsb:1');
  });
});
