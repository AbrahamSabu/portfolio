import type { NewsKind } from '@watchfloor/shared';

/**
 * News markers: one outline per kind of story, on a 24-unit square, drawn
 * in the ink colour with a dark fill. Not an identity colour: a story isn't
 * friend or hostile, and the map's dots are already identity-coloured. Kinds
 * differ by shape, like aircraft and ships do zoomed out.
 */
const PATHS: Record<NewsKind, string> = {
  // A burst.
  conflict: 'M12 2 L14.6 9.4 L22 12 L14.6 14.6 L12 22 L9.4 14.6 L2 12 L9.4 9.4 Z',
  // A triangle, point up.
  protest: 'M12 3 L22 20 L2 20 Z',
  // A ballot box with its slot.
  election: 'M4 6 H20 V20 H4 Z M8 11 H16',
  // Two linked rings.
  diplomacy: 'M2.5 12 A5.5 5.5 0 1 0 13.5 12 A5.5 5.5 0 1 0 2.5 12 Z M10.5 12 A5.5 5.5 0 1 0 21.5 12 A5.5 5.5 0 1 0 10.5 12 Z',
  // A diamond.
  politics: 'M12 3 L21 12 L12 21 L3 12 Z',
};

export const NEWS_INK = '#F2F6F8';
const NEWS_FILL = 'rgba(16, 28, 35, 0.85)';

export const NEWS_KIND_LABEL: Record<NewsKind, string> = {
  conflict: 'Conflict',
  protest: 'Protest',
  election: 'Elections',
  diplomacy: 'Diplomacy',
  politics: 'Politics',
};

const PREFIX = 'news:';

export function newsImageId(kind: NewsKind): string {
  return PREFIX + kind;
}

export function parseNewsImageId(id: string): NewsKind | null {
  if (!id.startsWith(PREFIX)) return null;
  const kind = id.slice(PREFIX.length);
  return kind in PATHS ? (kind as NewsKind) : null;
}

/** For the map: 20 px, with a dark halo so it reads over any basemap. */
export function renderNewsIcon(kind: NewsKind, pixelRatio: number): { image: ImageData; pixelRatio: number } | null {
  const size = Math.round(20 * pixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(size / 24, size / 24);
  const path = new Path2D(PATHS[kind]);
  ctx.lineJoin = 'round';
  ctx.fillStyle = NEWS_FILL;
  ctx.fill(path, 'nonzero');
  ctx.strokeStyle = 'rgba(9, 16, 21, 0.9)';
  ctx.lineWidth = 4;
  ctx.stroke(path);
  ctx.strokeStyle = NEWS_INK;
  ctx.lineWidth = 1.8;
  ctx.stroke(path);
  return { image: ctx.getImageData(0, 0, size, size), pixelRatio };
}

/** The same outline for the page (cards, ticker): stroked in currentColor. */
export function newsIconSvg(kind: NewsKind, size = 14): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path d="${PATHS[kind]}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
