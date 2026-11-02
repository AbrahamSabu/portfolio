/**
 * Arithmetic for a windowed list: which rows to build, and where to scroll to
 * show one. Rows have a fixed height, so a row's position is just
 * index x height, and only the rows in view (plus a margin) need to exist.
 */

export interface Viewport {
  /** Scroll offset of the container. */
  scrollTop: number;
  /** Visible height of the container. */
  height: number;
  /** Height of the sticky header covering the top of the container. */
  headerHeight: number;
  rowHeight: number;
}

/** Half-open range [start, end) of row indexes to render. */
export function visibleRange(v: Viewport, total: number, overscan: number): { start: number; end: number } {
  if (total === 0 || v.rowHeight <= 0) return { start: 0, end: 0 };
  // Rows begin below the header in content coordinates.
  const first = Math.floor(Math.max(0, v.scrollTop) / v.rowHeight);
  const visible = Math.ceil(v.height / v.rowHeight) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + visible + overscan);
  return { start, end };
}

/** The scroll offset that brings row `index` fully into view with the least movement. */
export function revealScrollTop(v: Viewport, index: number): number {
  const top = index * v.rowHeight; // relative to the first row
  const viewTop = v.scrollTop; // first row sits right under the sticky header at scrollTop 0
  const viewBottom = v.scrollTop + v.height - v.headerHeight;
  if (top < viewTop) return top;
  if (top + v.rowHeight > viewBottom) return top + v.rowHeight - (v.height - v.headerHeight);
  return v.scrollTop;
}
