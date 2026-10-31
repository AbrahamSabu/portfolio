import type { AirportWeather } from '@watchfloor/shared';

type Json = Record<string, unknown>;
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const CATEGORIES = new Set(['VFR', 'MVFR', 'IFR', 'LIFR']);

/**
 * aviationweather.gov's METAR JSON (one station) to AirportWeather; null
 * when there's no report. Only known fields are copied, each checked: the
 * raw report and cloud covers go into the page as text.
 */
export function parseMetar(body: unknown): AirportWeather | null {
  const row = Array.isArray(body) ? (body[0] as Json | undefined) : undefined;
  if (!row || typeof row !== 'object') return null;
  const station = typeof row.icaoId === 'string' && /^[A-Z0-9]{4}$/.test(row.icaoId) ? row.icaoId : null;
  const observedS = num(row.obsTime);
  const raw = typeof row.rawOb === 'string' ? row.rawOb.replace(/[^ -~]/g, '').slice(0, 300) : '';
  if (!station || observedS === undefined || !raw) return null;
  const weather: AirportWeather = { station, observedAt: observedS * 1000, raw, clouds: [] };
  const set = <K extends keyof AirportWeather>(key: K, value: AirportWeather[K] | undefined) => {
    if (value !== undefined) weather[key] = value;
  };
  set('tempC', num(row.temp));
  set('dewpointC', num(row.dewp));
  set('windDir', row.wdir === 'VRB' ? 'VRB' : num(row.wdir));
  set('windKt', num(row.wspd));
  set('gustKt', num(row.wgst));
  set('visibility', typeof row.visib === 'string' || typeof row.visib === 'number' ? String(row.visib).slice(0, 8) : undefined);
  set('pressureHpa', num(row.altim));
  if (typeof row.fltCat === 'string' && CATEGORIES.has(row.fltCat)) weather.category = row.fltCat as AirportWeather['category'];
  if (Array.isArray(row.clouds)) {
    for (const c of row.clouds.slice(0, 6) as Json[]) {
      if (typeof c?.cover !== 'string' || !/^[A-Z]{2,4}$/.test(c.cover)) continue;
      const base = num(c.base);
      weather.clouds.push(base === undefined ? { cover: c.cover } : { cover: c.cover, baseFt: base });
    }
  }
  return weather;
}
