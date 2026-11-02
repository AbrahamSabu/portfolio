import { renderLabel } from './labels';

/**
 * Airports from OurAirports (public domain), built by `npm run airports`
 * into data/airports.json: large and medium airports, and small ones with
 * scheduled flights. Drawn in the interface's light (--hud), never an
 * identity colour, and dimmer than any track: they're the map's furniture.
 */

export type AirportSize = 0 | 1 | 2;

export interface Airport {
  /** ICAO code where there is one, else OurAirports' own. */
  code: string;
  iata: string;
  name: string;
  city: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  lat: number;
  lon: number;
  /** 0 large, 1 medium, 2 small with scheduled flights. */
  size: AirportSize;
}

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** The data file's rows, checked one by one; bad rows are dropped. */
export function parseAirports(raw: unknown): Airport[] {
  if (!Array.isArray(raw)) return [];
  const out: Airport[] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const [code, iata, name, city, country, lat, lon, size] = row as unknown[];
    if (!text(code, 12) || !text(iata, 4) || !text(name, 120) || !name || !text(city, 80) || !text(country, 2)) continue;
    if (typeof lat !== 'number' || typeof lon !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (size !== 0 && size !== 1 && size !== 2) continue;
    out.push({ code, iata, name, city, country, lat, lon, size });
  }
  return out;
}

/** The short name on the map: the IATA code travellers know, else the ICAO code. */
export function airportCode(a: Pick<Airport, 'code' | 'iata'>): string {
  return a.iata || a.code;
}

/** "Cork International Airport", "Cork, Ireland", "ORK · EICK". */
export function describeAirport(a: Airport, countryName: (iso: string) => string | undefined): { title: string; kind: string; facts: string } {
  const country = countryName(a.country) ?? a.country;
  const place = a.city && !a.name.includes(a.city) ? `${a.city}, ${country}` : country;
  return { title: a.name, kind: place, facts: [a.iata, a.code].filter(Boolean).join(' · ') };
}

const ICON_PREFIX = 'apt:';
const LABEL_PREFIX = 'apt-lbl:';
const HUD = '63, 182, 255';
const LABEL_INK = 'rgba(150, 210, 245, 0.9)';

export function airportImageId(size: AirportSize): string {
  return ICON_PREFIX + size;
}

export function airportLabelImageId(label: string): string {
  return LABEL_PREFIX + label;
}

/**
 * A ring with a runway through it, like a chart's aerodrome symbol, drawn
 * as faint light. Large airports a little bigger and brighter.
 */
function renderAirportIcon(size: AirportSize, pixelRatio: number): { image: ImageData; pixelRatio: number } | null {
  const css = [18, 15, 13][size]!;
  const px = Math.round(css * pixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(px / 24, px / 24);
  const alpha = [0.85, 0.7, 0.6][size]!;
  ctx.lineCap = 'round';
  // A dark halo first, so it reads over coastlines and borders.
  for (const [style, width] of [['rgba(1, 6, 13, 0.85)', 4.5], [`rgba(${HUD}, ${alpha})`, 1.8]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(12, 12, 7.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6.5, 17.5);
    ctx.lineTo(17.5, 6.5);
    ctx.stroke();
  }
  return { image: ctx.getImageData(0, 0, px, px), pixelRatio };
}

/** Airport icons and labels for the map's image resolver; null when the id isn't ours. */
export function renderAirportImage(id: string, pixelRatio: number): { image: ImageData; pixelRatio: number } | null | undefined {
  if (id.startsWith(LABEL_PREFIX)) return renderLabel(id.slice(LABEL_PREFIX.length), pixelRatio, LABEL_INK);
  if (id.startsWith(ICON_PREFIX)) {
    const size = Number(id.slice(ICON_PREFIX.length));
    return size === 0 || size === 1 || size === 2 ? renderAirportIcon(size, pixelRatio) : null;
  }
  return undefined;
}

/** The same mark for the page (the map key), in the display's light. */
export function airportIconSvg(size = 16): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><g fill="none" stroke="#3FB6FF" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="7.5"/><path d="M6.5 17.5 17.5 6.5"/></g></svg>`;
}
