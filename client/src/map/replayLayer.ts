import type { ReplayTrack } from '@watchfloor/shared';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { AFFILIATION_LINE_COLOR } from './colors';

const SOURCE = 'replay';
const AIR = 'replay-air';
const SEA = 'replay-sea';

/**
 * The replay picture: where the fetched paths put every track at the scrubbed
 * moment. Aircraft are filled dots and ships rings, as in the zoomed-out live
 * view, in the same identity colours — but drawn only while the timeline is
 * in the past, with the live picture hidden and the tag reading REPLAY.
 */
export class ReplayLayer {
  private tracks: ReplayTrack[] = [];
  private t: number | null = null;
  private positionAt: (points: ReplayTrack['points'], t: number) => { lon: number; lat: number } | null;

  constructor(
    private readonly map: MapLibreMap,
    positionAt: (points: ReplayTrack['points'], t: number) => { lon: number; lat: number } | null,
  ) {
    this.positionAt = positionAt;
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
  }

  /** The server's answer to the replay request for the current view. */
  setData(tracks: ReplayTrack[]): void {
    this.tracks = tracks;
    this.render();
  }

  /** Show the picture as of `t`, or null to clear. */
  setTime(t: number | null): void {
    this.t = t;
    this.render();
  }

  private install(): void {
    const map = this.map;
    if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getLayer(SEA)) {
      map.addLayer({
        id: SEA,
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'domain'], 'sea'],
        paint: {
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.6, 5, 3, 10, 4.5],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 0.8, 5, 1.2],
          'circle-stroke-color': AFFILIATION_LINE_COLOR,
          'circle-stroke-opacity': 0.9,
        },
      });
    }
    if (!map.getLayer(AIR)) {
      map.addLayer({
        id: AIR,
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'domain'], 'air'],
        paint: {
          'circle-color': AFFILIATION_LINE_COLOR,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 1.4, 5, 2.8, 10, 4],
          'circle-opacity': 0.95,
        },
      });
    }
    this.render();
  }

  private render(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE);
    if (!source) return;
    const features: Feature<Point>[] = [];
    if (this.t !== null) {
      for (const track of this.tracks) {
        const p = this.positionAt(track.points, this.t);
        if (!p) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: { domain: track.domain, affiliation: track.affiliation },
        });
      }
    }
    source.setData({ type: 'FeatureCollection', features } satisfies FeatureCollection<Point>);
  }
}
