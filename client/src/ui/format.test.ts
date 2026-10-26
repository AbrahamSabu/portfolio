import { describe, expect, it } from 'vitest';
import { formatAltitude, formatCourse, formatDtg, formatLat, formatLon, formatSpeed } from './format';

describe('format', () => {
  it('writes positions as degrees and decimal minutes', () => {
    expect(formatLat(50.4519)).toBe('50°27.11′N');
    expect(formatLon(-0.8533)).toBe('000°51.20′W');
    expect(formatLat(-33.9999999)).toBe('34°00.00′S');
  });

  it('pads courses to three digits', () => {
    expect(formatCourse(7.4)).toBe('007°');
    expect(formatCourse(359.7)).toBe('000°');
  });

  it('uses knots, and flight levels at altitude', () => {
    expect(formatSpeed(5.14444)).toBe('10 kn');
    expect(formatSpeed(2)).toBe('3.9 kn');
    expect(formatAltitude(10_668)).toBe('FL350');
    expect(formatAltitude(457)).toBe('1,500 ft');
    expect(formatAltitude(undefined)).toBe('—');
  });

  it('formats a military date-time group in UTC', () => {
    expect(formatDtg(Date.UTC(2026, 9, 25, 14, 32))).toBe('251432Z OCT 26');
  });
});
