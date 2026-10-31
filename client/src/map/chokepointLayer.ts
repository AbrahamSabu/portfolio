import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { ServerClock } from '../state/clock';
import { centreOf, CHOKEPOINTS, chokepointCounts } from '../state/chokepoints';
import type { StoredToggle } from '../state/storedToggle';
import type { TrackStore } from '../state/trackStore';

const SOURCE = 'chokepoints';
const LAYER = 'chokepoint-boxes';
const COUNT_MS = 5_000;
/** Tags are for the wide view; zoomed in, the ships themselves are the picture. */
const TAG_MAX_ZOOM = 8;
/** Below this the tags shrink to a name and a number, so eight of them fit on the globe. */
const FULL_TAG_ZOOM = 4;

/**
 * The world's shipping chokepoints: a tag at each with the ships in it now
 * (and how many are under way), and, closer in, a dashed outline of the
 * box being counted. Choosing a tag zooms to it. The C key hides them.
 */
export class ChokepointLayer {
  private readonly tags = new Map<string, { marker: Marker; el: HTMLElement; label: HTMLElement; number: HTMLElement; count: HTMLElement }>();

  constructor(
    private readonly map: MapLibreMap,
    private readonly store: TrackStore,
    private readonly clock: ServerClock,
    private readonly shown: StoredToggle,
  ) {
    for (const point of CHOKEPOINTS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'choke-tag';
      const name = document.createElement('span');
      name.className = 'choke-name';
      const label = document.createElement('span');
      const number = document.createElement('span');
      number.className = 'choke-number';
      name.append(label, number);
      const count = document.createElement('span');
      count.className = 'choke-count';
      el.append(name, count);
      el.addEventListener('click', (event) => {
        event.stopPropagation(); // not a click on the map underneath
        const { south, west, north, east } = point.box;
        map.fitBounds([[west, south], [east, north]], { padding: 80, maxZoom: 10, duration: 900 });
      });
      // Round the back of the globe a tag goes, not dimmed (MapLibre's default leaves a ghost at the edge).
      const marker = new Marker({ element: el, anchor: 'left', offset: [6, 0], opacityWhenCovered: '0' }).setLngLat(centreOf(point.box));
      this.tags.set(point.id, { marker, el, label, number, count });
    }
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    map.on('zoomend', () => this.applyVisibility());
    shown.subscribe(() => this.applyVisibility());
    window.setInterval(() => this.updateCounts(), COUNT_MS);
    this.updateCounts();
    this.applyVisibility();
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) {
      const features: Feature<Polygon>[] = CHOKEPOINTS.map(({ id, box: b }) => ({
        type: 'Feature',
        properties: { id },
        geometry: { type: 'Polygon', coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]] },
      }));
      const data: FeatureCollection<Polygon> = { type: 'FeatureCollection', features };
      map.addSource(SOURCE, { type: 'geojson', data });
    }
    if (!map.getLayer(LAYER)) {
      map.addLayer({
        id: LAYER,
        type: 'line',
        source: SOURCE,
        minzoom: 5,
        paint: { 'line-color': 'rgba(63, 182, 255, 0.45)', 'line-width': 1, 'line-dasharray': [3, 3] },
      });
    }
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const on = this.shown.value;
    if (this.map.getLayer(LAYER)) this.map.setLayoutProperty(LAYER, 'visibility', on ? 'visible' : 'none');
    const zoom = this.map.getZoom();
    const tagsOn = on && zoom < TAG_MAX_ZOOM;
    const full = zoom >= FULL_TAG_ZOOM;
    for (const [id, { marker, el, label }] of this.tags) {
      const point = CHOKEPOINTS.find((c) => c.id === id)!;
      el.classList.toggle('choke-tag-compact', !full);
      label.textContent = full ? point.name : point.short;
      if (tagsOn) marker.addTo(this.map);
      else marker.remove();
    }
  }

  private updateCounts(): void {
    const now = this.clock.now();
    const counts = chokepointCounts(this.store.all(), (t) => this.store.status(t, now) === 'live');
    for (const [id, { el, number, count }] of this.tags) {
      const c = counts.get(id)!;
      const line = c.ships === 0 ? 'no ships seen' : `${c.ships} ship${c.ships === 1 ? '' : 's'} · ${c.moving} under way`;
      number.textContent = String(c.ships);
      count.textContent = line;
      el.title = `${CHOKEPOINTS.find((p) => p.id === id)!.name}: ${line}`;
    }
  }
}
