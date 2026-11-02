import type { Hazard } from '@watchfloor/shared';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Popup, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import { hazardScale, type HazardStore } from '../state/hazards';
import type { StoredToggle } from '../state/storedToggle';
import { formatAge, formatNewsTime } from '../ui/format';
import { HAZARD_KIND_LABEL, hazardIconSvg, hazardImageId } from './hazardIcons';
import { isDrawing } from './regionDraw';
import type { TrackLayer } from './trackLayer';

const SOURCE = 'hazards';
const LAYER = 'hazard-icons';
/** Quakes fade over their day on the map; refreshed this often. */
const AGE_REFRESH_MS = 5 * 60_000;
const ATTRIBUTION =
  'Earthquakes: <a href="https://earthquake.usgs.gov/" target="_blank" rel="noopener">USGS</a> | Disasters: <a href="https://www.gdacs.org/" target="_blank" rel="noopener">GDACS</a>';

/**
 * Earthquakes and disasters on the map: a marker per hazard, sized by
 * magnitude or alert level, above the tracks and under the news. Clicking
 * one (unless a track is under the pointer) opens its card: what, when,
 * how strong, and a link to the source's page. The H key hides them.
 */
export class HazardLayer {
  private readonly popup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px', offset: 14, className: 'news-popup hazard-popup' });

  constructor(
    private readonly map: MapLibreMap,
    private readonly hazards: HazardStore,
    private readonly shown: StoredToggle,
    tracks: TrackLayer,
    private readonly now: () => number,
  ) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    hazards.subscribe(() => this.render());
    shown.subscribe(() => this.applyVisibility());
    window.setInterval(() => this.render(), AGE_REFRESH_MS);
    map.on('click', LAYER, (event) => {
      if (isDrawing() || tracks.trackAt(event.point)) return;
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string') this.open(id);
    });
    map.on('mouseenter', LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', LAYER, () => (map.getCanvas().style.cursor = ''));
  }

  /** Show one hazard's card. */
  open(id: string): void {
    const hazard = this.hazards.get(id);
    if (!hazard) return;
    if (!this.shown.value) this.shown.set(true);
    this.popup.setLngLat([hazard.lon, hazard.lat]).setDOMContent(buildCard(hazard, this.now()));
    if (!this.popup.isOpen()) this.popup.addTo(this.map);
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: ATTRIBUTION });
    }
    if (!map.getLayer(LAYER)) {
      map.addLayer({
        id: LAYER,
        type: 'symbol',
        source: SOURCE,
        layout: {
          'icon-image': ['get', 'icon'],
          // Zoom must be the outermost input (MapLibre rejects it inside '*').
          'icon-size': ['interpolate', ['linear'], ['zoom'], 0.5, ['*', 0.6, ['get', 'scale']], 4, ['*', 0.8, ['get', 'scale']], 8, ['get', 'scale']],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          // Biggest on top.
          'symbol-sort-key': ['get', 'scale'],
        },
        paint: { 'icon-opacity': ['interpolate', ['linear'], ['get', 'ageH'], 0, 1, 24, 0.5] },
      });
    }
    this.applyVisibility();
    this.render();
  }

  private applyVisibility(): void {
    if (this.map.getLayer(LAYER)) this.map.setLayoutProperty(LAYER, 'visibility', this.shown.value ? 'visible' : 'none');
    if (!this.shown.value) this.popup.remove();
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    if (!source) return;
    const now = this.now();
    const features: Feature<Point>[] = this.hazards.items.map((h) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
      properties: {
        id: h.id,
        icon: hazardImageId(h.kind),
        scale: hazardScale(h),
        // Only quakes age out: a cyclone that began days ago is still today's.
        ageH: h.kind === 'earthquake' ? Math.max(0, (now - h.time) / 3_600_000) : 0,
      },
    }));
    const data: FeatureCollection<Point> = { type: 'FeatureCollection', features };
    source.setData(data);
  }
}

/** The card: kind, time, the source's own title, its numbers, and a link. Text via textContent only. */
function buildCard(h: Hazard, now: number): HTMLElement {
  const card = document.createElement('article');
  card.className = 'news-card hazard-card';

  const head = document.createElement('div');
  head.className = 'news-card-head';
  const icon = document.createElement('span');
  icon.className = 'news-card-icon hazard-card-icon';
  icon.innerHTML = hazardIconSvg(h.kind, 14); // fixed markup
  const kind = document.createElement('span');
  kind.className = 'news-card-kind';
  kind.textContent = HAZARD_KIND_LABEL[h.kind].toUpperCase();
  const time = document.createElement('time');
  time.dateTime = new Date(h.time).toISOString();
  time.textContent = `${formatNewsTime(h.time)} · ${formatAge(Math.max(0, now - h.time))}`;
  head.append(icon, kind, time);

  const title = document.createElement('p');
  title.className = 'news-card-headline';
  title.textContent = h.title;

  const facts = document.createElement('div');
  facts.className = 'hazard-card-facts';
  facts.textContent = [
    h.magnitude !== undefined ? `Magnitude ${h.magnitude.toFixed(1)}` : null,
    h.depthKm !== undefined ? `${Math.round(h.depthKm)} km deep` : null,
    h.alert ? `GDACS alert: ${h.alert}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const parts: HTMLElement[] = [head, title];
  if (facts.textContent) parts.push(facts);
  if (h.detail) {
    const detail = document.createElement('div');
    detail.className = 'hazard-card-facts';
    detail.textContent = h.detail;
    parts.push(detail);
  }
  if (h.source === 'gdacs' || h.alert) {
    const note = document.createElement('p');
    note.className = 'alert-note';
    note.textContent = "GDACS's alerts are automatic estimates and can be wrong; local authorities' warnings come first.";
    parts.push(note);
  }
  const link = document.createElement('a');
  link.className = 'news-card-source';
  link.href = h.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = h.source === 'usgs' ? 'USGS event page ↗' : 'GDACS report ↗';
  parts.push(link);
  card.append(...parts);
  return card;
}
