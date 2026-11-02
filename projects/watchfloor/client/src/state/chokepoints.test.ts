import type { Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { chokepointCounts } from './chokepoints';

const ship = (id: string, lat: number, lon: number, speedMps: number, domain: 'sea' | 'air' = 'sea'): Track => ({
  id, source: 'ais', domain, platform: 'cargo', affiliation: 'unknown', lat, lon, courseDeg: 0, speedMps, observedAt: 0,
});

describe('chokepointCounts', () => {
  it('counts live ships in each narrows, and how many are under way', () => {
    const counts = chokepointCounts(
      [
        ship('hormuz-moving', 26.5, 56.4, 6),
        ship('hormuz-anchored', 26.2, 56.1, 0.2),
        ship('hormuz-stale', 26.4, 56.5, 6),
        ship('dover', 51.0, 1.5, 7),
        ship('aircraft-over-dover', 51.0, 1.5, 200, 'air'),
        ship('open-sea', 45, -20, 6),
      ],
      (t) => t.id !== 'hormuz-stale',
    );
    expect(counts.get('hormuz')).toEqual({ ships: 2, moving: 1 });
    expect(counts.get('dover')).toEqual({ ships: 1, moving: 1 });
    expect(counts.get('panama')).toEqual({ ships: 0, moving: 0 });
  });
});
