import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { Track } from '@watchfloor/shared';
import type { ServerClock } from '../state/clock';
import type { Selection } from '../state/selection';
import type { TrackStore } from '../state/trackStore';
import { formatAltitude, formatCourse, formatSpeed, PLATFORM_LABEL } from '../ui/format';
import type { TrackLayer } from './trackLayer';

/** The second row timeshares its fields, as a STARS/ERAM data block does. */
const SHARE_MS = 4_000;

/**
 * An ATC-style data block beside the selected track: callsign on top, then a
 * line that timeshares its fields every few seconds the way a controller's
 * STARS or ERAM block does (altitude and speed, then type and squawk). Only
 * the selected track gets one — a controller's scope shows a block per
 * aircraft, but a worldwide picture would be solid text. It rides the same
 * dead-reckoned position as the reticle.
 */
export class DataBlock {
  private marker: Marker | null = null;
  private readonly el = document.createElement('div');
  private readonly name = document.createElement('div');
  private readonly facts = document.createElement('div');
  private lastText = 0;

  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly layer: TrackLayer,
    private readonly selection: Selection,
  ) {
    this.el.className = 'data-block';
    this.el.setAttribute('aria-hidden', 'true');
    this.name.className = 'data-block-name';
    this.facts.className = 'data-block-facts';
    const card = document.createElement('div');
    card.className = 'data-block-card';
    card.append(this.name, this.facts);
    this.el.append(card);
    selection.subscribe(() => this.refresh(true));
    layer.onFrame(() => this.refresh(false));
  }

  private refresh(force: boolean): void {
    const id = this.selection.id;
    const track = id ? this.store.get(id) : undefined;
    const pos = id ? this.layer.positionOf(id) : undefined;
    if (!track || !pos) {
      this.marker?.remove();
      this.marker = null;
      return;
    }
    if (!this.marker) {
      this.marker = new Marker({ element: this.el, opacityWhenCovered: '0' }).setLngLat([pos.lon, pos.lat]).addTo(this.map);
    } else this.marker.setLngLat([pos.lon, pos.lat]);
    this.el.classList.toggle('data-block-stale', pos.stale);
    const now = this.clock.now();
    if (!force && now - this.lastText < 1_000) return;
    this.lastText = now;
    this.name.textContent = track.callsign ?? (track.id.split(':')[1] ?? track.id).toUpperCase();
    this.facts.textContent = sharedRow(track, Math.floor(now / SHARE_MS) % 2 === 0);
  }
}

/** The timeshared second row: what a controller would want, phase by phase. */
function sharedRow(track: Track, first: boolean): string {
  if (track.domain === 'air') {
    if (first) return `${formatAltitude(track.altitudeM)} · ${formatSpeed(track.speedMps)}`;
    // The type code, as a controller's block would have it; the panel has the full name.
    const type = track.typeCode ?? PLATFORM_LABEL[track.platform];
    return track.squawk ? `${type} · ${track.squawk}` : type;
  }
  if (first) return `${formatSpeed(track.speedMps)} · ${formatCourse(track.courseDeg)}`;
  return PLATFORM_LABEL[track.platform];
}
