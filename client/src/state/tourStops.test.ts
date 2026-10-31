import type { Hazard, NewsItem, Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import type { ChokepointCount } from './chokepoints';
import { tourStops, type TourWorld } from './tourStops';

const NOW = 1_700_000_000_000;

function world(over: Partial<TourWorld>): TourWorld {
  return { emergencies: [], trackOf: () => undefined, hazards: [], news: [], shipsIn: new Map(), now: NOW, ...over };
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
});
