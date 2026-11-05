import type { ImageSource, Map as MapLibreMap } from 'maplibre-gl';
import { solarElevation, subsolarPoint } from './sun';

const SOURCE = 'night';
const LAYER = 'night-shade';
/** The terminator moves a quarter of a degree a minute: once a minute is smooth enough. */
const REFRESH_MS = 60_000;
/** Pixels each way: a pixel is under a degree at the equator, and the edge is a soft gradient anyway. */
const SIZE = 512;
/** Web Mercator's limit: the image covers the map's whole square. */
const MAX_LAT = 85.0511;

/**
 * Day and night on the map: the side of the globe the sun has set on,
 * darkened, with twilight as a gradient (the sun 0-12° below the horizon),
 * and a thin line where the sun is setting. Drawn as one image in Mercator
 * rows (an image source is stretched in Mercator, so rows must be spaced
 * the same way) and redrawn
 * each minute. Above the basemap's land and sea, under its labels and all
 * of our layers, so it shades the world, never the tracks.
 */
export class NightLayer {
  private readonly canvas = document.createElement('canvas');

  constructor(
    private readonly map: MapLibreMap,
    private readonly now: () => number,
  ) {
    this.canvas.width = this.canvas.height = SIZE;
    map.on('style.load', () => this.install());
    if (map.isStyleLoaded()) this.install();
    window.setInterval(() => this.update(), REFRESH_MS);
  }

  private install(): void {
    const map = this.map;
    if (map.getSource(SOURCE)) return;
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
    map.addLayer({ id: LAYER, type: 'raster', source: SOURCE, paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstSymbol);
  }

  private update(): void {
    this.map.getSource<ImageSource>(SOURCE)?.updateImage({ url: this.draw() });
  }

  /** The shading for now, as a PNG data URL. */
  private draw(): string {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    const image = ctx.createImageData(SIZE, SIZE);
    const sun = subsolarPoint(this.now());
    for (let y = 0; y < SIZE; y++) {
      const lat = mercatorLat(y / SIZE);
      for (let x = 0; x < SIZE; x++) {
        const [r, g, b, alpha] = shade(solarElevation(sun, lat, (x / SIZE) * 360 - 180 + 180 / SIZE));
        if (alpha === 0) continue;
        const i = (y * SIZE + x) * 4;
        image.data[i] = r;
        image.data[i + 1] = g;
        image.data[i + 2] = b;
        image.data[i + 3] = alpha;
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}

/** Latitude of a Mercator row (0 top, 1 bottom), at the row's middle. */
function mercatorLat(t: number): number {
  const yMerc = Math.PI * (1 - 2 * (t + 0.5 / SIZE));
  return (Math.atan(Math.sinh(yMerc)) * 180) / Math.PI;
}

const DAY: Rgba = [40, 130, 210, 22];
const NIGHT: Rgba = [0, 2, 8, 165];
const GLOW: Rgba = [63, 182, 255, 30];
/** The dusk glow fades out this far either side of sunset (°). */
const GLOW_HALF_WIDTH_DEG = 3;
type Rgba = [number, number, number, number];

/**
 * The colour over a place with the sun this high (°). The basemap is
 * already near black, so darkening the night alone barely shows (tried):
 * the day side gets a faint blue wash, the night side goes darker through
 * twilight (full night 12° after sunset, nautical dusk), and sunset itself
 * is a faint, wide glow of the display's light. It was once a strong thin
 * line, but the image is stretched over the whole earth, so on the globe
 * the line swelled into a bright stripe that read as a rendering fault.
 */
export function shade(elevationDeg: number): Rgba {
  const g = Math.max(0, 1 - Math.abs(elevationDeg) / GLOW_HALF_WIDTH_DEG);
  const glowA = GLOW[3] * g * g * (3 - 2 * g);
  if (elevationDeg >= 0) {
    const dayA = DAY[3] * Math.min(1, elevationDeg / 8);
    // Whichever is stronger: the glow near sunset, the wash further into the day.
    return glowA > dayA ? [GLOW[0], GLOW[1], GLOW[2], Math.round(glowA)] : [DAY[0], DAY[1], DAY[2], Math.round(dayA)];
  }
  const t = Math.min(1, -elevationDeg / 12);
  const nightA = NIGHT[3] * t * t * (3 - 2 * t);
  if (glowA === 0) return [NIGHT[0], NIGHT[1], NIGHT[2], Math.round(nightA)];
  // Dusk: the glow over the deepening dark, mixed by how much each contributes.
  const w = glowA / (glowA + nightA);
  const mix = (i: 0 | 1 | 2) => Math.round(GLOW[i] * w + NIGHT[i] * (1 - w));
  return [mix(0), mix(1), mix(2), Math.round(Math.min(255, nightA + glowA * (1 - nightA / 255)))];
}
