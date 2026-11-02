import type { HazardKind } from '@watchfloor/shared';

/**
 * Hazard markers: one outline per kind on a 24-unit square, in a pale
 * apricot with a dark fill. Warm, so a natural hazard reads apart from the
 * white news markers, but pale and unsaturated, well away from hostile red
 * and unknown yellow: a flood is nobody's identity. How bad it is shows as
 * size and in the card, never as colour.
 */
const PATHS: Record<HazardKind, string> = {
  // Ripples from an epicentre.
  earthquake: 'M12 9a3 3 0 1 0 0.01 0Z M12 4.5a7.5 7.5 0 1 0 0.01 0Z',
  // An eye with two spiral arms.
  cyclone: 'M12 9a3 3 0 1 0 0.01 0Z M12 3.5c-5 0-8.5 3-8.5 7 M12 20.5c5 0 8.5-3 8.5-7',
  // Three waves.
  flood: 'M3 8q2.25-2.5 4.5 0t4.5 0t4.5 0t4.5 0 M3 13q2.25-2.5 4.5 0t4.5 0t4.5 0t4.5 0 M3 18q2.25-2.5 4.5 0t4.5 0t4.5 0t4.5 0',
  // A cone with smoke.
  volcano: 'M3 21 L9 10 H15 L21 21 Z M10 7.5 L8.5 3.5 M12 7 V2.5 M14 7.5 L15.5 3.5',
  // A sun.
  drought: 'M12 8a4 4 0 1 0 0.01 0Z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1l2.1-2.1 M17 7l2.1-2.1',
  // A flame.
  wildfire: 'M12 2.5c1 4 6.5 6 6.5 11.5a6.5 6.5 0 0 1-13 0c0-3 1.8-4.5 3-6.5 0.3 2 1.2 3 2.3 3.3 0-3.3-0.8-5.6 1.2-8.3Z',
};

export const HAZARD_INK = '#FFD2A8';
const FILL = 'rgba(16, 10, 4, 0.82)';

export const HAZARD_KIND_LABEL: Record<HazardKind, string> = {
  earthquake: 'Earthquake',
  cyclone: 'Tropical cyclone',
  flood: 'Flood',
  volcano: 'Volcano',
  drought: 'Drought',
  wildfire: 'Wildfire',
};

const PREFIX = 'hz:';

export function hazardImageId(kind: HazardKind): string {
  return PREFIX + kind;
}

/** For the map's image resolver; undefined when the id isn't a hazard's. */
export function renderHazardImage(id: string, pixelRatio: number): { image: ImageData; pixelRatio: number } | null | undefined {
  if (!id.startsWith(PREFIX)) return undefined;
  const kind = id.slice(PREFIX.length);
  if (!(kind in PATHS)) return null;
  const size = Math.round(22 * pixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(size / 24, size / 24);
  const path = new Path2D(PATHS[kind as HazardKind]);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.fillStyle = FILL;
  ctx.fill(path, 'nonzero');
  ctx.strokeStyle = 'rgba(12, 8, 4, 0.9)';
  ctx.lineWidth = 4;
  ctx.stroke(path);
  ctx.strokeStyle = HAZARD_INK;
  ctx.lineWidth = 1.7;
  ctx.stroke(path);
  return { image: ctx.getImageData(0, 0, size, size), pixelRatio };
}

/** The same outline for the page (card, key), stroked in currentColor. */
export function hazardIconSvg(kind: HazardKind, size = 14): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path d="${PATHS[kind]}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
