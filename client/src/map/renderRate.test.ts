import { describe, expect, it } from 'vitest';
import { metresPerPixel, renderIntervalMs } from './renderRate';

describe('metresPerPixel', () => {
  it('matches Web Mercator: about 19.6 km per pixel at zoom 2 on the equator', () => {
    expect(metresPerPixel(2, 0)).toBeCloseTo(19_568, 0);
  });

  it('halves with each zoom level and shrinks towards the poles', () => {
    expect(metresPerPixel(3, 0)).toBeCloseTo(metresPerPixel(2, 0) / 2, 6);
    expect(metresPerPixel(2, 60)).toBeCloseTo(metresPerPixel(2, 0) / 2, 6);
  });
});

describe('renderIntervalMs', () => {
  it('redraws once a second for a world view', () => {
    expect(renderIntervalMs(2, 30)).toBe(1000);
  });

  it('redraws at 10 Hz zoomed in close', () => {
    expect(renderIntervalMs(12, 50)).toBe(100);
  });

  it('scales in between, so a fast jet moves at most half a pixel per frame', () => {
    const ms = renderIntervalMs(8, 50);
    expect(ms).toBeGreaterThan(100);
    expect(ms).toBeLessThan(1000);
    expect((300 * ms) / 1000).toBeCloseTo(metresPerPixel(8, 50) / 2, 6);
  });

  it('never gets slower as you zoom in', () => {
    for (let z = 0; z < 20; z++) {
      expect(renderIntervalMs(z + 1, 45)).toBeLessThanOrEqual(renderIntervalMs(z, 45));
    }
  });
});

describe('renderIntervalMs for ships', () => {
  it('waits up to 5 s zoomed out, where a ship takes minutes to cross a pixel', () => {
    expect(renderIntervalMs(2, 30, 'sea')).toBe(5000);
    expect(renderIntervalMs(5, 50, 'sea')).toBe(5000);
  });

  it('keeps a 25 m/s ship within half a pixel per redraw zoomed in, down to the 10 Hz floor', () => {
    const ms = renderIntervalMs(10, 50, 'sea');
    expect((25 * ms) / 1000).toBeCloseTo(metresPerPixel(10, 50) / 2, 6);
    expect(renderIntervalMs(16, 50, 'sea')).toBe(100);
  });

  it('is never more frequent than for aircraft', () => {
    for (let z = 0; z < 20; z++) expect(renderIntervalMs(z, 45, 'sea')).toBeGreaterThanOrEqual(renderIntervalMs(z, 45, 'air'));
  });
});
