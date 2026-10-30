import { Marker, type Map as MapLibreMap } from 'maplibre-gl';

/**
 * Turning rings around the selected track (styles.css draws and spins them).
 * A DOM marker rather than a map layer, so it can animate when a new track is
 * selected.
 */
const RINGS = `<svg viewBox="-40 -40 80 80" aria-hidden="true" focusable="false">
  <circle class="reticle-outer" r="34" />
  <circle class="reticle-arcs" r="25" />
  <circle class="reticle-inner" r="17" />
  <path class="reticle-ticks" d="M0 -36V-40M36 0H40M0 36V40M-36 0H-40" />
</svg>`;
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
    this.frame.innerHTML = RINGS; // fixed markup
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
