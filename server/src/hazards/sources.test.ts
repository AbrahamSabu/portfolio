import fs from 'node:fs';
import type { Hazard } from '@watchfloor/shared';
import { describe, expect, it } from 'vitest';
import { mergeHazards, parseGdacs, parseUsgs } from './sources';

const fixture = (name: string) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8').replace(/^﻿/, ''));
const usgs = parseUsgs(fixture('usgs-2.5_day-2026-10-31.json'));
const gdacs = parseGdacs(fixture('gdacs-events4app-2026-10-31.json'));

describe('parseUsgs', () => {
  it("maps each quake with its magnitude, depth, time and page", () => {
    expect(usgs).toHaveLength(3);
    expect(usgs[0]).toEqual({
      id: 'usgs:us7000tui9',
      kind: 'earthquake',
      source: 'usgs',
      title: 'M 4.4 - Fiji region',
      lat: -19.2212,
      lon: -177.4956,
      time: 1793443330031,
      magnitude: 4.4,
      depthKm: 575.79,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000tui9',
    });
  });

  it('drops what is not a quake or is malformed, and survives a body that is not a feed', () => {
    const body = fixture('usgs-2.5_day-2026-10-31.json');
    body.features[0].properties.type = 'quarry blast';
    body.features[1].geometry = null;
    expect(parseUsgs(body).map((h) => h.id)).toEqual([usgs[2]!.id]);
    expect(parseUsgs('nonsense')).toEqual([]);
  });
});

describe('parseGdacs', () => {
  it('maps each event, with its alert level, a UTC start time and the report page', () => {
    expect(gdacs.map((h) => h.kind)).toEqual(['earthquake', 'cyclone', 'flood', 'wildfire']);
    const cyclone = gdacs.find((h) => h.kind === 'cyclone')!;
    expect(cyclone).toMatchObject({
      id: 'gdacs:TC:1001343',
      source: 'gdacs',
      title: 'Tropical Cyclone IN-FA-26',
      alert: 'green',
      time: Date.UTC(2026, 9, 25, 6),
      detail: 'Hurricane/Typhoon > 74 mph (maximum wind speed of 241 km/h)',
      url: 'https://www.gdacs.org/report.aspx?eventid=1001343&episodeid=32&eventtype=TC',
    });
  });

  it('leaves out a severity line that says nothing', () => {
    expect(gdacs.find((h) => h.kind === 'flood')!.detail).toBeUndefined();
  });
});

describe('mergeHazards', () => {
  const quake = (id: string, time: number, lat = 10, lon = 10): Hazard => ({
    id, kind: 'earthquake', source: 'usgs', title: id, lat, lon, time, magnitude: 6, url: 'https://example.org',
  });

  it("shows GDACS quakes once, lending their alert to USGS's, and keeps other hazards", () => {
    const g: Hazard[] = [
      { ...quake('gdacs:EQ:1', 1000 + 30_000, 10.3, 10.2), source: 'gdacs', alert: 'orange' },
      { ...quake('gdacs:EQ:2', 1000, 40, 40), source: 'gdacs', alert: 'red' },
      { ...gdacs.find((h) => h.kind === 'cyclone')! },
    ];
    const merged = mergeHazards([quake('usgs:a', 1000)], g);
    expect(merged.map((h) => h.id).sort()).toEqual(['gdacs:TC:1001343', 'usgs:a']);
    expect(merged.find((h) => h.id === 'usgs:a')!.alert).toBe('orange');
  });

  it('lists newest first', () => {
    const merged = mergeHazards([quake('old', 1), quake('new', 5)], []);
    expect(merged.map((h) => h.id)).toEqual(['new', 'old']);
  });
});
