import type { ImageSource, Map as MapLibreMap } from 'maplibre-gl';
import { solarElevation, subsolarPoint } from './sun';

/**
 * NASA's Black Marble (VIIRS city lights, 2016), the whole world as one
 * Web Mercator image from NASA GIBS: 2048px, about 170 KB, public domain,
 * and served with CORS, so its pixels can be read. Fetched once per page.
 */
const BLACK_MARBLE =
  'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
  '&LAYERS=VIIRS_Black_Marble&STYLES=&FORMAT=image/jpeg&CRS=EPSG:3857' +
  '&BBOX=-20037508.34,-20037508.34,20037508.34,20037508.34&WIDTH=2048&HEIGHT=2048&TIME=2016-01-01';
/** 1024 was soft smudges on a globe twice that size on screen; 2048 shows cities. */
const SIZE = 2048;
const MAX_LAT = 85.0511;
const SOURCE = 'night-lights';
const LAYER = 'night-lights';
const CREDIT_SOURCE = 'night-lights-credit';
/** The dark side moves a quarter-degree a minute: every two minutes is a pixel or so here. */
const REFRESH_MS = 2 * 60_000;
/**
 * The lights in the display's own pale blue, not sodium amber: amber means
 * an emergency on this floor, and the basemap is already drawn in HUD light.
 */
const LIGHT: [number, number, number] = [200, 230, 255];
const MAX_ALPHA = 0.7;

/**
 * City lights on the night side of the globe: only where the sun has set
 * (fading in from civil dusk, full by 10° below the horizon), only the lights
 * themselves (the image's dark-blue land is left out), and only zoomed out:
 * the image is 2048px for the whole world, so by zoom 7 the basemap's own
 * detail takes over. Above the night shading, under every label and track.
 */
export class NightLights {
  /** Brightness of each pixel's lights, 0-255; null until the image arrives. */
  private lights: Uint8Array | null = null;
  private readonly canvas = document.createElement('canvas');
  /**
   * Tracked from the style events, not map.isStyleLoaded(): that reads false
   * whenever tiles are still loading, which is exactly when the image tends
   * to arrive, and the layer then never went in.
   */
  private styleReady: boolean;

  constructor(
    private readonly map: MapLibreMap,
    private readonly now: () => number,
  ) {
    this.canvas.width = this.canvas.height = SIZE;
    this.styleReady = map.isStyleLoaded() === true;
    map.on('styledataloading', () => {
      this.styleReady = false;
    });
    map.on('style.load', () => {
      this.styleReady = true;
      this.install();
    });
    void this.load();
    window.setInterval(() => this.update(), REFRESH_MS);
  }

  private async load(): Promise<void> {
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = BLACK_MARBLE;
      await image.decode();
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, SIZE, SIZE);
      const rgb = ctx.getImageData(0, 0, SIZE, SIZE).data;
      const lights = new Uint8Array(SIZE * SIZE);
      for (let i = 0; i < lights.length; i++) {
        const y = (0.299 * rgb[i * 4]! + 0.587 * rgb[i * 4 + 1]! + 0.114 * rgb[i * 4 + 2]!) / 255;
        // Land at night is dark blue (about 0.2) and ice a touch brighter; the
        // lights are bright and warm. Only what's clearly brighter counts.
        lights[i] = Math.round(255 * Math.min(1, Math.max(0, (y - 0.3) / 0.45)));
      }
      this.lights = lights;
      this.install();
    } catch {
      // Offline or blocked: the globe just has no city lights.
    }
  }

  private install(): void {
    const map = this.map;
    if (!this.lights || !this.styleReady || map.getSource(SOURCE)) return;
    map.addSource(SOURCE, {
      type: 'image',
      url: this.draw(),
      coordinates: [
        [-180, MAX_LAT],
        [180, MAX_LAT],
        [180, -MAX_LAT],
        [-180, -MAX_LAT],
      ],
    });
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer(
      {
        id: LAYER,
        type: 'raster',
        source: SOURCE,
        paint: {
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
          'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.75, 7, 0],
        },
      },
      firstSymbol,
    );
    // The credit rides on an empty source with a layer, the way the data credits do.
    map.addSource(CREDIT_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      attribution: '<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">Night lights: NASA Black Marble (GIBS)</a>',
    });
    map.addLayer({ id: CREDIT_SOURCE, type: 'circle', source: CREDIT_SOURCE });
  }

  private update(): void {
    if (!this.lights) return;
    this.map.getSource<ImageSource>(SOURCE)?.updateImage({ url: this.draw() });
  }

  /** The lights where it's night now, as a PNG data URL. Only lit pixels need the sun. */
  private draw(): string {
    const lights = this.lights!;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    const image = ctx.createImageData(SIZE, SIZE);
    const sun = subsolarPoint(this.now());
    for (let y = 0; y < SIZE; y++) {
      const yMerc = Math.PI * (1 - (2 * (y + 0.5)) / SIZE);
      const lat = (Math.atan(Math.sinh(yMerc)) * 180) / Math.PI;
      for (let x = 0; x < SIZE; x++) {
        const light = lights[y * SIZE + x]!;
        if (light === 0) continue;
        const elevation = solarElevation(sun, lat, ((x + 0.5) / SIZE) * 360 - 180);
        if (elevation > -2) continue;
        const t = Math.min(1, (-elevation - 2) / 8);
        const night = t * t * (3 - 2 * t);
        const i = (y * SIZE + x) * 4;
        image.data[i] = LIGHT[0];
        image.data[i + 1] = LIGHT[1];
        image.data[i + 2] = LIGHT[2];
        image.data[i + 3] = Math.round(light * night * MAX_ALPHA);
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
