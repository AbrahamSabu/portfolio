import type { Map as MapLibreMap } from 'maplibre-gl';
import type { TrackLayer } from '../map/trackLayer';
import type { ServerClock } from '../state/clock';
import type { TrackStore } from '../state/trackStore';
import { formatAge, formatAltitude, formatSpeed, PLATFORM_LABEL } from './format';

const OFFSET = 14;

/**
 * A small card beside the pointer naming the track under it: what you'd
 * otherwise have to click to learn. Zoomed out, tracks are anonymous dots,
 * and labels only appear from zoom 8, so this is how a busy picture is read
 * at a glance. Mouse and pen only: on touch, a tap selects instead.
 *
 * Hit-testing runs at most once a frame, however fast the pointer moves.
 */
export class HoverCard {
  private readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly kind: HTMLElement;
  private readonly facts: HTMLElement;
  private frame = 0;
  private point: { x: number; y: number } | null = null;
  private id: string | null = null;

  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly layer: TrackLayer,
  ) {
    const el = document.createElement('div');
    el.className = 'hover-card';
    el.setAttribute('role', 'tooltip');
    el.hidden = true;
    el.innerHTML = '<div class="hover-card-title"></div><div class="hover-card-kind"></div><div class="hover-card-facts"></div>';
    map.getContainer().append(el);
    this.el = el;
    this.title = el.querySelector('.hover-card-title')!;
    this.kind = el.querySelector('.hover-card-kind')!;
    this.facts = el.querySelector('.hover-card-facts')!;

    if (!window.matchMedia('(hover: hover)').matches) return;
    map.on('mousemove', (e) => {
      this.point = e.point;
      if (!this.frame) this.frame = requestAnimationFrame(() => this.update());
    });
    map.getCanvas().addEventListener('mouseleave', () => this.hide());
    map.on('movestart', () => this.hide());
    store.subscribe(() => this.id && this.fill(this.id));
  }

  private update(): void {
    this.frame = 0;
    const point = this.point;
    if (!point || this.map.isMoving()) return this.hide();
    const id = this.layer.trackAt(point, 4);
    if (!id || !this.fill(id)) return this.hide();
    this.id = id;
    this.el.hidden = false;
    // Beside the pointer, flipped to the other side near the right and bottom edges.
    const box = this.map.getContainer().getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = this.el;
    const x = point.x + OFFSET + w > box.width ? point.x - OFFSET - w : point.x + OFFSET;
    const y = point.y + OFFSET + h > box.height ? point.y - OFFSET - h : point.y + OFFSET;
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /** Fill the card for a track; false if the track has gone. Text only: names come from the feeds. */
  private fill(id: string): boolean {
    const track = this.store.get(id);
    if (!track) return false;
    const now = this.clock.now();
    this.title.textContent = track.callsign ?? 'No callsign';
    this.kind.textContent = track.model ?? PLATFORM_LABEL[track.platform];
    const facts = [
      track.domain === 'air' ? formatAltitude(track.altitudeM) : null,
      formatSpeed(track.speedMps),
      this.store.status(track, now) === 'stale' ? `stale, ${formatAge(now - track.observedAt)}` : null,
    ];
    this.facts.textContent = facts.filter(Boolean).join(' · ');
    return true;
  }

  private hide(): void {
    this.id = null;
    this.el.hidden = true;
  }
}
