import type { Hazard, NewsItem, Track } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { countryBriefing, countryKey } from './countryBriefing';

const NOW = Date.UTC(2026, 9, 31, 12);
const story = (id: string, place: string, hoursAgo = 1): NewsItem => ({
  id, headline: `Headline ${id} about parliament`, url: `https://example.org/${id}`, outlet: 'example.org',
  lat: 0, lon: 0, place, kind: 'politics', publishedAt: NOW - hoursAgo * 3_600_000, importance: 10,
});
const track = (id: string, source: 'adsb' | 'ais', platform: Track['platform']): Track => ({
  id, source, domain: source === 'adsb' ? 'air' : 'sea', platform, affiliation: 'unknown', lat: 0, lon: 0, courseDeg: 0, speedMps: 0, observedAt: 0,
});
const hazard = (title: string): Hazard => ({ id: title, kind: 'flood', source: 'gdacs', title, lat: 0, lon: 0, time: 0, url: 'https://example.org' });

describe('countryKey', () => {
  it('folds case, accents and other spellings together', () => {
    expect(countryKey('Czechia')).toBe(countryKey('Czech Republic'));
    expect(countryKey('Russian Federation')).toBe('russia');
    expect(countryKey('Türkiye')).toBe('turkey');
    expect(countryKey("Côte d'Ivoire")).toBe('ivory coast');
  });
});

describe('countryBriefing', () => {
  it("gathers a country's news, its aircraft and ships on the map, and hazards naming it", () => {
    const result = countryBriefing('Ireland', {
      news: [story('a', 'Dublin, Dublin, Ireland'), story('b', 'Ireland', 3), story('c', 'Belfast, United Kingdom'), story('old', 'Cork, Ireland', 30)],
      tracks: [
        track('adsb:4ca2bf', 'adsb', 'airliner'), // Irish block
        track('adsb:4ca9f1', 'adsb', 'military-aircraft'),
        track('adsb:a1b2c3', 'adsb', 'airliner'), // United States
        track('ais:250123456', 'ais', 'cargo'), // MID 250: Ireland
        track('ais:366123456', 'ais', 'cargo'), // MID 366: United States
      ],
      hazards: [hazard('Flood in Ireland'), hazard('M 4.9 - 30 km SW of Galway, Ireland'), hazard('Flood in Northern Ireland Sea')],
      now: NOW,
    });
    expect(result.stories.map((e) => e.story.id)).toEqual(['a', 'b']);
    expect(result.storyCount).toBe(2);
    expect(result).toMatchObject({ aircraft: 2, militaryAircraft: 1, ships: 1 });
    expect(result.hazards.map((h) => h.title)).toEqual(['Flood in Ireland', 'M 4.9 - 30 km SW of Galway, Ireland']);
  });
});
