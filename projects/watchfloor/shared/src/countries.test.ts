import { describe, expect, it } from 'vitest';
import { flagCountry, registrationCountry } from './countries';

describe('registrationCountry', () => {
  it('finds the state whose block holds the address', () => {
    expect(registrationCountry('4ca7b3')).toBe('Ireland');
    expect(registrationCountry('400f12')).toBe('United Kingdom');
    expect(registrationCountry('a1b2c3')).toBe('United States');
    expect(registrationCountry('3c6589')).toBe('Germany');
    expect(registrationCountry('7c1234')).toBe('Australia');
  });

  it('prefers the smaller block inside a larger one', () => {
    // Ireland's 4CA000/12 sits inside nothing larger, but Serbia's 4C0000/9 is next to it.
    expect(registrationCountry('4c0123')).toBe('Serbia');
    expect(registrationCountry('4ca000')).toBe('Ireland');
  });

  it('gives nothing for unallocated or malformed addresses', () => {
    expect(registrationCountry('000000')).toBeUndefined();
    expect(registrationCountry('zzzzzz')).toBeUndefined();
    expect(registrationCountry('4ca7b')).toBeUndefined();
  });
});

describe('flagCountry', () => {
  it('reads the flag from the MMSI', () => {
    expect(flagCountry('235000001')).toBe('United Kingdom');
    expect(flagCountry('636012345')).toBe('Liberia');
    expect(flagCountry('366999999')).toBe('United States');
  });

  it('gives nothing for MMSIs that are not ships', () => {
    expect(flagCountry('002351234')).toBeUndefined(); // coast station
    expect(flagCountry('970123456')).toBeUndefined(); // AIS-SART
    expect(flagCountry('23500000')).toBeUndefined();
  });
});
