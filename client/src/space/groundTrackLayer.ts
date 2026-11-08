import type { GeoJSONSource, Map as MapLibreMap, ExpressionSpecification } from 'maplibre-gl';
import { LOWEST_TRACK_LAYER } from '../map/trackLayer';
import { splitAtAntimeridian } from './orbit';
import type { GroundTrack } from './propagate';

const SOURCE = 'sat-ground-tracks';
const PAST_LAYER = 'sat-ground-tracks-past';
const FUTURE_LAYER = 'sat-ground-tracks-future';
/** The accent, for the selected satellite's track as for a selected track's path. */
const ACCENT = '#C9A0FF';
const STEEL = '#A9C4DE';

export interface TrackLine {
  track: GroundTrack;
  /** When "now" is on the track: past before it, future after. */
  now: number;
  selected: boolean;
}

/**
 * Ground tracks: where a satellite is overhead, half an orbit behind (dashed)
 * and one ahead (solid). Always for the crewed stations, faintly; for the
 * selected satellite in the accent. Under the tracks, on the ground.
 */
export class GroundTrackLayer {
  private lines: TrackLine[] = [];
  private visible = true;

  constructor(private readonly map: MapLibreMap) {
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
  }

  set(lines: TrackLine[]): void {
    this.lines = lines;
    this.render();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const id of [PAST_LAYER, FUTURE_LAYER]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const beforeId = map.getLayer(LOWEST_TRACK_LAYER) ? LOWEST_TRACK_LAYER : undefined;
    const color: ExpressionSpecification = ['case', ['get', 'selected'], ACCENT, STEEL];
    if (!map.getLayer(PAST_LAYER)) {
      map.addLayer(
        {
          id: PAST_LAYER,
          type: 'line',
          source: SOURCE,
          filter: ['==', ['get', 'part'], 'past'],
          layout: { 'line-join': 'round', visibility: this.visible ? 'visible' : 'none' },
          paint: {
            'line-color': color,
            'line-width': 1.2,
            'line-dasharray': [2, 3],
            'line-opacity': ['case', ['get', 'selected'], 0.55, 0.25],
          },
        },
        beforeId,
      );
    }
    if (!map.getLayer(FUTURE_LAYER)) {
      map.addLayer(
        {
          id: FUTURE_LAYER,
          type: 'line',
          source: SOURCE,
          filter: ['==', ['get', 'part'], 'future'],
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: this.visible ? 'visible' : 'none' },
          paint: {
            'line-color': color,
            'line-width': ['case', ['get', 'selected'], 1.6, 1.1],
            'line-opacity': ['case', ['get', 'selected'], 0.85, 0.4],
          },
        },
        beforeId,
      );
    }
    this.render();
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    if (!source) return;
    const features: GeoJSON.Feature[] = [];
    for (const { track, now, selected } of this.lines) {
      const n = track.lons.length;
      if (n < 2) continue;
      const split = Math.min(n - 1, Math.max(0, Math.round((now - track.start) / track.stepMs)));
      const parts = {
        past: splitAtAntimeridian(track.lons.slice(0, split + 1), track.lats.slice(0, split + 1)),
        future: splitAtAntimeridian(track.lons.slice(split), track.lats.slice(split)),
      };
      for (const [part, pieces] of Object.entries(parts)) {
        if (pieces.length === 0) continue;
        features.push({ type: 'Feature', properties: { part, selected }, geometry: { type: 'MultiLineString', coordinates: pieces } });
      }
    }
    source.setData({ type: 'FeatureCollection', features });
  }
}
