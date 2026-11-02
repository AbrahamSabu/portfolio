/**
 * A natural hazard on the map: an earthquake from the USGS, or a disaster
 * GDACS (the UN and European Commission's Global Disaster Alert and
 * Coordination System) is tracking: cyclones, floods, volcanoes, droughts
 * and wildfires. Facts as the source states them; GDACS's are automatic
 * estimates, and the card says so.
 */
export interface Hazard {
  /** Stable across polls: `usgs:<id>` or `gdacs:<type>:<eventid>`. */
  id: string;
  kind: HazardKind;
  source: 'usgs' | 'gdacs';
  /** As the source words it: "M 5.1 - 23 km SW of Lata, Solomon Islands". */
  title: string;
  lat: number;
  lon: number;
  /** When it happened or began (ms). */
  time: number;
  /** Earthquakes: magnitude, and depth in km. */
  magnitude?: number;
  depthKm?: number;
  /** GDACS's alert level: how much international help it may need. */
  alert?: HazardAlert;
  /** A severity line from the source, e.g. "Magnitude 4.9M, Depth:10km". */
  detail?: string;
  /** The source's page for it, https only. */
  url: string;
}

export type HazardKind = 'earthquake' | 'cyclone' | 'flood' | 'volcano' | 'drought' | 'wildfire';
export const HAZARD_KINDS: readonly HazardKind[] = ['earthquake', 'cyclone', 'flood', 'volcano', 'drought', 'wildfire'];
export type HazardAlert = 'green' | 'orange' | 'red';
const ALERTS: readonly HazardAlert[] = ['green', 'orange', 'red'];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** A hazard checked field by field, or null: its text and link go into the page. */
export function parseHazard(v: unknown): Hazard | null {
  if (typeof v !== 'object' || v === null) return null;
  const h = v as Record<string, unknown>;
  if (!text(h.id, 80) || !text(h.title, 200) || !text(h.url, 500) || !/^https:\/\//i.test(h.url)) return null;
  if (!HAZARD_KINDS.includes(h.kind as HazardKind) || (h.source !== 'usgs' && h.source !== 'gdacs')) return null;
  if (!finite(h.lat) || !finite(h.lon) || Math.abs(h.lat) > 90 || Math.abs(h.lon) > 180 || !finite(h.time)) return null;
  const hazard: Hazard = { id: h.id, kind: h.kind as HazardKind, source: h.source, title: h.title, lat: h.lat, lon: h.lon, time: h.time, url: h.url };
  if (finite(h.magnitude) && h.magnitude > -2 && h.magnitude < 11) hazard.magnitude = h.magnitude;
  if (finite(h.depthKm) && h.depthKm > -10 && h.depthKm < 1000) hazard.depthKm = h.depthKm;
  if (ALERTS.includes(h.alert as HazardAlert)) hazard.alert = h.alert as HazardAlert;
  if (text(h.detail, 200)) hazard.detail = h.detail;
  return hazard;
}
