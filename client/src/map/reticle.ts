import { Marker, type Map as MapLibreMap } from 'maplibre-gl';

/**
 * Corner brackets drawn around the selected track. A DOM marker rather than
 * a map layer, so it can animate when a new track is selected.
 */
export class Reticle {
  private readonly element: HTMLDivElement;
  /** Inner element carries the animation; MapLibre owns the outer element's transform. */
  private readonly frame: HTMLDivElement;
  private readonly marker: Marker;
  private visible = false;

  constructor(private readonly map: MapLibreMap) {
    this.element = document.createElement('div');
    this.element.className = 'reticle';
    this.element.setAttribute('aria-hidden', 'true');
    this.frame = document.createElement('div');
    this.frame.className = 'reticle-frame';
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      const span = document.createElement('span');
      span.className = `reticle-corner reticle-${corner}`;
      this.frame.append(span);
    }
    this.element.append(this.frame);
    this.marker = new Marker({ element: this.element, anchor: 'center' }).setLngLat([0, 0]);
  }

  show(lon: number, lat: number, animate: boolean): void {
    this.marker.setLngLat([lon, lat]);
    if (!this.visible) {
      this.marker.addTo(this.map);
      this.visible = true;
    }
    if (animate) {
      // Restart the lock-on animation.
      this.frame.classList.remove('reticle-lock');
      void this.frame.offsetWidth;
      this.frame.classList.add('reticle-lock');
    }
  }

  move(lon: number, lat: number): void {
    if (this.visible) this.marker.setLngLat([lon, lat]);
  }

  setStale(stale: boolean): void {
    this.element.classList.toggle('reticle-stale', stale);
  }

  hide(): void {
    if (!this.visible) return;
    this.marker.remove();
    this.visible = false;
  }
}
