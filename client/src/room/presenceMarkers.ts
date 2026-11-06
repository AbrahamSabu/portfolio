import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { ConsolePresence } from '@watchfloor/shared';
import type { TrackLayer } from '../map/trackLayer';
import { presenceByTrack, presenceLabel } from './roomView';

interface Tag {
  marker: Marker;
  element: HTMLElement;
  text: HTMLElement;
  placed: boolean;
}

/**
 * Who in the room is looking at what: a small tag on each track a console
 * has open ("CONSOLE ALFA"), below-left of the track so it never sits on
 * the selection's data block (above-right). Thin HUD lines on glass, never
 * an identity colour or the selection's orchid, so tracks stay the
 * brightest things on the map. Tags ride the dead-reckoned position.
 */
export class PresenceMarkers {
  private readonly tags = new Map<string, Tag>();

  constructor(
    private readonly map: MapLibreMap,
    private readonly layer: TrackLayer,
  ) {
    layer.onFrame(() => this.move());
  }

  set(consoles: readonly ConsolePresence[]): void {
    const byTrack = presenceByTrack(consoles);
    for (const [id, tag] of this.tags) {
      if (byTrack.has(id)) continue;
      tag.marker.remove();
      this.tags.delete(id);
    }
    for (const [id, callsigns] of byTrack) {
      let tag = this.tags.get(id);
      if (!tag) {
        const element = document.createElement('div');
        element.className = 'room-presence';
        element.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'room-presence-tag';
        element.append(text);
        // Never set a transform or position on a marker's element: MapLibre owns both.
        tag = { marker: new Marker({ element, opacityWhenCovered: '0' }), element, text, placed: false };
        this.tags.set(id, tag);
      }
      tag.text.textContent = presenceLabel(callsigns);
    }
    this.move();
  }

  private move(): void {
    for (const [id, tag] of this.tags) {
      const pos = this.layer.positionOf(id);
      if (!pos) {
        // Not in this screen's picture (yet): no tag rather than a wrong one.
        if (tag.placed) tag.marker.remove();
        tag.placed = false;
        continue;
      }
      tag.marker.setLngLat([pos.lon, pos.lat]);
      if (!tag.placed) tag.marker.addTo(this.map);
      tag.placed = true;
      tag.element.classList.toggle('room-presence-stale', pos.stale);
    }
  }
}
