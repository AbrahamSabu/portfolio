import { describe, expect, it } from 'vitest';
import { revealScrollTop, visibleRange, type Viewport } from './listWindow';

const view = (scrollTop: number): Viewport => ({ scrollTop, height: 300, headerHeight: 30, rowHeight: 30 });

describe('visibleRange', () => {
  it('builds only the rows in view plus the overscan', () => {
    expect(visibleRange(view(0), 7000, 5)).toEqual({ start: 0, end: 16 });
    expect(visibleRange(view(3000), 7000, 5)).toEqual({ start: 95, end: 116 });
  });

  it('clamps at the end of the list', () => {
    expect(visibleRange(view(30 * 6990), 7000, 5)).toEqual({ start: 6985, end: 7000 });
  });

  it('handles empty lists and short lists', () => {
    expect(visibleRange(view(0), 0, 5)).toEqual({ start: 0, end: 0 });
    expect(visibleRange(view(0), 3, 5)).toEqual({ start: 0, end: 3 });
  });
});

describe('revealScrollTop', () => {
  it('leaves the scroll alone when the row is already in view', () => {
    expect(revealScrollTop(view(300), 12)).toBe(300);
  });

  it('scrolls up so the row sits just under the sticky header', () => {
    expect(revealScrollTop(view(300), 4)).toBe(120);
  });

  it('scrolls down just far enough to show the row at the bottom', () => {
    // 270 px of rows are visible below the 30 px header: 9 rows.
    expect(revealScrollTop(view(0), 20)).toBe(21 * 30 - 270);
  });
});
