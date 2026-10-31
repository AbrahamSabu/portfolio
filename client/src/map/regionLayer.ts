import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import { unwrapRing, type Region, type RegionStore } from '../state/regions';

const SOURCE = 'regions';
const FILL = 'region-fill';
const LINE = 'region-line';

/**
 * Watch areas on the map: a faint fill and a dashed outline in the
 * display's light, under the tracks, with a tag naming each and how many
 * it holds now. Choosing a tag fits the area on screen.
 */
export class RegionLayer {
  private readonly tags = new Map<string, { marker: Marker; count: HTMLElement }>();

  constructor(
    private readonly map: MapLibreMap,
    private readonly regions: RegionStore,
  ) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    regions.subscribe(() => this.render());
  }

  /** Fit an area on screen. */
  show(region: Region): void {
    const ring = unwrapRing(region.ring);
    const lons = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    this.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, maxZoom: 11, duration: 900 });
  }

  /** The number inside each area, from the watch. */
  setCounts(count: (regionId: string) => number): void {
    for (const [id, tag] of this.tags) {
      const n = count(id);
      tag.count.textContent = n === 0 ? 'none inside' : `${n} inside`;
    }
  }

  /** Added before the tracks are, so areas sit under them. */
  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer(FILL)) map.addLayer({ id: FILL, type: 'fill', source: SOURCE, paint: { 'fill-color': 'rgba(63, 182, 255, 0.06)' } });
    if (!map.getLayer(LINE)) {
      map.addLayer({ id: LINE, type: 'line', source: SOURCE, paint: { 'line-color': 'rgba(168, 230, 255, 0.75)', 'line-width': 1.3, 'line-dasharray': [4, 3] } });
    }
    this.render();
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    const features: Feature<Polygon>[] = this.regions.regions.map((r) => {
      const ring = unwrapRing(r.ring);
      return { type: 'Feature', properties: { id: r.id }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] } };
    });
    const data: FeatureCollection<Polygon> = { type: 'FeatureCollection', features };
    source?.setData(data);
    this.renderTags();
  }

  private renderTags(): void {
    const ids = new Set(this.regions.regions.map((r) => r.id));
    for (const [id, tag] of this.tags) {
      if (ids.has(id)) continue;
      tag.marker.remove();
      this.tags.delete(id);
    }
    for (const region of this.regions.regions) {
      if (this.tags.has(region.id)) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'choke-tag region-tag';
      const name = document.createElement('span');
      name.className = 'choke-name';
      name.textContent = region.name;
      const count = document.createElement('span');
      count.className = 'choke-count';
      el.append(name, count);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        this.show(region);
      });
      // Above the area's northernmost corner, where a tag doesn't cover what's inside.
      const ring = unwrapRing(region.ring);
      const top = ring.reduce((best, p) => (p[1] > best[1] ? p : best), ring[0]!);
      const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, -4], opacityWhenCovered: '0' }).setLngLat(top).addTo(this.map);
      this.tags.set(region.id, { marker, count });
    }
  }
}
