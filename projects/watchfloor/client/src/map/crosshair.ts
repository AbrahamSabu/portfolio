import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Hairlines that track the pointer across the map, meeting under it: the
 * plotting-table feel, and a visual pair to the status bar's live cursor
 * coordinates. Mouse and pen only — a finger brings its own crosshair — and
 * the lines only ever move with the operator's hand, so reduced motion
 * needs no special case. Pure compositor work: two transforms per move.
 */
export class Crosshair {
  constructor(map: MapLibreMap) {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const container = map.getContainer();
    const h = document.createElement('div');
    h.className = 'crosshair crosshair-h';
    const v = document.createElement('div');
    v.className = 'crosshair crosshair-v';
    // Hidden until the pointer first moves over the map; the stylesheet owns
    // the resting opacity, so showing is just clearing the inline override.
    h.style.opacity = v.style.opacity = '0';
    container.append(h, v);
    container.addEventListener('pointermove', (event) => {
      const r = container.getBoundingClientRect();
      h.style.transform = `translateY(${event.clientY - r.top}px)`;
      v.style.transform = `translateX(${event.clientX - r.left}px)`;
      h.style.opacity = v.style.opacity = '';
    });
    container.addEventListener('pointerleave', () => {
      h.style.opacity = v.style.opacity = '0';
    });
  }
}
