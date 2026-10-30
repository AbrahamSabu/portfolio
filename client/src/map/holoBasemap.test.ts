import { describe, expect, it } from 'vitest';
import { holoPaint } from './holoBasemap';

describe('holoPaint', () => {
  it('turns the sea near-black and the land deep navy', () => {
    expect(holoPaint({ id: 'water', type: 'fill' })).toMatchObject({ 'fill-color': '#01060d' });
    expect(holoPaint({ id: 'background', type: 'background' })).toEqual({ 'background-color': '#04111f' });
  });

  it('draws borders as faint glowing lines and drops road casings', () => {
    expect(holoPaint({ id: 'boundary_country_inner', type: 'line' })).toEqual({ 'line-color': 'rgba(63, 182, 255, 0.5)' });
    expect(holoPaint({ id: 'road_pri_case_noramp', type: 'line' })).toEqual({ 'line-color': 'rgba(0, 0, 0, 0)' });
    expect(holoPaint({ id: 'road_pri_fill_noramp', type: 'line' })).toEqual({ 'line-color': 'rgba(63, 182, 255, 0.13)' });
  });

  it('leaves layers it does not know alone', () => {
    expect(holoPaint({ id: 'something_else', type: 'line' })).toBeNull();
    expect(holoPaint({ id: 'hills', type: 'hillshade' })).toBeNull();
  });
});
